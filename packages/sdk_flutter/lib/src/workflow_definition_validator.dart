import 'sdk_internal.dart';

/// The machine-readable outcome of validating a downloaded workflow
/// definition. Only this status ever reaches the app: the definition's JSON is
/// never included. The SDK acts on `valid` versus any rejection identically;
/// the distinct rejection reasons exist so the internal tests can assert *why*
/// a definition was refused, matching the checks below.
enum WorkflowValidationStatus {
  /// The definition passes every check.
  valid,

  /// The definition, a node, or a connection has unknown, missing, or
  /// ill-typed fields.
  invalidSchema,

  /// The definition declares a schema version that this SDK release does not
  /// support (US-098).
  unsupportedSchemaVersion,

  /// A node has a type the SDK cannot run.
  unknownNodeType,

  /// A model node uses a model version the sync did not declare.
  undeclaredModelVersion,

  /// A connection or a node's source names a node that does not exist.
  missingNode,

  /// The graph has a cycle.
  cycle,

  /// A connection or a node's source joins incompatible ports.
  incompatiblePort,
}

/// Checks a published workflow definition (`{ schemaVersion, nodes, connections }`)
/// before the SDK installs it: the exact schema the server publishes (no
/// unknown or missing fields on the definition, its nodes, or its connections),
/// only the supported node types, edges that join compatible ports (a model
/// image input taking a single connection, a capture taking one image, one
/// result and, optionally, one branch of a condition on that result; a segmentation feeds no
/// capture but does feed a condition), an
/// acyclic graph counting each
/// condition's and output's stored source as an edge, and model versions
/// declared in the manifest.
///
/// The graph rules are a faithful Dart mirror of the server's source of truth,
/// `packages/api/src/workflow-graph.ts` (`workflowEdges`,
/// `areWorkflowPortsCompatible`, `isConditionSourceCompatible`,
/// `isOutputSourceCompatible`, and the cycle guarantee US-033 enforces on
/// writes), so a definition the dashboard could publish is exactly one the SDK
/// accepts. Keep the two in lockstep: change the rules in `workflow-graph.ts`
/// first, then port them here. The published shape — which this validator
/// treats as required and complete — comes from
/// `apps/server/src/workflow-version-store.ts`
/// (`definition = { schemaVersion, nodes, connections }`, never `layout`) and
/// the node types in `apps/server/src/workflow-store.ts` (`WorkflowNode`).
class WorkflowDefinitionValidator {
  /// The workflow schema versions supported by this validator (US-098).
  ///
  /// Schema 2 adds outputs with several `sources`; schema 3 adds
  /// `dataset.capture` (US-066), so an SDK that cannot run a capture rejects
  /// it as a newer schema instead of an unknown node. Schema 4 includes
  /// everything in schema 3 and adds `segmentation` model outputs, so an SDK
  /// that cannot decode a mask rejects them as a newer schema.
  static const supportedSchemaVersions = {'1', '2', '3', '4'};

  static const _nodeTypes = {
    'input.image',
    'model.tflite',
    'condition',
    'output',
    'dataset.capture',
  };

  /// The exact fields a published node carries per type; anything unknown or
  /// missing is a schema violation.
  static const _nodeFields = {
    'input.image': {'id', 'type', 'outputs'},
    'model.tflite': {
      'id',
      'type',
      'modelVersionId',
      'modelName',
      'version',
      'inputs',
      'outputs',
    },
    'condition': {
      'id',
      'type',
      'sourceNodeId',
      'label',
      'operator',
      'threshold',
      'branches',
    },
    'output': {
      'id',
      'type',
      'name',
      'sourceNodeId',
      'sourcePort',
      'resultType',
    },
    'dataset.capture': {'id', 'type', 'inputs'},
  };
  static const _multiSourceOutputFields = {'id', 'type', 'name', 'sources'};
  static const _outputSourceFields = {
    'sourceNodeId',
    'sourcePort',
    'resultType',
  };
  static const _connectionFields = {
    'sourceNodeId',
    'sourcePort',
    'targetNodeId',
    'targetPort',
  };
  static const _conditionOperators = {'gte', 'gt', 'lte', 'lt'};
  static const _modelOutputTypes = {
    'classification',
    'detection',
    'segmentation',
  };
  static const _resultTypes = {
    'classification',
    'detection',
    'segmentation',
    'boolean',
  };
  static const _segmentationScoreTypes = {'logits', 'probabilities'};

