import 'dart:io';
import 'dart:typed_data';

import 'package:image/image.dart' as img;
import 'package:tflite_flutter/tflite_flutter.dart';

enum WorkflowErrorCategory {
  workflowNotAvailable,
  modelNotAvailable,
  invalidInput,
  unsupportedInputContract,
  invalidWorkflow,
  modelOutputInvalid,
  conditionInputMissing,
  outputInputMissing,
  outputNotReached,
  runtimeError,
}

class WorkflowError implements Exception {
  const WorkflowError(this.category, {this.nodeId, this.modelVersionId});
  final WorkflowErrorCategory category;
  final String? nodeId;
  final String? modelVersionId;
}

class WorkflowResult {
  const WorkflowResult({
    required this.workflowId,
    required this.workflowVersion,
    required this.outputs,
    this.usingOfflineCache = true,
  });
  final String workflowId;
  final String workflowVersion;
  final Map<String, WorkflowValue> outputs;
  final bool usingOfflineCache;
}

sealed class WorkflowValue {
  const WorkflowValue(this.nodeId);
  final String nodeId;
}

class ClassificationResult extends WorkflowValue {
  const ClassificationResult(
    super.nodeId,
    this.label,
    this.confidence,
    this.confidences,
  );
  final String label;
  final double confidence;
  final Map<String, double> confidences;
}

class Detection {
  const Detection(
    this.label,
    this.confidence,
    this.xMin,
    this.yMin,
    this.xMax,
    this.yMax,
  );
  final String label;
  final double confidence;
  final double xMin, yMin, xMax, yMax;
}

class DetectionResult extends WorkflowValue {
  const DetectionResult(super.nodeId, this.detections);
  final List<Detection> detections;
}

class BooleanResult extends WorkflowValue {
  const BooleanResult(super.nodeId, this.value);
  final bool value;
}

bool workflowBranchReachesOutput({
  required String conditionId,
  required String branchPort,
  required Map<String, Map> nodes,
  required Map<String, List<String>> outgoing,
  required List<Map> connections,
}) {
  final pending = <String>[
    ...connections
        .where(
          (edge) =>
              edge['sourceNodeId'] == conditionId &&
              edge['sourcePort'] == branchPort,
        )
        .map((edge) => edge['targetNodeId'] as String),
    ...nodes.entries
        .where(
          (entry) =>
              entry.value['type'] == 'output' &&
              entry.value['sourceNodeId'] == conditionId &&
              entry.value['sourcePort'] == branchPort,
        )
        .map((entry) => entry.key),
  ];
  final visited = <String>{};
  while (pending.isNotEmpty) {
    final id = pending.removeLast();
    if (!visited.add(id)) continue;
    if (nodes[id]?['type'] == 'output') return true;
    pending.addAll(outgoing[id] ?? const []);
  }
  return false;
}

class WorkflowExecutor {
  WorkflowExecutor(this.storageDirectory);
  final Directory storageDirectory;

  img.Image validateInputAndContracts(
    Map<String, dynamic> definition,
    Uint8List bytes,
  ) {
    final decoded = bytes.isEmpty ? null : img.decodeImage(bytes);
    if (decoded == null) {
      throw const WorkflowError(WorkflowErrorCategory.invalidInput);
    }
    for (final node in (definition['nodes'] as List).cast<Map>()) {
      if (node['type'] != 'model.tflite') continue;
      _parseInputContract(node, node['id'] as String);
    }
    return decoded;
  }

