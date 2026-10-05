import 'dart:io';
import 'dart:isolate';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:tflite_flutter/tflite_flutter.dart';

import '../data/validation_model_repository.dart';
import '../data/workflow_definition_repository.dart';
import '../models/experiment_plan.dart';
import '../models/validation_run_record.dart';
import 'validation_condition_runner.dart';
import 'validation_image_preprocessor.dart';
import 'validation_output_normalizer.dart';

abstract interface class ValidationTfliteEngine {
  Future<List<ValidationTensor>> run({
    required File modelFile,
    required Uint8List imageBytes,
    required ValidationInputContract inputContract,
  });
}

class TfliteCpuInferenceEngine implements ValidationTfliteEngine {
  const TfliteCpuInferenceEngine();

  @override
  Future<List<ValidationTensor>> run({
    required File modelFile,
    required Uint8List imageBytes,
    required ValidationInputContract inputContract,
  }) => Isolate.run(
    () => _runTfliteCpu(
      modelFile.path,
      imageBytes,
      inputContract.width,
      inputContract.height,
      inputContract.channels,
      inputContract.normalization,
    ),
  );
}

class DirectTfliteRunner implements ValidationConditionRunner {
  DirectTfliteRunner({
    required ValidationResourceProfile profile,
    required ValidationModelRepository modelRepository,
    required WorkflowDefinitionRepository workflowDefinitions,
    ValidationTfliteEngine inferenceEngine = const TfliteCpuInferenceEngine(),
    ValidationOutputNormalizer outputNormalizer =
        const ValidationOutputNormalizer(),
  }) : _profile = profile,
       _modelRepository = modelRepository,
       _workflowDefinitions = workflowDefinitions,
       _inferenceEngine = inferenceEngine,
       _outputNormalizer = outputNormalizer;

  final ValidationResourceProfile _profile;
  final ValidationModelRepository _modelRepository;
  final WorkflowDefinitionRepository _workflowDefinitions;
  final ValidationTfliteEngine _inferenceEngine;
  final ValidationOutputNormalizer _outputNormalizer;
  Map<String, VerifiedModelArtifact> _artifacts = const {};
  Map<String, Object?>? _workflow;

  List<ValidationRunModelArtifact> get _modelArtifacts => [
    for (final requirement in _profile.modelRequirements)
      ValidationRunModelArtifact(
        nodeId: requirement.nodeId,
        modelVersionId: requirement.modelVersionId,
        sha256: requirement.sha256,
      ),
  ];
  bool _runActive = false;
  bool _cancelRequested = false;

  @override
  ValidationCondition get condition => ValidationCondition.control;

  String get backend => 'CPU';

  @override
  Future<void> prepare() async {
    if (!_profile.isConfigured) {
      throw const ValidationExecutionException(
        'resourcesNotConfigured',
        'Configura las versiones publicadas del perfil antes de preparar.',
      );
    }
    final definition = await _workflowDefinitions.fetch(
      _profile.workflowVersionId,
    );
    final graph = _validateWorkflow(definition);
    final artifacts = <String, VerifiedModelArtifact>{};
    for (final requirement in _profile.modelRequirements) {
      final artifact = await _modelRepository.prepare(requirement);
      if (artifact.modelVersionId != requirement.modelVersionId ||
          artifact.sha256 != requirement.sha256 ||
          !RegExp(r'^[0-9a-f]{64}$').hasMatch(artifact.sha256) ||
          !await artifact.file.exists() ||
          !modelContractMatchesRequirement(artifact.contract, requirement)) {
        throw const ValidationExecutionException(
          'modelDoesNotMatchProfile',
          'El modelo descargado no coincide con el perfil de validación.',
        );
      }
      artifacts[requirement.nodeId] = artifact;
    }
    _artifacts = Map.unmodifiable(artifacts);
    _workflow = graph;
  }

