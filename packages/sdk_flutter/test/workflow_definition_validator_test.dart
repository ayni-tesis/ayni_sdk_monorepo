import 'package:ayni_sdk/ayni_sdk.dart';
import 'package:test/test.dart';

void main() {
  final validator = WorkflowDefinitionValidator();

  WorkflowValidationStatus validate(
    Object? definition, {
    Set<String> declared = const {'model-version-1', 'model-version-2'},
  }) => validator.validate(
    definition: definition,
    declaredModelVersionIds: declared,
  );

  Map<String, Object> definition({
    List<Object> nodes = const [],
    List<Object> connections = const [],
  }) => {'nodes': nodes, 'connections': connections};

  Map<String, Object> imageInput({String id = 'input-1'}) => {
    'id': id,
    'type': 'input.image',
    'outputs': {'imagen': 'image'},
  };

  Map<String, Object> model({
    String id = 'model-1',
    String modelVersionId = 'model-version-1',
    String resultType = 'classification',
    List<String> labels = const ['perro', 'gato'],
  }) => {
    'id': id,
    'type': 'model.tflite',
    'modelVersionId': modelVersionId,
    'modelName': 'Clasificador',
    'version': '1.0.0',
    'inputs': {
      'image': {
        'type': 'image',
        'width': 224,
        'height': 224,
        'channels': 3,
        'normalization': 'zero_to_one',
      },
    },
    'outputs': {
      'result': {'type': resultType, 'labels': labels},
    },
  };

  Map<String, Object?> condition({
    String id = 'condition-1',
    String sourceNodeId = 'model-1',
    String label = 'perro',
    String operator = 'gte',
    Object? threshold = 0.8,
  }) => {
    'id': id,
    'type': 'condition',
    'sourceNodeId': sourceNodeId,
    'label': label,
    'operator': operator,
    'threshold': threshold,
    'branches': {'true': 'Verdadero', 'false': 'Falso'},
  };

  Map<String, Object> output({
    String id = 'output-1',
    String name = 'Resultado',
    String sourceNodeId = 'model-1',
    String sourcePort = 'result',
    String resultType = 'classification',
  }) => {
    'id': id,
    'type': 'output',
    'name': name,
    'sourceNodeId': sourceNodeId,
    'sourcePort': sourcePort,
    'resultType': resultType,
  };

  Map<String, String> imageConnection({
    String sourceNodeId = 'input-1',
    String sourcePort = 'imagen',
    String targetNodeId = 'model-1',
    String targetPort = 'image',
  }) => {
    'sourceNodeId': sourceNodeId,
    'sourcePort': sourcePort,
    'targetNodeId': targetNodeId,
    'targetPort': targetPort,
  };

  test('accepts a valid acyclic workflow with declared models', () {
    final valid = definition(
      nodes: [
        imageInput(),
        model(),
        condition(),
        output(
          id: 'output-bool',
          sourceNodeId: 'condition-1',
          sourcePort: 'true',
          resultType: 'boolean',
        ),
        output(),
      ],
      connections: [imageConnection()],
    );

    expect(validate(valid), WorkflowValidationStatus.valid);
  });

  test('accepts detection models feeding detection outputs', () {
    final detection = definition(
      nodes: [
        imageInput(),
        model(
          modelVersionId: 'model-version-2',
          resultType: 'detection',
          labels: const ['hoja'],
        ),
        output(sourceNodeId: 'model-1', resultType: 'detection'),
      ],
      connections: [imageConnection()],
    );

    expect(validate(detection), WorkflowValidationStatus.valid);
  });

  test('rejects definitions that are not workflow objects', () {
    expect(validate(null), WorkflowValidationStatus.invalidSchema);
    expect(validate('{}'), WorkflowValidationStatus.invalidSchema);
    expect(validate([]), WorkflowValidationStatus.invalidSchema);
    expect(
      validate({'nodes': 'input'}),
      WorkflowValidationStatus.invalidSchema,
    );
    expect(
      validate({'nodes': [], 'connections': 'x'}),
      WorkflowValidationStatus.invalidSchema,
    );
    expect(
      validate(definition(nodes: ['nope'])),
      WorkflowValidationStatus.invalidSchema,
    );
    expect(
      validate(definition(nodes: [definition()])),
      WorkflowValidationStatus.invalidSchema,
    );
  });

  test('rejects nodes without a usable id or type', () {
    expect(
      validate(
        definition(
          nodes: [
            const {'id': 'a'},
          ],
        ),
      ),
      WorkflowValidationStatus.invalidSchema,
    );
    expect(
      validate(
        definition(
          nodes: [
            const {'type': 'condition'},
          ],
        ),
      ),
      WorkflowValidationStatus.invalidSchema,
    );
    expect(
      validate(
        definition(
          nodes: [
            const {'id': '', 'type': 'condition'},
          ],
        ),
      ),
      WorkflowValidationStatus.invalidSchema,
    );
  });

  test('rejects unsupported node types', () {
    expect(
      validate(
        definition(
          nodes: [
            const {'id': 'a', 'type': 'dataset.capture'},
          ],
        ),
      ),
      WorkflowValidationStatus.unknownNodeType,
    );
  });

  test('rejects duplicated node ids', () {
    expect(
      validate(definition(nodes: [imageInput(), imageInput()])),
      WorkflowValidationStatus.invalidSchema,
    );
  });

  test('rejects malformed model nodes', () {
    expect(
      validate(
        definition(
          nodes: [
            const {'id': 'a', 'type': 'model.tflite'},
          ],
        ),
      ),
      WorkflowValidationStatus.invalidSchema,
    );
    expect(
      validate(
        definition(
          nodes: [
            const {
              'id': 'model-1',
              'type': 'model.tflite',
              'modelVersionId': 'model-version-1',
              'outputs': {
                'result': {'type': 'segmentation', 'labels': []},
              },
            },
          ],
        ),
      ),
      WorkflowValidationStatus.invalidSchema,
    );
    expect(
      validate(
        definition(
          nodes: [
            const {
              'id': 'model-1',
              'type': 'model.tflite',
              'modelVersionId': 'model-version-1',
              'outputs': {
                'result': {'type': 'classification', 'labels': 'perro'},
              },
            },
          ],
        ),
      ),
      WorkflowValidationStatus.invalidSchema,
    );
  });

  test('rejects model versions not declared in the manifest', () {
    expect(
      validate(definition(nodes: [model(modelVersionId: 'other-model')])),
      WorkflowValidationStatus.undeclaredModelVersion,
    );
    expect(
      validate(definition(nodes: [model()]), declared: {}),
      WorkflowValidationStatus.undeclaredModelVersion,
    );
  });

  test('rejects malformed conditions', () {
    expect(
      validate(definition(nodes: [condition(operator: 'between')])),
      WorkflowValidationStatus.invalidSchema,
    );
    expect(
      validate(definition(nodes: [condition(threshold: 1.5)])),
      WorkflowValidationStatus.invalidSchema,
    );
    expect(
      validate(definition(nodes: [condition(threshold: -0.2)])),
      WorkflowValidationStatus.invalidSchema,
    );
    expect(
      validate(definition(nodes: [condition(threshold: '0.5')])),
      WorkflowValidationStatus.invalidSchema,
    );
    expect(
      validate(definition(nodes: [condition(label: '')])),
      WorkflowValidationStatus.invalidSchema,
    );
    expect(
      validate(definition(nodes: [condition(sourceNodeId: '')])),
      WorkflowValidationStatus.invalidSchema,
    );
  });

  test('rejects malformed outputs', () {
    expect(
      validate(definition(nodes: [output(name: '')])),
      WorkflowValidationStatus.invalidSchema,
    );
    expect(
      validate(definition(nodes: [output(resultType: 'integer')])),
      WorkflowValidationStatus.invalidSchema,
    );
    expect(
      validate(definition(nodes: [output(sourcePort: '')])),
      WorkflowValidationStatus.invalidSchema,
    );
  });

  test('rejects malformed connections', () {
    expect(
      validate(definition(connections: ['nope'])),
      WorkflowValidationStatus.invalidSchema,
    );
    expect(
      validate(definition(connections: [const {}])),
      WorkflowValidationStatus.invalidSchema,
    );
    expect(
      validate(
        definition(
          nodes: [imageInput(), model()],
          connections: [imageConnection(sourcePort: '')],
        ),
      ),
      WorkflowValidationStatus.invalidSchema,
    );
  });

  test('rejects connections to missing nodes', () {
    expect(
      validate(definition(nodes: [model()], connections: [imageConnection()])),
      WorkflowValidationStatus.missingNode,
    );
    expect(
      validate(
        definition(nodes: [imageInput()], connections: [imageConnection()]),
      ),
      WorkflowValidationStatus.missingNode,
    );
  });

  test('rejects conditions and outputs without their source node', () {
    expect(
      validate(definition(nodes: [condition()])),
      WorkflowValidationStatus.missingNode,
    );
    expect(
      validate(definition(nodes: [output()])),
      WorkflowValidationStatus.missingNode,
    );
  });

  test('rejects a direct cycle from a node to itself', () {
    expect(
      validate(definition(nodes: [condition(sourceNodeId: 'condition-1')])),
      WorkflowValidationStatus.cycle,
    );
  });

  test('rejects an indirect cycle over condition sources', () {
    expect(
      validate(
        definition(
          nodes: [
            condition(id: 'c-1', sourceNodeId: 'c-2'),
            condition(id: 'c-2', sourceNodeId: 'c-3'),
            condition(id: 'c-3', sourceNodeId: 'c-1'),
          ],
        ),
      ),
      WorkflowValidationStatus.cycle,
    );
  });

  test('rejects connections between incompatible ports', () {
    expect(
      validate(
        definition(
          nodes: [imageInput(), model(), output()],
          connections: [
            imageConnection(),
            imageConnection(targetNodeId: 'output-1', targetPort: 'source'),
          ],
        ),
      ),
      WorkflowValidationStatus.incompatiblePort,
    );
    expect(
      validate(
        definition(
          nodes: [imageInput(), model()],
          connections: [imageConnection(sourcePort: 'image')],
        ),
      ),
      WorkflowValidationStatus.incompatiblePort,
    );
    expect(
      validate(
        definition(
          nodes: [imageInput(), model()],
          connections: [imageConnection(targetPort: 'imagen')],
        ),
      ),
      WorkflowValidationStatus.incompatiblePort,
    );
  });

  test('rejects a duplicated connection to a model image input', () {
    expect(
      validate(
        definition(
          nodes: [
            imageInput(),
            imageInput(id: 'input-2'),
            model(),
          ],
          connections: [
            imageConnection(),
            imageConnection(sourceNodeId: 'input-2'),
          ],
        ),
      ),
      WorkflowValidationStatus.duplicatePort,
    );
    expect(
      validate(
        definition(
          nodes: [imageInput(), model()],
          connections: [imageConnection(), imageConnection()],
        ),
      ),
      WorkflowValidationStatus.duplicatePort,
    );
  });

  test('rejects conditions not fed by a matching classification result', () {
    expect(
      validate(
        definition(
          nodes: [
            model(resultType: 'detection', labels: const ['hoja']),
            condition(),
          ],
        ),
      ),
      WorkflowValidationStatus.incompatiblePort,
    );
    expect(
      validate(
        definition(
          nodes: [
            model(),
            condition(label: 'loro'),
          ],
        ),
      ),
      WorkflowValidationStatus.incompatiblePort,
    );
    expect(
      validate(
        definition(
          nodes: [
            imageInput(),
            condition(sourceNodeId: 'input-1'),
          ],
        ),
      ),
      WorkflowValidationStatus.incompatiblePort,
    );
  });

  test('rejects outputs fed by incompatible sources', () {
    expect(
      validate(
        definition(
          nodes: [
            model(resultType: 'detection', labels: const ['hoja']),
            output(),
          ],
        ),
      ),
      WorkflowValidationStatus.incompatiblePort,
    );
    expect(
      validate(
        definition(
          nodes: [
            model(),
            output(resultType: 'boolean'),
          ],
        ),
      ),
      WorkflowValidationStatus.incompatiblePort,
    );
    expect(
      validate(
        definition(
          nodes: [
            model(),
            condition(),
            output(
              sourceNodeId: 'condition-1',
              sourcePort: 'result',
              resultType: 'boolean',
            ),
          ],
        ),
      ),
      WorkflowValidationStatus.incompatiblePort,
    );
    expect(
      validate(
        definition(
          nodes: [
            model(),
            condition(),
            output(sourceNodeId: 'condition-1', resultType: 'classification'),
          ],
        ),
      ),
      WorkflowValidationStatus.incompatiblePort,
    );
  });

  test('reports only a machine-readable reason, never the definition', () {
    expect(validate('{}').toString(), 'WorkflowValidationStatus.invalidSchema');
    expect(
      validate(
        definition(
          nodes: [
            {'id': 'nodo-secreto', 'type': 'otro'},
          ],
        ),
      ).name,
      'unknownNodeType',
    );
  });
}
