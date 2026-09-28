import 'dart:io';
import 'dart:isolate';
import 'dart:typed_data';

import 'package:image/image.dart' as img;

import 'workflow_tflite_stub.dart'
    if (dart.library.ui) 'workflow_tflite_flutter.dart'
    as tflite;

/// Why [AyniSdk.run] could not execute a workflow, in
/// [WorkflowError.category].
enum WorkflowErrorCategory {
  /// The workflow is not installed on the device: it was never synced, its
  /// definition file is missing, or the storage could not be read.
  ///
  /// Run [AyniSdk.sync] and try again.
  workflowNotAvailable,

  /// A model the workflow needs is not installed or its file no longer
  /// matches its SHA-256 hash; [WorkflowError.modelVersionId] names it.
  modelNotAvailable,

  /// The input is empty or is not an image the SDK can decode.
  invalidInput,

  /// A model node declares an image input the SDK does not support (size,
  /// channels, or normalization); [WorkflowError.nodeId] names the node.
  unsupportedInputContract,

  /// The installed workflow definition is not valid or cannot be executed,
  /// for example because a condition branch never reaches an output.
  invalidWorkflow,

  /// A model returned tensors that do not match the output its node
  /// declares, such as a score outside `0`–`1` or a wrong number of labels.
  modelOutputInvalid,

  /// A condition node did not receive a classification with the label it
  /// compares.
  conditionInputMissing,

  /// An output node did not receive a value from its source node.
  outputInputMissing,

  /// The execution finished without reaching any output node.
  outputNotReached,

  /// An unexpected failure happened while running the workflow, such as a
  /// model that fails during inference.
  runtimeError,
}

/// The error [AyniSdk.run] throws when a workflow cannot be executed.
///
/// No partial result is returned: the workflow either completes with a
/// [WorkflowResult] or throws this error.
class WorkflowError implements Exception {
  /// Creates an error of [category], optionally naming the node and the model
  /// version involved.
  ///
  /// The SDK throws these errors; apps only catch and read them.
  const WorkflowError(this.category, {this.nodeId, this.modelVersionId});

  /// Why the workflow could not be executed.
  final WorkflowErrorCategory category;

  /// The ID of the workflow node that failed, or `null` when the error does
  /// not come from a single node.
  final String? nodeId;

  /// The model version involved in the failure, or `null` when no model is
  /// involved.
  final String? modelVersionId;
}

/// The outputs of a successful [AyniSdk.run].
class WorkflowResult {
  /// Creates the result of running version [workflowVersion] of
  /// [workflowId].
  ///
  /// [usingOfflineCache] defaults to `true`. The SDK creates these results;
  /// apps only read them.
  const WorkflowResult({
    required this.workflowId,
    required this.workflowVersion,
    required this.outputs,
    this.usingOfflineCache = true,
  });

  /// The ID of the workflow that ran.
  final String workflowId;

  /// The installed version of the workflow that ran, such as `1.2.0`.
  final String workflowVersion;

  /// The value of each output node the execution reached, keyed by the
  /// output's name.
  ///
  /// It is never empty: an execution that reaches no output throws
  /// [WorkflowErrorCategory.outputNotReached] instead.
  final Map<String, WorkflowValue> outputs;

  /// Whether the workflow ran from the resources stored on the device, which
  /// [AyniSdk.run] always does.
  final bool usingOfflineCache;
}

/// A value a workflow node produced: a [ClassificationResult], a
/// [DetectionResult], or a [BooleanResult].
///
/// The class is sealed, so a `switch` over its subtypes is exhaustive.
sealed class WorkflowValue {
  /// Creates the value produced by node [nodeId].
  const WorkflowValue(this.nodeId);

  /// The ID of the workflow node that produced this value.
  final String nodeId;
}

/// The output of a classification model node.
class ClassificationResult extends WorkflowValue {
  /// Creates a classification whose best [label] scored [confidence].
  const ClassificationResult(
    super.nodeId,
    this.label,
    this.confidence,
    this.confidences,
  );

  /// The label with the highest score.
  final String label;

  /// The score of [label], from `0` to `1`.
  final double confidence;

  /// The score of every label the model declares, from `0` to `1`.
  final Map<String, double> confidences;
}

/// One object found by a detection model node.
class Detection {
  /// Creates a detection of [label] inside the given box.
  const Detection(
    this.label,
    this.confidence,
    this.xMin,
    this.yMin,
    this.xMax,
    this.yMax,
  );

  /// The label of the detected object.
  final String label;

  /// The detection score, from `0` to `1`.
  final double confidence;

  /// The box's left edge, relative to the image width (`0` to `1`).
  final double xMin;

  /// The box's top edge, relative to the image height (`0` to `1`).
  final double yMin;

  /// The box's right edge, relative to the image width (`0` to `1`).
  final double xMax;

  /// The box's bottom edge, relative to the image height (`0` to `1`).
  final double yMax;
}

/// The output of a detection model node.
class DetectionResult extends WorkflowValue {
  /// Creates the result of node [nodeId] with its [detections].
  const DetectionResult(super.nodeId, this.detections);

  /// The objects whose score reached the node's score threshold; it can be
  /// empty.
  final List<Detection> detections;
}

/// The output of a condition node.
class BooleanResult extends WorkflowValue {
  /// Creates the result of condition node [nodeId].
  const BooleanResult(super.nodeId, this.value);

  /// Whether the condition held for the classification it evaluated.
  final bool value;
}