  @override
  Future<ConditionRunResult> runCase(ValidationRunRequest request) async {
    final workflow = _workflow;
    if (workflow == null ||
        _artifacts.length != _profile.modelRequirements.length) {
      throw const ValidationExecutionException(
        'runnerNotPrepared',
        'Prepara los recursos antes de ejecutar el lote.',
      );
    }
    // Legacy singleton fields summarize the first profile model.
    final primaryRequirement = _profile.modelRequirements.first;
    final primaryArtifact = _artifacts[primaryRequirement.nodeId]!;
    try {
      validateRequestDataset(request, _profile);
      if (sha256.convert(request.inputBytes).toString() !=
          request.inputSha256) {
        throw const ValidationExecutionException(
          'inputHashMismatch',
          'La imagen del lote no coincide con su SHA-256 verificado.',
        );
      }
    } on ValidationExecutionException catch (error) {
      return ConditionRunResult.failure(
        durationMicros: 0,
        modelVersionId: primaryArtifact.modelVersionId,
        modelSha256: primaryArtifact.sha256,
        modelArtifacts: _modelArtifacts,
        errorCode: error.code,
        errorMessage: error.message,
      );
    }
    final stopwatch = Stopwatch()..start();
    _runActive = true;
    _cancelRequested = false;
    try {
      final output = await _executeWorkflow(workflow, request.inputBytes);
      stopwatch.stop();
      if (_cancelRequested) {
        return ConditionRunResult.cancelled(
          durationMicros: stopwatch.elapsedMicroseconds,
          modelVersionId: primaryArtifact.modelVersionId,
          modelSha256: primaryArtifact.sha256,
          modelArtifacts: _modelArtifacts,
          workflowVersionId: _profile.workflowVersionId,
          workflowVersion: _profile.workflowVersion,
        );
      }
      return ConditionRunResult.success(
        durationMicros: stopwatch.elapsedMicroseconds,
        modelVersionId: primaryArtifact.modelVersionId,
        modelSha256: primaryArtifact.sha256,
        modelArtifacts: _modelArtifacts,
        workflowVersionId: _profile.workflowVersionId,
        workflowVersion: _profile.workflowVersion,
        normalizedOutput: output,
      );
    } on ValidationExecutionException catch (error) {
      stopwatch.stop();
      if (_cancelRequested || error.code == 'cancelled') {
        return ConditionRunResult.cancelled(
          durationMicros: stopwatch.elapsedMicroseconds,
          modelVersionId: primaryArtifact.modelVersionId,
          modelSha256: primaryArtifact.sha256,
          modelArtifacts: _modelArtifacts,
          workflowVersionId: _profile.workflowVersionId,
          workflowVersion: _profile.workflowVersion,
        );
      }
      return ConditionRunResult.failure(
        durationMicros: stopwatch.elapsedMicroseconds,
        modelVersionId: primaryArtifact.modelVersionId,
        modelSha256: primaryArtifact.sha256,
        modelArtifacts: _modelArtifacts,
        workflowVersionId: _profile.workflowVersionId,
        workflowVersion: _profile.workflowVersion,
        errorCode: error.code,
        errorMessage: error.message,
      );
    } on ValidationOutputException catch (error) {
      stopwatch.stop();
      return ConditionRunResult.failure(
        durationMicros: stopwatch.elapsedMicroseconds,
        modelVersionId: primaryArtifact.modelVersionId,
        modelSha256: primaryArtifact.sha256,
        modelArtifacts: _modelArtifacts,
        workflowVersionId: _profile.workflowVersionId,
        workflowVersion: _profile.workflowVersion,
        errorCode: error.code,
        errorMessage:
            'La salida del modelo no coincide con el contrato publicado.',
      );
    } on Object {
      stopwatch.stop();
      return ConditionRunResult.failure(
        durationMicros: stopwatch.elapsedMicroseconds,
        modelVersionId: primaryArtifact.modelVersionId,
        modelSha256: primaryArtifact.sha256,
        modelArtifacts: _modelArtifacts,
        workflowVersionId: _profile.workflowVersionId,
        workflowVersion: _profile.workflowVersion,
        errorCode: 'inferenceFailed',
        errorMessage: 'No se pudo ejecutar el modelo local.',
      );
    } finally {
      _runActive = false;
      _cancelRequested = false;
    }
  }