  /// Checks [definition], the decoded JSON of a published workflow version,
  /// whose model nodes may only use [declaredModelVersionIds].
  ///
  /// Returns [WorkflowValidationStatus.valid] or the first rule it breaks.
  WorkflowValidationStatus validate({
    required Object? definition,
    required Set<String> declaredModelVersionIds,
  }) {
    final shape = _readNodes(definition, declaredModelVersionIds);
    if (shape.failure != null) return shape.failure!;
    final nodes = shape.nodes;
    final edges = <(String, String)>[];
    for (final node in nodes.values) {
      if (node.type == 'condition') {
        if (!nodes.containsKey(node.sourceNodeId)) {
          return WorkflowValidationStatus.missingNode;
        }
        edges.add((node.sourceNodeId!, node.id));
      } else if (node.type == 'output') {
        for (final source in node.outputSources) {
          if (!nodes.containsKey(source.sourceNodeId)) {
            return WorkflowValidationStatus.missingNode;
          }
          edges.add((source.sourceNodeId, node.id));
        }
      }
    }

    final connections = <_Connection>[];
    for (final item in shape.connections) {
      final connection = _readConnection(item);
      if (connection == null) {
        return WorkflowValidationStatus.invalidSchema;
      }
      if (!nodes.containsKey(connection.sourceNodeId) ||
          !nodes.containsKey(connection.targetNodeId)) {
        return WorkflowValidationStatus.missingNode;
      }
      connections.add(connection);
      edges.add((connection.sourceNodeId, connection.targetNodeId));
    }

    if (_hasCycle(nodes.keys.toSet(), edges)) {
      return WorkflowValidationStatus.cycle;
    }

    final portFailure = _checkPorts(nodes, connections);
    if (portFailure != null) return portFailure;
    return WorkflowValidationStatus.valid;
  }

  /// Parses the definition schema and every node, returning the nodes keyed by
  /// id, the raw connection list, and the first failure (`null` when the shape
  /// is sound).
  _ParsedNodes _readNodes(
    Object? definition,
    Set<String> declaredModelVersionIds,
  ) {
    if (definition is! Map) {
      return _ParsedNodes.invalid();
    }
    final hasSchemaVersion = definition.containsKey('schemaVersion');
    final schemaVersion = definition['schemaVersion'];
    final isNonBlankSchema =
        schemaVersion is String && schemaVersion.trim().isNotEmpty;
    if (hasSchemaVersion) {
      if (isNonBlankSchema &&
          !supportedSchemaVersions.contains(schemaVersion)) {
        return _ParsedNodes.rejected(
          WorkflowValidationStatus.unsupportedSchemaVersion,
        );
      }
      if (!isNonBlankSchema ||
          !_hasExactFields(
            definition,
            const {'schemaVersion', 'nodes', 'connections'},
            optional: const {'connections'},
          )) {
        return _ParsedNodes.invalid();
      }
    } else {
      if (!_hasExactFields(
        definition,
        const {'nodes', 'connections'},
        optional: const {'connections'},
      )) {
        return _ParsedNodes.invalid();
      }
    }
    final rawNodes = definition['nodes'];
    final rawConnections = definition['connections'];
    if (rawNodes is! List ||
        (rawConnections != null && rawConnections is! List)) {
      return _ParsedNodes.invalid();
    }

    final nodes = <String, _Node>{};
    for (final item in rawNodes) {
      final parsed = _readNode(item, declaredModelVersionIds);
      if (parsed.node == null) {
        return _ParsedNodes.rejected(parsed.failure!);
      }
      final node = parsed.node!;
      if (nodes.containsKey(node.id)) {
        return _ParsedNodes.invalid();
      }
      if (node.outputSources.length > 1 &&
          schemaVersion != '2' &&
          schemaVersion != '3' &&
          schemaVersion != '4') {
        return _ParsedNodes.invalid();
      }
      if (node.type == 'dataset.capture' &&
          schemaVersion != '3' &&
          schemaVersion != '4') {
        return _ParsedNodes.invalid();
      }
      if (node.modelResultType == 'segmentation' && schemaVersion != '4') {
        return _ParsedNodes.invalid();
      }
      nodes[node.id] = node;
    }
    return _ParsedNodes.accepted(nodes, rawConnections ?? const []);
  }

