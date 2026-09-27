/// The machine-readable outcome of validating a downloaded workflow
/// definition. Only this status ever reaches the app: the definition's JSON is
/// never included.
enum WorkflowValidationStatus {
  valid,
  invalidSchema,
  unknownNodeType,
  undeclaredModelVersion,
  missingNode,
  cycle,
  incompatiblePort,
  duplicatePort,
}

/// Checks a published workflow definition (`{ nodes, connections }`) before the
/// SDK installs it: well-formed nodes and connections, only the supported node
/// types, edges that join compatible ports (a model image input taking a single
/// connection), an acyclic graph counting each condition's and output's stored
/// source as an edge, and model versions declared in the manifest.
class WorkflowDefinitionValidator {
  static const _nodeTypes = {
    'input.image',
    'model.tflite',
    'condition',
    'output',
  };
  static const _conditionOperators = {'gte', 'gt', 'lte', 'lt'};
  static const _modelOutputTypes = {'classification', 'detection'};
  static const _resultTypes = {'classification', 'detection', 'boolean'};

  WorkflowValidationStatus validate({
    required Object? definition,
    required Set<String> declaredModelVersionIds,
  }) {
    if (definition is! Map) return WorkflowValidationStatus.invalidSchema;
    final rawNodes = definition['nodes'];
    if (rawNodes is! List) return WorkflowValidationStatus.invalidSchema;
    final rawConnections = definition['connections'];
    if (rawConnections != null && rawConnections is! List) {
      return WorkflowValidationStatus.invalidSchema;
    }

    final nodes = <String, Map>{};
    final modelOutputTypes = <String, String>{};
    final modelLabels = <String, Set<String>>{};
    for (final item in rawNodes) {
      final failure = _readNode(
        item,
        nodes,
        modelOutputTypes,
        modelLabels,
        declaredModelVersionIds,
      );
      if (failure != null) return failure;
    }

    final edges = <(String, String)>[];
    for (final entry in nodes.entries) {
      final type = entry.value['type'];
      if (type == 'condition' || type == 'output') {
        final sourceNodeId = entry.value['sourceNodeId'] as String;
        if (!nodes.containsKey(sourceNodeId)) {
          return WorkflowValidationStatus.missingNode;
        }
        edges.add((sourceNodeId, entry.key));
      }
    }

    final connections = <Map>[];
    for (final item in rawConnections ?? const []) {
      if (item is! Map ||
          !_isNonEmptyString(item['sourceNodeId']) ||
          !_isNonEmptyString(item['sourcePort']) ||
          !_isNonEmptyString(item['targetNodeId']) ||
          !_isNonEmptyString(item['targetPort'])) {
        return WorkflowValidationStatus.invalidSchema;
      }
      final sourceNodeId = item['sourceNodeId'] as String;
      final targetNodeId = item['targetNodeId'] as String;
      if (!nodes.containsKey(sourceNodeId) ||
          !nodes.containsKey(targetNodeId)) {
        return WorkflowValidationStatus.missingNode;
      }
      connections.add(item);
      edges.add((sourceNodeId, targetNodeId));
    }

    if (_hasCycle(nodes.keys.toSet(), edges)) {
      return WorkflowValidationStatus.cycle;
    }

    final takenInputs = <String>{};
    for (final connection in connections) {
      final source = nodes[connection['sourceNodeId']]!;
      final target = nodes[connection['targetNodeId']]!;
      final compatible =
          source['type'] == 'input.image' &&
          connection['sourcePort'] == 'imagen' &&
          target['type'] == 'model.tflite' &&
          connection['targetPort'] == 'image';
      if (!compatible) return WorkflowValidationStatus.incompatiblePort;
      final input = '${connection['targetNodeId']}:${connection['targetPort']}';
      if (!takenInputs.add(input)) {
        return WorkflowValidationStatus.duplicatePort;
      }
    }

    for (final node in nodes.values) {
      switch (node['type']) {
        case 'condition':
          final sourceId = node['sourceNodeId'] as String;
          if (nodes[sourceId]!['type'] != 'model.tflite' ||
              modelOutputTypes[sourceId] != 'classification' ||
              !modelLabels[sourceId]!.contains(node['label'])) {
            return WorkflowValidationStatus.incompatiblePort;
          }
        case 'output':
          final sourceId = node['sourceNodeId'] as String;
          final resultType = node['resultType'] as String;
          final sourceType = nodes[sourceId]!['type'];
          final compatible = resultType == 'boolean'
              ? sourceType == 'condition' &&
                    (node['sourcePort'] == 'true' ||
                        node['sourcePort'] == 'false')
              : sourceType == 'model.tflite' &&
                    node['sourcePort'] == 'result' &&
                    modelOutputTypes[sourceId] == resultType;
          if (!compatible) return WorkflowValidationStatus.incompatiblePort;
      }
    }
    return WorkflowValidationStatus.valid;
  }

  WorkflowValidationStatus? _readNode(
    Object? item,
    Map<String, Map> nodes,
    Map<String, String> modelOutputTypes,
    Map<String, Set<String>> modelLabels,
    Set<String> declaredModelVersionIds,
  ) {
    if (item is! Map) return WorkflowValidationStatus.invalidSchema;
    final id = item['id'];
    final type = item['type'];
    if (!_isNonEmptyString(id) || !_isNonEmptyString(type)) {
      return WorkflowValidationStatus.invalidSchema;
    }
    if (!_nodeTypes.contains(type)) {
      return WorkflowValidationStatus.unknownNodeType;
    }
    if (nodes.containsKey(id)) return WorkflowValidationStatus.invalidSchema;
    final nodeId = id as String;

    switch (type) {
      case 'model.tflite':
        final modelVersionId = item['modelVersionId'];
        final outputs = item['outputs'];
        final result = outputs is Map ? outputs['result'] : null;
        final resultType = result is Map ? result['type'] : null;
        final labels = result is Map ? result['labels'] : null;
        if (!_isNonEmptyString(modelVersionId) ||
            resultType is! String ||
            !_modelOutputTypes.contains(resultType) ||
            labels is! List ||
            !labels.every((label) => label is String)) {
          return WorkflowValidationStatus.invalidSchema;
        }
        if (!declaredModelVersionIds.contains(modelVersionId)) {
          return WorkflowValidationStatus.undeclaredModelVersion;
        }
        modelOutputTypes[nodeId] = resultType;
        modelLabels[nodeId] = labels.cast<String>().toSet();
      case 'condition':
        final threshold = item['threshold'];
        if (!_isNonEmptyString(item['sourceNodeId']) ||
            !_isNonEmptyString(item['label']) ||
            !_conditionOperators.contains(item['operator']) ||
            threshold is! num ||
            threshold < 0 ||
            threshold > 1) {
          return WorkflowValidationStatus.invalidSchema;
        }
      case 'output':
        if (!_isNonEmptyString(item['name']) ||
            !_isNonEmptyString(item['sourceNodeId']) ||
            !_isNonEmptyString(item['sourcePort']) ||
            !_resultTypes.contains(item['resultType'])) {
          return WorkflowValidationStatus.invalidSchema;
        }
    }
    nodes[nodeId] = item;
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
}

bool _isNonEmptyString(Object? value) => value is String && value.isNotEmpty;