  @override
  Future<void> close() async {}

  @override
  Future<void> cancelActive() async {
    if (_runActive) _cancelRequested = true;
  }

  Future<Map<String, Object?>> _executeWorkflow(
    Map<String, Object?> definition,
    Uint8List imageBytes,
  ) async {
    final nodes = (definition['nodes'] as List)
        .map((node) => _asObject(node, 'workflow node'))
        .toList(growable: false);
    final byId = {for (final node in nodes) node['id']! as String: node};
    final connections = (definition['connections'] as List)
        .map((connection) => _asObject(connection, 'workflow connection'))
        .toList(growable: false);
    final outgoing = <String, List<String>>{};
    final incoming = <String, List<String>>{};
    void addEdge(String from, String to) {
      (outgoing[from] ??= []).add(to);
      (incoming[to] ??= []).add(from);
    }

    for (final connection in connections) {
      addEdge(
        connection['sourceNodeId']! as String,
        connection['targetNodeId']! as String,
      );
    }
    for (final node in nodes) {
      if (node['type'] == 'condition') {
        addEdge(node['sourceNodeId']! as String, node['id']! as String);
      } else if (node['type'] == 'output') {
        for (final source in _outputSources(node)) {
          addEdge(source['sourceNodeId']! as String, node['id']! as String);
        }
      }
    }

    final remaining = {
      for (final node in nodes)
        node['id']! as String: incoming[node['id']! as String]?.length ?? 0,
    };
    final ready = nodes
        .map((node) => node['id']! as String)
        .where((id) => remaining[id] == 0)
        .toList();
    final order = <String>[];
    while (ready.isNotEmpty) {
      final id = ready.removeAt(0);
      order.add(id);
      for (final next in outgoing[id] ?? const <String>[]) {
        remaining[next] = remaining[next]! - 1;
        if (remaining[next] == 0) ready.add(next);
      }
    }
    if (order.length != nodes.length) {
      throw const ValidationExecutionException(
        'workflowDefinitionInvalid',
        'El workflow publicado contiene un ciclo.',
      );
    }

    final active = {
      for (final node in nodes)
        if (node['type'] == 'input.image') node['id']! as String,
    };
    final values = <String, Object?>{};
    final outputs = <String, Object?>{};
    for (final id in order) {
      if (_cancelRequested) {
        throw const ValidationExecutionException(
          'cancelled',
          'La ejecución fue cancelada.',
        );
      }
      if (!active.contains(id)) continue;
      final node = byId[id]!;
      switch (node['type']) {
        case 'input.image':
          values[id] = imageBytes;
        case 'model.tflite':
          final requirement = _profile.modelRequirements.singleWhere(
            (model) => model.nodeId == id,
          );
          final artifact = _artifacts[id]!;
          final tensors = await _inferenceEngine.run(
            modelFile: artifact.file,
            imageBytes: imageBytes,
            inputContract: requirement.inputContract,
          );
          if (_cancelRequested) {
            throw const ValidationExecutionException(
              'cancelled',
              'La ejecución fue cancelada.',
            );
          }
          final contract = requirement.modelOutputContract;
          values[id] = _outputNormalizer.normalizeDirect(
            tensors: tensors,
            contracts: [
              ValidationOutputContract(
                name: 'result',
                resultType: contract.resultType,
                labels: contract.labels,
                scoreThreshold: contract.scoreThreshold,
                tensorIndices: contract.tensorIndices,
              ),
            ],
          )['result'];
        case 'condition':
          final source = values[node['sourceNodeId']];
          final label = node['label'];
          if (source is! Map ||
              source['type'] != 'classification' ||
              source['confidences'] is! Map ||
              !(source['confidences'] as Map).containsKey(label)) {
            throw const ValidationExecutionException(
              'workflowConditionInputMissing',
              'La condición no encontró la clasificación declarada.',
            );
          }
          final confidence = (source['confidences'] as Map)[label];
          final threshold = node['threshold'];
          if (confidence is! num || threshold is! num) {
            throw const ValidationExecutionException(
              'workflowConditionInvalid',
              'La condición publicada no es válida.',
            );
          }
          values[id] = _compare(
            confidence.toDouble(),
            node['operator']! as String,
            threshold.toDouble(),
          );
        case 'output':
          final candidates = <Object?>[];
          for (final source in _outputSources(node)) {
            final value = values[source['sourceNodeId']];
            if (value is bool) {
              if ((source['sourcePort'] == 'true') == value) {
                candidates.add({'type': 'boolean', 'value': value});
              }
            } else if (source['sourcePort'] == 'result' && value is Map) {
              candidates.add(value);
            }
          }
          if (candidates.length > 1) {
            throw const ValidationExecutionException(
              'workflowOutputUnsupported',
              'La salida publicada combina resultados incompatibles.',
            );
          }
          if (candidates.length == 1) {
            outputs[node['name']! as String] = candidates.single;
          }
      }

      for (final next in outgoing[id] ?? const <String>[]) {
        if (byId[next]!['type'] == 'condition') {
          if (values[id] is Map) active.add(next);
        } else if (byId[next]!['type'] == 'output') {
          if (_outputSources(byId[next]!).any((source) {
            if (source['sourceNodeId'] != id) return false;
            final value = values[id];
            return value is! bool || (source['sourcePort'] == 'true') == value;
          })) {
            active.add(next);
          }
        } else if (values.containsKey(id)) {
          active.add(next);
        }
      }
    }
    final expectedNames = _profile.outputContract
        .map((contract) => contract.name)
        .toSet();
    if (outputs.keys.toSet().difference(expectedNames).isNotEmpty ||
        expectedNames.difference(outputs.keys.toSet()).isNotEmpty) {
      throw const ValidationExecutionException(
        'workflowOutputsMismatch',
        'El workflow no produjo todas las salidas declaradas.',
      );
    }
    return outputs;
  }