  ({WorkflowValidationStatus? failure, _Node? node}) _readNode(
    Object? item,
    Set<String> declaredModelVersionIds,
  ) {
    if (item is! Map) {
      return (failure: WorkflowValidationStatus.invalidSchema, node: null);
    }
    final id = item['id'];
    final type = item['type'];
    if (!isNonEmptyString(id) || !isNonEmptyString(type)) {
      return (failure: WorkflowValidationStatus.invalidSchema, node: null);
    }
    final nodeType = type as String;
    if (!_nodeTypes.contains(nodeType)) {
      return (failure: WorkflowValidationStatus.unknownNodeType, node: null);
    }
    final fields = nodeType == 'output' && item.containsKey('sources')
        ? _multiSourceOutputFields
        : _nodeFields[nodeType]!;
    if (!_hasExactFields(item, fields)) {
      return (failure: WorkflowValidationStatus.invalidSchema, node: null);
    }
    final node = _Node(id: id as String, type: nodeType);

    final failure = switch (nodeType) {
      'input.image' => _readImageInput(node, item),
      'model.tflite' => _readModel(node, item, declaredModelVersionIds),
      'condition' => _readCondition(node, item),
      'output' => _readOutput(node, item),
      'dataset.capture' => _readCapture(item),
      _ => WorkflowValidationStatus.unknownNodeType,
    };
    if (failure != null) {
      return (failure: failure, node: null);
    }
    return (failure: null, node: node);
  }

  WorkflowValidationStatus? _readImageInput(_Node node, Map item) {
    final outputs = item['outputs'];
    if (outputs is! Map ||
        !_hasExactFields(outputs, const {'imagen'}) ||
        outputs['imagen'] != 'image') {
      return WorkflowValidationStatus.invalidSchema;
    }
    return null;
  }

  WorkflowValidationStatus? _readModel(
    _Node node,
    Map item,
    Set<String> declaredModelVersionIds,
  ) {
    final modelVersionId = item['modelVersionId'];
    final inputs = item['inputs'];
    final outputs = item['outputs'];
    final result = outputs is Map ? outputs['result'] : null;
    final resultType = result is Map ? result['type'] : null;
    final labels = result is Map ? result['labels'] : null;
    if (!isNonEmptyString(modelVersionId) ||
        !isNonEmptyString(item['modelName']) ||
        !isNonEmptyString(item['version']) ||
        inputs is! Map ||
        !_hasExactFields(inputs, const {'image'}) ||
        inputs['image'] is! Map ||
        outputs is! Map ||
        !_hasExactFields(outputs, const {'result'}) ||
        result is! Map ||
        !_modelOutputTypes.contains(resultType) ||
        !_isModelResult(resultType as String, result) ||
        labels is! List ||
        !labels.every((label) => label is String)) {
      return WorkflowValidationStatus.invalidSchema;
    }
    if (!declaredModelVersionIds.contains(modelVersionId)) {
      return WorkflowValidationStatus.undeclaredModelVersion;
    }
    node.modelResultType = resultType;
    node.modelLabels = labels.cast<String>().toSet();
    return null;
  }