  Future<WorkflowResult> execute({
    required String workflowId,
    required String workflowVersion,
    required Map<String, dynamic> definition,
    required img.Image decodedImage,
  }) async {
    try {
      final nodes = (definition['nodes'] as List).cast<Map>();
      final connections = ((definition['connections'] as List?) ?? const [])
          .cast<Map>();
      final byId = {for (final node in nodes) node['id'] as String: node};
      final incoming = <String, List<String>>{};
      final outgoing = <String, List<String>>{};
      void edge(String from, String to) {
        (outgoing[from] ??= []).add(to);
        (incoming[to] ??= []).add(from);
      }

      for (final c in connections) {
        edge(c['sourceNodeId'], c['targetNodeId']);
      }
      for (final n in nodes) {
        if (n['type'] == 'condition' || n['type'] == 'output')
          edge(n['sourceNodeId'], n['id']);
      }
      final degree = {
        for (final n in nodes)
          n['id'] as String: incoming[n['id']]?.length ?? 0,
      };
      final ready = degree.entries
          .where((e) => e.value == 0)
          .map((e) => e.key)
          .toList();
      final values = <String, Object>{};
      final active = {
        for (final n in nodes)
          if (n['type'] == 'input.image') n['id'] as String,
      };
      final outputs = <String, WorkflowValue>{};
      var completed = 0;
      while (ready.isNotEmpty) {
        final id = ready.removeAt(0), node = byId[id]!;
        completed++;
        if (active.contains(id))
          switch (node['type']) {
            case 'input.image':
              values[id] = decodedImage;
            case 'model.tflite':
              final parent = (incoming[id] ?? []).firstWhere(
                (p) => byId[p]!['type'] == 'input.image',
                orElse: () => '',
              );
              if (parent.isEmpty || values[parent] is! img.Image)
                throw WorkflowError(
                  WorkflowErrorCategory.invalidWorkflow,
                  nodeId: id,
                );
              values[id] = await _infer(node, decodedImage, id);
            case 'condition':
              final source = values[node['sourceNodeId']];
              if (source is! ClassificationResult ||
                  !source.confidences.containsKey(node['label']))
                throw WorkflowError(
                  WorkflowErrorCategory.conditionInputMissing,
                  nodeId: id,
                );
              final truth = _compare(
                source.confidences[node['label']]!,
                node['operator'],
                (node['threshold'] as num).toDouble(),
              );
              values[id] = BooleanResult(id, truth);
              final port = truth ? 'true' : 'false';
              if (!workflowBranchReachesOutput(
                conditionId: id,
                branchPort: port,
                nodes: byId,
                outgoing: outgoing,
                connections: connections,
              )) {
                throw WorkflowError(
                  WorkflowErrorCategory.invalidWorkflow,
                  nodeId: id,
                );
              }
              active.addAll(
                connections
                    .where(
                      (c) => c['sourceNodeId'] == id && c['sourcePort'] == port,
                    )
                    .map((c) => c['targetNodeId'] as String),
              );
            case 'output':
              final source = values[node['sourceNodeId']];
              if (source is! WorkflowValue)
                throw WorkflowError(
                  WorkflowErrorCategory.outputInputMissing,
                  nodeId: id,
                );
              final port = node['sourcePort'];
              if (source is BooleanResult && ((port == 'true') != source.value))
                break;
              outputs[node['name'] as String] = source;
          }
        for (final to in outgoing[id] ?? const <String>[]) {
          if (active.contains(id) &&
              (byId[to]!['type'] == 'condition' ||
                  byId[to]!['type'] == 'output')) {
            final n = byId[to]!;
            if (n['sourceNodeId'] == id &&
                n['type'] == 'condition' &&
                values[id] is ClassificationResult)
              active.add(to);
            if (n['sourceNodeId'] == id &&
                n['type'] == 'output' &&
                (n['sourcePort'] == 'result' ||
                    values[id] is BooleanResult &&
                        ((n['sourcePort'] == 'true') ==
                            (values[id] as BooleanResult).value)))
              active.add(to);
          } else if (active.contains(id)) {
            final source = byId[id]!;
            final connection = connections.firstWhere(
              (c) => c['sourceNodeId'] == id && c['targetNodeId'] == to,
            );
            if (source['type'] != 'condition' ||
                values[id] is BooleanResult &&
                    connection['sourcePort'] ==
                        ((values[id] as BooleanResult).value
                            ? 'true'
                            : 'false')) {
              active.add(to);
            }
          }
          degree[to] = degree[to]! - 1;
          if (degree[to] == 0) ready.add(to);
        }
      }
      if (completed != nodes.length)
        throw const WorkflowError(WorkflowErrorCategory.invalidWorkflow);
      if (outputs.isEmpty)
        throw const WorkflowError(WorkflowErrorCategory.outputNotReached);
      return WorkflowResult(
        workflowId: workflowId,
        workflowVersion: workflowVersion,
        outputs: outputs,
      );
    } on WorkflowError {
      rethrow;
    } catch (_) {
      throw const WorkflowError(WorkflowErrorCategory.runtimeError);
    }
  }