  Map<String, Object?> _validateWorkflow(Map<String, Object?> definition) {
    const rootFields = {'schemaVersion', 'nodes', 'connections'};
    if (definition.keys.toSet().difference(rootFields).isNotEmpty ||
        rootFields.difference(definition.keys.toSet()).isNotEmpty ||
        !{'1', '2'}.contains(definition['schemaVersion']) ||
        definition['nodes'] is! List ||
        definition['connections'] is! List) {
      throw const ValidationExecutionException(
        'workflowDefinitionInvalid',
        'La definición publicada del workflow no es compatible.',
      );
    }
    final nodes = (definition['nodes'] as List)
        .map((node) => _asObject(node, 'workflow node'))
        .toList(growable: false);
    final ids = <String>{};
    final byId = <String, Map<String, Object?>>{};
    for (final node in nodes) {
      final id = node['id'];
      final type = node['type'];
      if (id is! String || id.isEmpty || type is! String || !ids.add(id)) {
        throw const ValidationExecutionException(
          'workflowDefinitionInvalid',
          'El workflow contiene nodos inválidos o duplicados.',
        );
      }
      final fields = switch (type) {
        'input.image' => const {'id', 'type', 'outputs'},
        'model.tflite' => const {
          'id',
          'type',
          'modelVersionId',
          'modelName',
          'version',
          'inputs',
          'outputs',
        },
        'condition' => const {
          'id',
          'type',
          'sourceNodeId',
          'label',
          'operator',
          'threshold',
          'branches',
        },
        'output' when node.containsKey('sources') => const {
          'id',
          'type',
          'name',
          'sources',
        },
        'output' => const {
          'id',
          'type',
          'name',
          'sourceNodeId',
          'sourcePort',
          'resultType',
        },
        _ => const <String>{},
      };
      if (fields.isEmpty ||
          fields.difference(node.keys.toSet()).isNotEmpty ||
          node.keys.toSet().difference(fields).isNotEmpty) {
        throw const ValidationExecutionException(
          'workflowDefinitionInvalid',
          'El workflow contiene campos no compatibles.',
        );
      }
      if (type == 'output' &&
          node.containsKey('sources') &&
          definition['schemaVersion'] != '2') {
        throw const ValidationExecutionException(
          'workflowDefinitionInvalid',
          'La versión del workflow no admite salidas compuestas.',
        );
      }
      byId[id] = node;
    }
    final inputs = nodes
        .where((node) => node['type'] == 'input.image')
        .toList();
    final models = nodes
        .where((node) => node['type'] == 'model.tflite')
        .toList();
    final outputs = nodes.where((node) => node['type'] == 'output').toList();
    final conditions = nodes
        .where((node) => node['type'] == 'condition')
        .toList();
    if (inputs.length != 1 ||
        outputs.isEmpty ||
        nodes.any(
          (node) => !{
            'input.image',
            'model.tflite',
            'condition',
            'output',
          }.contains(node['type']),
        )) {
      throw const ValidationExecutionException(
        'workflowDefinitionInvalid',
        'El workflow contiene nodos no compatibles.',
      );
    }
    final inputNode = inputs.single;
    final inputOutputs = _asObject(inputNode['outputs'], 'input.outputs');
    if (inputOutputs.keys.toSet().difference({'imagen'}).isNotEmpty ||
        inputOutputs.length != 1 ||
        inputOutputs['imagen'] != 'image') {
      throw const ValidationExecutionException(
        'workflowDefinitionInvalid',
        'El nodo de imagen de entrada no es compatible.',
      );
    }
    final expectedModelNodes = _profile.modelRequirements
        .map((requirement) => requirement.nodeId)
        .toSet();
    if (models
            .map((node) => node['id'])
            .toSet()
            .difference(expectedModelNodes)
            .isNotEmpty ||
        expectedModelNodes
            .difference(models.map((node) => node['id']).toSet())
            .isNotEmpty) {
      throw const ValidationExecutionException(
        'workflowModelVersionMismatch',
        'El workflow no referencia exactamente los modelos del perfil.',
      );
    }
    for (final node in models) {
      final requirement = _profile.modelRequirements.singleWhere(
        (model) => model.nodeId == node['id'],
      );
      final inputs = _asObject(node['inputs'], 'model.inputs');
      final outputs = _asObject(node['outputs'], 'model.outputs');
      final input = inputs['image'];
      final output = outputs['result'];
      if (node['modelVersionId'] != requirement.modelVersionId ||
          node['modelName'] is! String ||
          (node['modelName'] as String).trim().isEmpty ||
          node['version'] is! String ||
          (node['version'] as String).trim().isEmpty ||
          inputs.keys.toSet().difference({'image'}).isNotEmpty ||
          inputs.length != 1 ||
          outputs.keys.toSet().difference({'result'}).isNotEmpty ||
          outputs.length != 1) {
        throw const ValidationExecutionException(
          'workflowModelVersionMismatch',
          'El workflow referencia otro modelo o contrato.',
        );
      }
      if (input is! Map ||
          output is! Map ||
          !modelContractMatchesRequirement({
            'input': input,
            'output': output,
          }, requirement)) {
        throw const ValidationExecutionException(
          'workflowModelContractMismatch',
          'El contrato del modelo del workflow no coincide con el perfil.',
        );
      }
    }
    final outputNames = outputs.map((node) => node['name']).toSet();
    final expectedOutputNames = _profile.outputContract
        .map((contract) => contract.name)
        .toSet();
    if (outputNames.length != outputs.length ||
        outputNames.difference(expectedOutputNames).isNotEmpty ||
        expectedOutputNames.difference(outputNames).isNotEmpty) {
      throw const ValidationExecutionException(
        'workflowOutputsMismatch',
        'Las salidas publicadas no coinciden con el perfil.',
      );
    }
    for (final node in conditions) {
      final source = byId[node['sourceNodeId']];
      final requirement = _profile.modelRequirements
          .where((model) => model.nodeId == source?['id'])
          .firstOrNull;
      final branches = node['branches'];
      if (source?['type'] != 'model.tflite' ||
          requirement?.modelOutputContract.resultType !=
              ValidationResultType.classification ||
          !requirement!.modelOutputContract.labels.contains(node['label']) ||
          !{'gte', 'gt', 'lte', 'lt'}.contains(node['operator']) ||
          node['threshold'] is! num ||
          (node['threshold'] as num) < 0 ||
          (node['threshold'] as num) > 1 ||
          branches is! Map ||
          branches.keys.toSet().difference({'true', 'false'}).isNotEmpty ||
          {'true', 'false'}.difference(branches.keys.toSet()).isNotEmpty) {
        throw const ValidationExecutionException(
          'workflowConditionInvalid',
          'El workflow contiene una condición incompatible.',
        );
      }
    }
    for (final node in outputs) {
      final contract = _profile.outputContract.singleWhere(
        (item) => item.name == node['name'],
      );
      for (final source in _outputSources(node)) {
        final sourceNode = byId[source['sourceNodeId']];
        final expectedType = switch (contract.resultType) {
          ValidationResultType.classification => 'classification',
          ValidationResultType.detection => 'detection',
          ValidationResultType.boolean => 'boolean',
        };
        final validSource = sourceNode?['type'] == 'condition'
            ? expectedType == 'boolean' &&
                  {'true', 'false'}.contains(source['sourcePort'])
            : sourceNode?['type'] == 'model.tflite' &&
                  source['sourcePort'] == 'result' &&
                  _profile.modelRequirements
                          .singleWhere(
                            (model) => model.nodeId == sourceNode?['id'],
                          )
                          .modelOutputContract
                          .resultType
                          .name ==
                      expectedType;
        final sourceModel = sourceNode?['type'] == 'model.tflite'
            ? _profile.modelRequirements.singleWhere(
                (model) => model.nodeId == sourceNode?['id'],
              )
            : null;
        if (sourceNode == null ||
            source['resultType'] != expectedType ||
            !validSource ||
            (sourceModel != null &&
                (sourceModel.modelOutputContract.labels.length !=
                        contract.labels.length ||
                    List.generate(
                      contract.labels.length,
                      (index) =>
                          sourceModel.modelOutputContract.labels[index] ==
                          contract.labels[index],
                    ).any((matches) => !matches)))) {
          throw const ValidationExecutionException(
            'workflowOutputMismatch',
            'Una salida publicada referencia un resultado incompatible.',
          );
        }
      }
    }
    _validateConnections(definition, byId);
    return Map.unmodifiable(definition);
  }