  /// The model contract's output (mirrored by `addModelNode` from
  /// `packages/db/src/schema/model-version.ts`): classification results hold
  /// exactly their type and labels, while detection results may add a numeric
  /// `scoreThreshold` and an explicit map for the four output tensors, and
  /// segmentation results hold exactly their type, one to 256 distinct labels
  /// that are not blank and the
  /// `scoreType` of the mask tensor. Anything else is a damaged contract.
  bool _isModelResult(String resultType, Map result) {
    if (resultType == 'segmentation') {
      final labels = result['labels'];
      return _hasExactFields(result, const {'type', 'labels', 'scoreType'}) &&
          _segmentationScoreTypes.contains(result['scoreType']) &&
          labels is List &&
          labels.length >= 1 &&
          labels.length <= 256 &&
          // The server trims each label and rejects an empty one.
          labels.every((label) => label is String && label.trim().isNotEmpty) &&
          labels.toSet().length == labels.length;
    }
    return _isClassificationOrDetectionResult(resultType, result);
  }

  bool _isClassificationOrDetectionResult(String resultType, Map result) =>
      resultType == 'detection'
      ? _hasExactFields(result, const {'type', 'labels'}) ||
            (_hasExactFields(result, const {
                  'type',
                  'labels',
                  'scoreThreshold',
                }) &&
                result['scoreThreshold'] is num) ||
            (_hasExactFields(result, const {
                  'type',
                  'labels',
                  'scoreThreshold',
                  'tensorIndices',
                }) &&
                result['scoreThreshold'] is num &&
                _isDetectionTensorIndices(result['tensorIndices']))
      : _hasExactFields(result, const {'type', 'labels'});

  bool _isDetectionTensorIndices(Object? value) {
    if (value is! Map ||
        !_hasExactFields(value, const {
          'boxes',
          'classes',
          'scores',
          'count',
        })) {
      return false;
    }
    final indexes = [
      value['boxes'],
      value['classes'],
      value['scores'],
      value['count'],
    ];
    return indexes.every((index) => index is int && index >= 0 && index < 4) &&
        indexes.toSet().length == 4;
  }

  WorkflowValidationStatus? _readCondition(_Node node, Map item) {
    final threshold = item['threshold'];
    final branches = item['branches'];
    if (!isNonEmptyString(item['sourceNodeId']) ||
        !isNonEmptyString(item['label']) ||
        !_conditionOperators.contains(item['operator']) ||
        threshold is! num ||
        threshold < 0 ||
        threshold > 1 ||
        branches is! Map ||
        !_hasExactFields(branches, const {'true', 'false'})) {
      return WorkflowValidationStatus.invalidSchema;
    }
    node.sourceNodeId = item['sourceNodeId'] as String;
    node.label = item['label'] as String;
    return null;
  }

  WorkflowValidationStatus? _readOutput(_Node node, Map item) {
    if (item.containsKey('sources')) {
      final sources = item['sources'];
      if (!isNonEmptyString(item['name']) ||
          sources is! List ||
          sources.isEmpty) {
        return WorkflowValidationStatus.invalidSchema;
      }
      final parsed = <_OutputSource>[];
      for (final value in sources) {
        if (value is! Map ||
            !_hasExactFields(value, _outputSourceFields) ||
            !isNonEmptyString(value['sourceNodeId']) ||
            !isNonEmptyString(value['sourcePort']) ||
            !_resultTypes.contains(value['resultType'])) {
          return WorkflowValidationStatus.invalidSchema;
        }
        parsed.add(
          _OutputSource(
            sourceNodeId: value['sourceNodeId'] as String,
            sourcePort: value['sourcePort'] as String,
            resultType: value['resultType'] as String,
          ),
        );
      }
      final uniqueSources = <String>{};
      if (parsed.any(
        (source) =>
            !uniqueSources.add('${source.sourceNodeId}:${source.sourcePort}'),
      )) {
        return WorkflowValidationStatus.invalidSchema;
      }
      node.outputSources = parsed;
      return null;
    }
    final resultType = item['resultType'];
    if (!isNonEmptyString(item['name']) ||
        !isNonEmptyString(item['sourceNodeId']) ||
        !isNonEmptyString(item['sourcePort']) ||
        !_resultTypes.contains(resultType)) {
      return WorkflowValidationStatus.invalidSchema;
    }
    node.sourceNodeId = item['sourceNodeId'] as String;
    node.sourcePort = item['sourcePort'] as String;
    node.resultType = resultType as String;
    node.outputSources = [
      _OutputSource(
        sourceNodeId: node.sourceNodeId!,
        sourcePort: node.sourcePort!,
        resultType: node.resultType!,
      ),
    ];
    return null;
  }