  ({int width, int height, int channels, String normalization})
  _parseInputContract(Map node, String nodeId) {
    final inputs = node['inputs'];
    final contract = inputs is Map ? inputs['image'] : null;
    if (contract is! Map ||
        contract['type'] != 'image' ||
        contract['width'] is! int ||
        contract['width'] < 1 ||
        contract['width'] > 8192 ||
        contract['height'] is! int ||
        contract['height'] < 1 ||
        contract['height'] > 8192 ||
        ![1, 3, 4].contains(contract['channels']) ||
        ![
          'none',
          'zero_to_one',
          'minus_one_to_one',
        ].contains(contract['normalization'])) {
      throw WorkflowError(
        WorkflowErrorCategory.unsupportedInputContract,
        nodeId: nodeId,
      );
    }
    return (
      width: contract['width'] as int,
      height: contract['height'] as int,
      channels: contract['channels'] as int,
      normalization: contract['normalization'] as String,
    );
  }

  Future<WorkflowValue> _infer(
    Map node,
    img.Image decoded,
    String nodeId,
  ) async {
    final contract = _parseInputContract(node, nodeId);
    final width = contract.width,
        height = contract.height,
        channels = contract.channels;
    final resized = img.copyResize(decoded, width: width, height: height);
    final input = Float32List(width * height * channels);
    var index = 0;
    for (var y = 0; y < height; y++) {
      for (var x = 0; x < width; x++) {
        final pixel = resized.getPixel(x, y);
        final values = [pixel.r, pixel.g, pixel.b, pixel.a];
        for (var c = 0; c < channels; c++) {
          var v = values[channels == 1 ? 0 : c].toDouble();
          if (channels == 1) v = (pixel.r + pixel.g + pixel.b) / 3;
          input[index++] = switch (contract.normalization) {
            'none' => v,
            'zero_to_one' => v / 255,
            'minus_one_to_one' => v / 127.5 - 1,
            _ => throw WorkflowError(
              WorkflowErrorCategory.unsupportedInputContract,
              nodeId: nodeId,
            ),
          };
        }
      }
    }
    final versionId = node['modelVersionId'] as String;
    final modelFile = File(
      '${storageDirectory.path}/$versionId/$versionId.tflite',
    );
    Interpreter? interpreter;
    try {
      interpreter = Interpreter.fromFile(modelFile);
      final inputTensor = interpreter.getInputTensor(0);
      final shape = inputTensor.shape;
      final shapeMatches =
          (shape.length == 4 &&
              shape[0] == 1 &&
              shape[1] == height &&
              shape[2] == width &&
              shape[3] == channels) ||
          (shape.length == 3 &&
              shape[0] == height &&
              shape[1] == width &&
              shape[2] == channels);
      if (interpreter.getInputTensors().length != 1 ||
          inputTensor.type != TensorType.float32 ||
          !shapeMatches) {
        throw WorkflowError(
          WorkflowErrorCategory.unsupportedInputContract,
          nodeId: nodeId,
        );
      }
      final tensors = interpreter.getOutputTensors();
      if (tensors.any((tensor) => tensor.type != TensorType.float32)) {
        throw WorkflowError(
          WorkflowErrorCategory.modelOutputInvalid,
          nodeId: nodeId,
        );
      }
      final outputBuffers = <int, Object>{};
      for (var i = 0; i < tensors.length; i++) {
        final count = tensors[i].shape.fold<int>(1, (a, b) => a * b);
        outputBuffers[i] = Float32List(count);
      }
      interpreter.runForMultipleInputs([input], outputBuffers);
      final result = ((node['outputs'] as Map)['result'] as Map);
      final labels = (result['labels'] as List).cast<String>();
      if (result['type'] == 'classification') {
        final scores = (outputBuffers[0] as Float32List);
        if (scores.length != labels.length ||
            scores.any((s) => !s.isFinite || s < 0 || s > 1))
          throw WorkflowError(
            WorkflowErrorCategory.modelOutputInvalid,
            nodeId: nodeId,
          );
        var best = 0;
        for (var i = 1; i < scores.length; i++) {
          if (scores[i] > scores[best]) best = i;
        }
        return ClassificationResult(
          nodeId,
          labels[best],
          scores[best].toDouble(),
          {
            for (var i = 0; i < labels.length; i++)
              labels[i]: scores[i].toDouble(),
          },
        );
      }
      final boxIndex = tensors.indexWhere(
        (t) => t.shape.length == 3 && t.shape.first == 1 && t.shape.last == 4,
      );
      if (tensors.length != 4 || boxIndex < 0) {
        throw WorkflowError(
          WorkflowErrorCategory.modelOutputInvalid,
          nodeId: nodeId,
        );
      }
      final boxes = outputBuffers[boxIndex] as Float32List;
      final vectors = <Float32List>[];
      for (var i = 0; i < tensors.length; i++) {
        if (i != boxIndex &&
            tensors[i].shape.length == 2 &&
            tensors[i].shape.first == 1 &&
            tensors[i].shape.last == boxes.length ~/ 4) {
          vectors.add(outputBuffers[i] as Float32List);
        }
      }
      if (vectors.length < 2) {
        throw WorkflowError(
          WorkflowErrorCategory.modelOutputInvalid,
          nodeId: nodeId,
        );
      }
      final scores = vectors.firstWhere(
        (v) => v.every((score) => score.isFinite && score >= 0 && score <= 1),
        orElse: () => throw WorkflowError(
          WorkflowErrorCategory.modelOutputInvalid,
          nodeId: nodeId,
        ),
      );
      final classes = vectors.firstWhere(
        (v) =>
            !identical(v, scores) &&
            v.every(
              (label) => label.isFinite && label == label.roundToDouble(),
            ),
        orElse: () => throw WorkflowError(
          WorkflowErrorCategory.modelOutputInvalid,
          nodeId: nodeId,
        ),
      );
      final threshold = (result['scoreThreshold'] as num).toDouble();
      final detections = <Detection>[];
      for (var i = 0; i < scores.length; i++) {
        final score = scores[i],
            labelIndex = classes[i].toInt(),
            y0 = boxes[i * 4],
            x0 = boxes[i * 4 + 1],
            y1 = boxes[i * 4 + 2],
            x1 = boxes[i * 4 + 3];
        if (score < threshold) continue;
        if (labelIndex < 0 ||
            labelIndex >= labels.length ||
            [x0, y0, x1, y1].any((v) => !v.isFinite || v < 0 || v > 1) ||
            x0 >= x1 ||
            y0 >= y1)
          continue;
        detections.add(
          Detection(
            labels[labelIndex],
            score.toDouble(),
            x0.toDouble(),
            y0.toDouble(),
            x1.toDouble(),
            y1.toDouble(),
          ),
        );
      }
      if (detections.isEmpty && labels.isEmpty)
        throw WorkflowError(
          WorkflowErrorCategory.modelOutputInvalid,
          nodeId: nodeId,
        );
      return DetectionResult(nodeId, detections);
    } on WorkflowError catch (error) {
      throw WorkflowError(
        error.category,
        nodeId: error.nodeId ?? nodeId,
        modelVersionId: error.modelVersionId ?? versionId,
      );
    } on FileSystemException {
      throw WorkflowError(
        WorkflowErrorCategory.modelNotAvailable,
        nodeId: nodeId,
        modelVersionId: versionId,
      );
    } catch (_) {
      throw WorkflowError(
        WorkflowErrorCategory.runtimeError,
        nodeId: nodeId,
        modelVersionId: versionId,
      );
    } finally {
      try {
        interpreter?.close();
      } catch (_) {}
    }
  }

  bool _compare(double value, String operator, double threshold) =>
      switch (operator) {
        'gte' => value >= threshold,
        'gt' => value > threshold,
        'lte' => value <= threshold,
        'lt' => value < threshold,
        _ => false,
      };
}