  void _validateConnections(
    Map<String, Object?> definition,
    Map<String, Map<String, Object?>> byId,
  ) {
    final seen = <String>{};
    final incomingModel = <String, int>{};
    for (final raw in definition['connections'] as List) {
      final connection = _asObject(raw, 'workflow connection');
      if (connection.keys.toSet().difference(const {
            'sourceNodeId',
            'sourcePort',
            'targetNodeId',
            'targetPort',
          }).isNotEmpty ||
          connection.keys.length != 4) {
        throw const ValidationExecutionException(
          'workflowDefinitionInvalid',
          'El workflow contiene una conexión inválida.',
        );
      }
      final sourceId = connection['sourceNodeId'];
      final targetId = connection['targetNodeId'];
      final source = sourceId is String ? byId[sourceId] : null;
      final target = targetId is String ? byId[targetId] : null;
      final key =
          '$sourceId:${connection['sourcePort']}>$targetId:${connection['targetPort']}';
      if (source?['type'] != 'input.image' ||
          target?['type'] != 'model.tflite' ||
          connection['sourcePort'] != 'imagen' ||
          connection['targetPort'] != 'image' ||
          !seen.add(key)) {
        throw const ValidationExecutionException(
          'workflowDefinitionInvalid',
          'El workflow contiene una conexión no compatible.',
        );
      }
      incomingModel[targetId as String] = (incomingModel[targetId] ?? 0) + 1;
    }
    if (_profile.modelRequirements.any(
      (model) => incomingModel[model.nodeId] != 1,
    )) {
      throw const ValidationExecutionException(
        'workflowDefinitionInvalid',
        'Cada modelo requiere una conexión de imagen.',
      );
    }
  }