  /// A capture (US-064) holds only its typed inputs: the image on `imagen` and
  /// an inference result on `resultado`, never code or other settings.
  WorkflowValidationStatus? _readCapture(Map item) {
    final inputs = item['inputs'];
    if (inputs is! Map ||
        !_hasExactFields(inputs, const {'imagen', 'resultado'}) ||
        inputs['imagen'] != 'image' ||
        inputs['resultado'] != 'inferenceResult') {
      return WorkflowValidationStatus.invalidSchema;
    }
    return null;
  }

  _Connection? _readConnection(Object? item) {
    if (item is! Map ||
        !_hasExactFields(item, _connectionFields) ||
        !item.values.every(isNonEmptyString)) {
      return null;
    }
    return _Connection(
      sourceNodeId: item['sourceNodeId'] as String,
      sourcePort: item['sourcePort'] as String,
      targetNodeId: item['targetNodeId'] as String,
      targetPort: item['targetPort'] as String,
    );
  }

  /// Port rules mirroring `workflowInputPortTypes`,
  /// `areWorkflowPortsCompatible` and `isCaptureConditionCompatible`: every
  /// connection takes the image output of the input to a model's `image` or a
  /// capture's `imagen`, a model's result to a capture's `resultado` (never a segmentation), or a
  /// condition branch to a capture's optional `condicion` (US-074), each input
  /// holding one connection and a capture both `imagen` and `resultado`; the
  /// condition of a capture evaluates the model whose result it captures;
  /// every condition reads a classification or segmentation label off its
  /// source model; every
  /// output reads a compatible result or boolean branch off its source.
  WorkflowValidationStatus? _checkPorts(
    Map<String, _Node> nodes,
    List<_Connection> connections,
  ) {
    final inputSources = <String, _Connection>{};
    for (final connection in connections) {
      final source = nodes[connection.sourceNodeId]!;
      final target = nodes[connection.targetNodeId]!;
      final takesImage =
          source.type == 'input.image' && connection.sourcePort == 'imagen';
      final compatible = switch ((target.type, connection.targetPort)) {
        ('model.tflite', 'image') ||
        ('dataset.capture', 'imagen') => takesImage,
        ('dataset.capture', 'resultado') =>
          source.type == 'model.tflite' &&
              connection.sourcePort == 'result' &&
              source.modelResultType != 'segmentation',
        ('dataset.capture', 'condicion') =>
          source.type == 'condition' &&
              (connection.sourcePort == 'true' ||
                  connection.sourcePort == 'false'),
        _ => false,
      };
      if (!compatible ||
          inputSources.putIfAbsent(
                '${connection.targetNodeId}:${connection.targetPort}',
                () => connection,
              ) !=
              connection) {
        return WorkflowValidationStatus.incompatiblePort;
      }
    }
    for (final node in nodes.values) {
      if (node.type != 'dataset.capture') continue;
      final result = inputSources['${node.id}:resultado'];
      final gate = inputSources['${node.id}:condicion'];
      if (!inputSources.containsKey('${node.id}:imagen') ||
          result == null ||
          (gate != null &&
              nodes[gate.sourceNodeId]!.sourceNodeId != result.sourceNodeId)) {
        return WorkflowValidationStatus.incompatiblePort;
      }
    }

    for (final node in nodes.values) {
      if (node.type == 'condition') {
        final source = nodes[node.sourceNodeId!]!;
        if (source.type != 'model.tflite' ||
            (source.modelResultType != 'classification' &&
                source.modelResultType != 'segmentation') ||
            !source.modelLabels!.contains(node.label)) {
          return WorkflowValidationStatus.incompatiblePort;
        }
      } else if (node.type == 'output') {
        for (final outputSource in node.outputSources) {
          final source = nodes[outputSource.sourceNodeId]!;
          final compatible = outputSource.resultType == 'boolean'
              ? source.type == 'condition' &&
                    (outputSource.sourcePort == 'true' ||
                        outputSource.sourcePort == 'false')
              : source.type == 'model.tflite' &&
                    outputSource.sourcePort == 'result' &&
                    source.modelResultType == outputSource.resultType;
          if (!compatible) return WorkflowValidationStatus.incompatiblePort;
        }
      }
    }
    return null;
  }