/// Whether the [branchPort] branch of condition node [conditionId] leads to
/// an output node.
///
/// [nodes] maps each node ID to its JSON definition, [outgoing] maps a node ID
/// to the nodes it feeds, and [connections] is the definition's connection
/// list. The SDK uses it to reject a workflow whose taken branch reaches no
/// output.
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

/// Runs a validated workflow definition on the device.
class WorkflowExecutor {
  /// Creates an executor that loads models from [storageDirectory].
  WorkflowExecutor(this.storageDirectory);

  /// The directory where the installed models live.
  final Directory storageDirectory;

  /// Checks that [bytes] is a decodable image and that every model node of
  /// [definition] declares a supported image input.
  ///
  /// Throws a [WorkflowError] with [WorkflowErrorCategory.invalidInput] or
  /// [WorkflowErrorCategory.unsupportedInputContract] otherwise.
  Future<void> validateInputAndContracts(
    Map<String, dynamic> definition,
    Uint8List bytes,
  ) async {
    final isDecodable = bytes.isEmpty
        ? false
        : await Isolate.run(() => img.decodeImage(bytes) != null);
    if (!isDecodable) {
      throw const WorkflowError(WorkflowErrorCategory.invalidInput);
    }
    for (final node in (definition['nodes'] as List).cast<Map>()) {
      if (node['type'] != 'model.tflite') continue;
      _parseInputContract(node, node['id'] as String);
    }
  }

  /// Runs [definition] on [imageBytes] and returns the value of each output
  /// node it reaches.
  ///
  /// Throws a [WorkflowError] when the workflow cannot complete.
  Future<WorkflowResult> execute({
    required String workflowId,
    required String workflowVersion,
    required Map<String, dynamic> definition,
    required Uint8List imageBytes,
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
              values[id] = imageBytes;
            case 'model.tflite':
              final parent = (incoming[id] ?? []).firstWhere(
                (p) => byId[p]!['type'] == 'input.image',
                orElse: () => '',
              );
              if (parent.isEmpty || values[parent] is! Uint8List)
                throw WorkflowError(
                  WorkflowErrorCategory.invalidWorkflow,
                  nodeId: id,
                );
              values[id] = await _infer(node, imageBytes, id);
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
    Uint8List imageBytes,
    String nodeId,
  ) async {
    final contract = _parseInputContract(node, nodeId);
    final width = contract.width,
        height = contract.height,
        channels = contract.channels;
    final input = await Isolate.run(
      () => _prepareImageTensor(
        imageBytes,
        width,
        height,
        channels,
        contract.normalization,
      ),
    );
    final versionId = node['modelVersionId'] as String;
    final modelFile = File(
      '${storageDirectory.path}/$versionId/$versionId.tflite',
    );
    try {
      final inference = await tflite.runModel(
        modelPath: modelFile.path,
        inputBytes: input.buffer.asUint8List(
          input.offsetInBytes,
          input.lengthInBytes,
        ),
        acceptedInputShapes: [
          [1, height, width, channels],
          [height, width, channels],
        ],
      );
      if (inference.error == 'modelNotAvailable') {
        throw WorkflowError(
          WorkflowErrorCategory.modelNotAvailable,
          nodeId: nodeId,
          modelVersionId: versionId,
        );
      }
      if (inference.error == 'unsupportedInputContract') {
        throw WorkflowError(
          WorkflowErrorCategory.unsupportedInputContract,
          nodeId: nodeId,
        );
      }
      if (inference.error == 'runtimeError') {
        throw WorkflowError(
          WorkflowErrorCategory.runtimeError,
          nodeId: nodeId,
          modelVersionId: versionId,
        );
      }
      if (inference.error != null) {
        throw WorkflowError(
          WorkflowErrorCategory.modelOutputInvalid,
          nodeId: nodeId,
        );
      }
      final tensors = inference.outputs;
      final result = ((node['outputs'] as Map)['result'] as Map);
      final labels = (result['labels'] as List).cast<String>();
      if (result['type'] == 'classification') {
        if (tensors.isEmpty) {
          throw WorkflowError(
            WorkflowErrorCategory.modelOutputInvalid,
            nodeId: nodeId,
          );
        }
        final scores = tensors[0].values;
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
      final boxes = tensors[boxIndex].values;
      final vectors = <Float32List>[];
      for (var i = 0; i < tensors.length; i++) {
        if (i != boxIndex &&
            tensors[i].shape.length == 2 &&
            tensors[i].shape.first == 1 &&
            tensors[i].shape.last == boxes.length ~/ 4) {
          vectors.add(tensors[i].values);
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

Float32List _prepareImageTensor(
  Uint8List imageBytes,
  int width,
  int height,
  int channels,
  String normalization,
) {
  final decoded = img.decodeImage(imageBytes);
  if (decoded == null) throw const FormatException('Invalid image.');
  final uint8Image =
      decoded.format == img.Format.uint8 && decoded.palette == null
      ? decoded
      : decoded.convert(format: img.Format.uint8, withPalette: false);
  final resized = img.copyResize(uint8Image, width: width, height: height);
  final input = Float32List(width * height * channels);
  var index = 0;
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      final pixel = resized.getPixel(x, y);
      final values = [pixel.r, pixel.g, pixel.b, pixel.a];
      for (var c = 0; c < channels; c++) {
        var value = values[channels == 1 ? 0 : c].toDouble();
        if (channels == 1) value = (pixel.r + pixel.g + pixel.b) / 3;
        input[index++] = switch (normalization) {
          'none' => value,
          'zero_to_one' => value / 255,
          'minus_one_to_one' => value / 127.5 - 1,
          _ => throw const FormatException('Unsupported normalization.'),
        };
      }
    }
  }
  return input;
}