  List<Map<String, Object?>> _outputSources(Map<String, Object?> node) {
    if (node.containsKey('sources')) {
      if (node.keys.toSet().difference({
            'id',
            'type',
            'name',
            'sources',
          }).isNotEmpty ||
          node.keys.length != 4 ||
          node['sources'] is! List ||
          (node['sources'] as List).isEmpty) {
        throw const ValidationExecutionException(
          'workflowOutputInvalid',
          'La salida publicada no es válida.',
        );
      }
      final sources = (node['sources'] as List)
          .map((item) => _asObject(item, 'output source'))
          .toList(growable: false);
      if (sources.any(
        (source) =>
            source.keys.toSet().difference(const {
              'sourceNodeId',
              'sourcePort',
              'resultType',
            }).isNotEmpty ||
            source.keys.length != 3 ||
            source.values.any((value) => value is! String || value.isEmpty),
      )) {
        throw const ValidationExecutionException(
          'workflowOutputInvalid',
          'La salida publicada contiene una fuente inválida.',
        );
      }
      return sources;
    }
    if (node.keys.toSet().difference({
          'id',
          'type',
          'name',
          'sourceNodeId',
          'sourcePort',
          'resultType',
        }).isNotEmpty ||
        node.keys.length != 6) {
      throw const ValidationExecutionException(
        'workflowOutputInvalid',
        'La salida publicada no es válida.',
      );
    }
    return [
      {
        'sourceNodeId': node['sourceNodeId'],
        'sourcePort': node['sourcePort'],
        'resultType': node['resultType'],
      },
    ];
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

Map<String, Object?> _asObject(Object? value, String field) {
  if (value is! Map) {
    throw ValidationExecutionException(
      'workflowDefinitionInvalid',
      '$field debe ser un objeto.',
    );
  }
  return value.map((key, item) => MapEntry(key.toString(), item));
}

List<ValidationTensor> _runTfliteCpu(
  String modelPath,
  Uint8List imageBytes,
  int width,
  int height,
  int channels,
  String normalization,
) {
  final input = prepareValidationImageTensor(
    imageBytes,
    ValidationInputContract(
      width: width,
      height: height,
      channels: channels,
      normalization: normalization,
    ),
  );
  final inputBytes = input.buffer.asUint8List(
    input.offsetInBytes,
    input.lengthInBytes,
  );
  Interpreter? interpreter;
  try {
    // Like ayni_sdk 0.3.0, this creates the default CPU interpreter without delegates.
    interpreter = Interpreter.fromFile(File(modelPath));
    final inputs = interpreter.getInputTensors();
    final acceptedShapes = [
      [1, height, width, channels],
      [height, width, channels],
    ];
    if (inputs.length != 1 ||
        inputs.single.type != TensorType.float32 ||
        !acceptedShapes.any(
          (shape) => _sameShape(inputs.single.shape, shape),
        )) {
      throw const ValidationExecutionException(
        'unsupportedInputContract',
        'El tensor de entrada del modelo no coincide con el contrato publicado.',
      );
    }
    final outputTensors = interpreter.getOutputTensors();
    if (outputTensors.any((tensor) => tensor.type != TensorType.float32)) {
      throw const ValidationExecutionException(
        'unsupportedOutputType',
        'El modelo publica un tipo de salida que no admite la validación.',
      );
    }
    final outputs = <int, Object>{};
    final views = <int, Float32List>{};
    for (var index = 0; index < outputTensors.length; index++) {
      final bytes = Uint8List(outputTensors[index].numBytes());
      outputs[index] = bytes;
      views[index] = Float32List.view(
        bytes.buffer,
        bytes.offsetInBytes,
        bytes.lengthInBytes ~/ Float32List.bytesPerElement,
      );
    }
    interpreter.runForMultipleInputs([inputBytes], outputs);
    return [
      for (var index = 0; index < outputTensors.length; index++)
        ValidationTensor(
          shape: List<int>.of(outputTensors[index].shape),
          values: List<double>.of(views[index]!),
        ),
    ];
  } finally {
    interpreter?.close();
  }
}

bool _sameShape(List<int> left, List<int> right) =>
    left.length == right.length &&
    List.generate(
      left.length,
      (index) => left[index] == right[index],
    ).every((same) => same);