  bool _hasCycle(Set<String> nodeIds, List<(String, String)> edges) {
    final inDegree = {for (final id in nodeIds) id: 0};
    final outgoing = {for (final id in nodeIds) id: <String>[]};
    for (final (source, target) in edges) {
      inDegree[target] = inDegree[target]! + 1;
      outgoing[source]!.add(target);
    }
    final pending = [
      for (final entry in inDegree.entries)
        if (entry.value == 0) entry.key,
    ];
    var visited = 0;
    while (pending.isNotEmpty) {
      final nodeId = pending.removeLast();
      visited++;
      for (final target in outgoing[nodeId]!) {
        final remaining = inDegree[target]! - 1;
        inDegree[target] = remaining;
        if (remaining == 0) pending.add(target);
      }
    }
    return visited != nodeIds.length;
  }

  /// Whether [map] carries exactly the allowed keys: none unknown, none of the
  /// required ones missing. [optional] keys (such as a definition's
  /// `connections`) may be absent but never foreign.
  bool _hasExactFields(
    Map map,
    Set<String> allowed, {
    Set<String> optional = const {},
  }) {
    if (!map.keys.every((key) => key is String && allowed.contains(key))) {
      return false;
    }
    return allowed.difference(optional).every(map.containsKey);
  }
}

/// The definition shape reduced to parseable nodes: the nodes keyed by id and
/// the raw connection list, or the status that rejected the shape.
class _ParsedNodes {
  _ParsedNodes._(this.failure, this.nodes, this.connections);

  factory _ParsedNodes.accepted(
    Map<String, _Node> nodes,
    List<Object?> connections,
  ) => _ParsedNodes._(null, nodes, connections);

  factory _ParsedNodes.rejected(WorkflowValidationStatus failure) =>
      _ParsedNodes._(failure, const {}, const []);

  factory _ParsedNodes.invalid() =>
      _ParsedNodes.rejected(WorkflowValidationStatus.invalidSchema);

  final WorkflowValidationStatus? failure;
  final Map<String, _Node> nodes;
  final List<Object?> connections;
}

/// A published node reduced to the fields the graph rules read.
class _Node {
  _Node({required this.id, required this.type});

  final String id;
  final String type;

  /// model.tflite: the contract output type and its classification labels.
  String? modelResultType;
  Set<String>? modelLabels;

  /// condition/output: the node its source edge starts from.
  String? sourceNodeId;

  /// condition: the classification or segmentation label it tests.
  String? label;

  /// output: the source port it reads and the declared result type.
  String? sourcePort;
  String? resultType;
  List<_OutputSource> outputSources = [];
}

class _OutputSource {
  const _OutputSource({
    required this.sourceNodeId,
    required this.sourcePort,
    required this.resultType,
  });

  final String sourceNodeId;
  final String sourcePort;
  final String resultType;
}

class _Connection {
  _Connection({
    required this.sourceNodeId,
    required this.sourcePort,
    required this.targetNodeId,
    required this.targetPort,
  });

  final String sourceNodeId;
  final String sourcePort;
  final String targetNodeId;
  final String targetPort;
}
