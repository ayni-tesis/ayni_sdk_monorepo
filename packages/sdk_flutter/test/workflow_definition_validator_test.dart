import 'package:ayni_sdk/src/workflow_definition_validator.dart';
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
    Object? schemaVersion = '1',
    List<Object> nodes = const [],
    List<Object> connections = const [],
  }) => {
    if (schemaVersion != null) 'schemaVersion': schemaVersion,
    'nodes': nodes,
    'connections': connections,
  };

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
    Object? scoreThreshold,
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
      'result': {
        'type': resultType,
        'labels': labels,
        if (scoreThreshold != null) 'scoreThreshold': scoreThreshold,
      },
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

  Map<String, Object> combinedOutput({
    String id = 'output-1',
    String name = 'Resultado',
    required List<Map<String, String>> sources,
  }) => {'id': id, 'type': 'output', 'name': name, 'sources': sources};

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

  test('accepts a schema 2 output with compatible model sources', () {
    final result = validate(
      definition(
        schemaVersion: '2',
        nodes: [
          imageInput(),
          model(),
          model(
            id: 'model-2',
            modelVersionId: 'model-version-2',
            resultType: 'detection',
            scoreThreshold: 0.5,
          ),
          combinedOutput(
            sources: [
              {
                'sourceNodeId': 'model-1',
                'sourcePort': 'result',
                'resultType': 'classification',
              },
              {
                'sourceNodeId': 'model-2',
                'sourcePort': 'result',
                'resultType': 'detection',
              },
            ],
          ),
        ],
        connections: [
          imageConnection(),
          imageConnection(targetNodeId: 'model-2'),
        ],
      ),
    );

    expect(result, WorkflowValidationStatus.valid);
  });

  test('requires schema 2 for a multi-source output', () {
    final result = validate(
      definition(
        nodes: [
          imageInput(),
          model(),
          model(
            id: 'model-2',
            modelVersionId: 'model-version-2',
            resultType: 'detection',
            scoreThreshold: 0.5,
          ),
          combinedOutput(
            sources: [
              {
                'sourceNodeId': 'model-1',
                'sourcePort': 'result',
                'resultType': 'classification',
              },
              {
                'sourceNodeId': 'model-2',
                'sourcePort': 'result',
                'resultType': 'detection',
              },
            ],
          ),
        ],
        connections: [
          imageConnection(),
          imageConnection(targetNodeId: 'model-2'),
        ],
      ),
    );

    expect(result, WorkflowValidationStatus.invalidSchema);
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
      validate({'schemaVersion': '1', 'nodes': 'input'}),
      WorkflowValidationStatus.invalidSchema,
    );
    expect(
      validate({'schemaVersion': '1', 'nodes': [], 'connections': 'x'}),
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

  test(
    'rejects unknown top-level fields beyond schemaVersion, nodes and connections',
    () {
      expect(
        validate({
          'schemaVersion': '1',
          'nodes': const <Object>[],
          'connections': const <Object>[],
          'layout': {
            'input-1': {'x': 0, 'y': 0},
          },
        }),
        WorkflowValidationStatus.invalidSchema,
      );
      expect(
        validate({
          'schemaVersion': '1',
          'nodes': const <Object>[],
          'draftRevision': 1,
        }),
        WorkflowValidationStatus.invalidSchema,
      );
    },
  );

  test(
    'accepts legacy definitions that omit schemaVersion when shape is valid',
    () {
      final legacy = {
        'nodes': [
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
        'connections': [imageConnection()],
      };
      expect(validate(legacy), WorkflowValidationStatus.valid);
    },
  );

  test(
    'rejects definitions with empty, blank, or non-string schemaVersion',
    () {
      expect(
        validate({
          'schemaVersion': '',
          'nodes': const <Object>[],
          'connections': const <Object>[],
        }),
        WorkflowValidationStatus.invalidSchema,
      );
      expect(
        validate({
          'schemaVersion': '   ',
          'nodes': const <Object>[],
          'connections': const <Object>[],
        }),
        WorkflowValidationStatus.invalidSchema,
      );
      expect(
        validate({
          'schemaVersion': 1,
          'nodes': const <Object>[],
          'connections': const <Object>[],
        }),
        WorkflowValidationStatus.invalidSchema,
      );
      expect(
        validate({
          'schemaVersion': null,
          'nodes': const <Object>[],
          'connections': const <Object>[],
        }),
        WorkflowValidationStatus.invalidSchema,
      );
    },
  );

  test(
    'rejects unsupported schema versions as unsupportedSchemaVersion (US-098)',
    () {
      expect(
        validate(definition(schemaVersion: '4')),
        WorkflowValidationStatus.unsupportedSchemaVersion,
      );
      expect(
        validate(definition(schemaVersion: '0')),
        WorkflowValidationStatus.unsupportedSchemaVersion,
      );
      expect(
        validate(definition(schemaVersion: 'v1')),
        WorkflowValidationStatus.unsupportedSchemaVersion,
      );
      expect(
        validate({
          'schemaVersion': '4',
          'nodes': const <Object>[],
          'connections': const <Object>[],
          'futureField': true,
        }),
        WorkflowValidationStatus.unsupportedSchemaVersion,
      );
    },
  );

  test('rejects nodes with unknown or missing published fields', () {
    expect(
      validate(
        definition(
          nodes: [
            const {
              'id': 'input-1',
              'type': 'input.image',
              'outputs': {'imagen': 'image'},
              'position': {'x': 0, 'y': 0},
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
              'modelName': 'Clasificador',
              'version': '1.0.0',
              'outputs': {
                'result': {'type': 'classification', 'labels': []},
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
              'id': 'condition-1',
              'type': 'condition',
              'sourceNodeId': 'model-1',
              'label': 'perro',
              'operator': 'gte',
              'threshold': 0.8,
              'branches': {'true': 'Verdadero'},
            },
          ],
        ),
      ),
      WorkflowValidationStatus.invalidSchema,
    );
  });

  test('rejects connections with unknown or missing fields', () {
    expect(
      validate(
        definition(
          nodes: [imageInput(), model()],
          connections: [
            const {
              'sourceNodeId': 'input-1',
              'sourcePort': 'imagen',
              'targetNodeId': 'model-1',
              'targetPort': 'image',
              'id': 'connection-1',
            },
          ],
        ),
      ),
      WorkflowValidationStatus.invalidSchema,
    );
    expect(
      validate(
        definition(
          nodes: [imageInput(), model()],
          connections: [
            const {'sourceNodeId': 'input-1', 'targetNodeId': 'model-1'},
          ],
        ),
      ),
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
            const {'id': 'a', 'type': 'image.transform'},
          ],
        ),
      ),
      WorkflowValidationStatus.unknownNodeType,
    );
  });

  group('dataset.capture (US-066)', () {
    Map<String, Object> capture({
      String id = 'capture-1',
      Object inputs = const {'imagen': 'image', 'resultado': 'inferenceResult'},
    }) => {'id': id, 'type': 'dataset.capture', 'inputs': inputs};

    List<Map<String, String>> captureConnections({
      String captureId = 'capture-1',
      String modelId = 'model-1',
    }) => [
      imageConnection(),
      imageConnection(targetNodeId: captureId, targetPort: 'imagen'),
      imageConnection(
        sourceNodeId: modelId,
        sourcePort: 'result',
        targetNodeId: captureId,
        targetPort: 'resultado',
      ),
    ];

    test('accepts a capture of the image and a model result in schema 3', () {
      expect(
        validate(
          definition(
            schemaVersion: '3',
            nodes: [imageInput(), model(), output(), capture()],
            connections: captureConnections(),
          ),
        ),
        WorkflowValidationStatus.valid,
      );
      expect(
        validate(
          definition(
            schemaVersion: '3',
            nodes: [
              imageInput(),
              model(resultType: 'detection', scoreThreshold: 0.5),
              output(resultType: 'detection'),
              capture(),
            ],
            connections: captureConnections(),
          ),
        ),
        WorkflowValidationStatus.valid,
      );
    });

    test('accepts combined outputs in schema 3', () {
      expect(
        validate(
          definition(
            schemaVersion: '3',
            nodes: [
              imageInput(),
              model(),
              model(id: 'model-2', modelVersionId: 'model-version-2'),
              combinedOutput(
                sources: [
                  {
                    'sourceNodeId': 'model-1',
                    'sourcePort': 'result',
                    'resultType': 'classification',
                  },
                  {
                    'sourceNodeId': 'model-2',
                    'sourcePort': 'result',
                    'resultType': 'classification',
                  },
                ],
              ),
            ],
            connections: [
              imageConnection(),
              imageConnection(targetNodeId: 'model-2'),
            ],
          ),
        ),
        WorkflowValidationStatus.valid,
      );
    });

    test('rejects a capture in a schema older than 3', () {
      for (final schemaVersion in ['1', '2']) {
        expect(
          validate(
            definition(
              schemaVersion: schemaVersion,
              nodes: [imageInput(), model(), output(), capture()],
              connections: captureConnections(),
            ),
          ),
          WorkflowValidationStatus.invalidSchema,
          reason: schemaVersion,
        );
      }
    });

    test('rejects a capture whose inputs are not the published ones', () {
      for (final inputs in <Object>[
        const {'imagen': 'image'},
        const {'imagen': 'image', 'resultado': 'classification'},
        const {
          'imagen': 'image',
          'resultado': 'inferenceResult',
          'script': 'x',
        },
        'imagen',
      ]) {
        expect(
          validate(
            definition(
              schemaVersion: '3',
              nodes: [
                imageInput(),
                model(),
                output(),
                capture(inputs: inputs),
              ],
              connections: captureConnections(),
            ),
          ),
          WorkflowValidationStatus.invalidSchema,
          reason: '$inputs',
        );
      }
      expect(
        validate(
          definition(
            schemaVersion: '3',
            nodes: [
              imageInput(),
              model(),
              output(),
              {...capture(), 'code': 'print(1)'},
            ],
            connections: captureConnections(),
          ),
        ),
        WorkflowValidationStatus.invalidSchema,
      );
    });

    test('rejects a capture without exactly one image and one result', () {
      final connections = captureConnections();
      for (final broken in [
        [connections[0], connections[1]],
        [connections[0], connections[2]],
        [...connections, connections[1]],
        [...connections, connections[2]],
      ]) {
        expect(
          validate(
            definition(
              schemaVersion: '3',
              nodes: [imageInput(), model(), output(), capture()],
              connections: broken,
            ),
          ),
          WorkflowValidationStatus.incompatiblePort,
        );
      }
    });

    test('rejects a capture fed by incompatible ports', () {
      expect(
        validate(
          definition(
            schemaVersion: '3',
            nodes: [imageInput(), model(), output(), capture()],
            connections: [
              imageConnection(),
              imageConnection(targetNodeId: 'capture-1', targetPort: 'imagen'),
              imageConnection(
                targetNodeId: 'capture-1',
                targetPort: 'resultado',
              ),
            ],
          ),
        ),
        WorkflowValidationStatus.incompatiblePort,
      );
      expect(
        validate(
          definition(
            schemaVersion: '3',
            nodes: [imageInput(), model(), condition(), output(), capture()],
            connections: [
              imageConnection(),
              imageConnection(targetNodeId: 'capture-1', targetPort: 'imagen'),
              imageConnection(
                sourceNodeId: 'condition-1',
                sourcePort: 'true',
                targetNodeId: 'capture-1',
                targetPort: 'resultado',
              ),
            ],
          ),
        ),
        WorkflowValidationStatus.incompatiblePort,
      );
    });

    group('behind a condition branch (US-074)', () {
      Map<String, String> gate({
        String conditionId = 'condition-1',
        String branch = 'true',
        String captureId = 'capture-1',
      }) => imageConnection(
        sourceNodeId: conditionId,
        sourcePort: branch,
        targetNodeId: captureId,
        targetPort: 'condicion',
      );

      test('accepts a capture taken only on either branch of a condition on '
          'the result it captures', () {
        for (final branch in ['true', 'false']) {
          expect(
            validate(
              definition(
                schemaVersion: '3',
                nodes: [
                  imageInput(),
                  model(),
                  output(),
                  condition(),
                  capture(),
                ],
                connections: [
                  ...captureConnections(),
                  gate(branch: branch),
                ],
              ),
            ),
            WorkflowValidationStatus.valid,
            reason: branch,
          );
        }
      });

      test('rejects a condition on another model than the captured one', () {
        expect(
          validate(
            definition(
              schemaVersion: '3',
              nodes: [
                imageInput(),
                model(),
                model(id: 'model-2', modelVersionId: 'model-version-2'),
                output(),
                condition(sourceNodeId: 'model-2'),
                capture(),
              ],
              connections: [
                ...captureConnections(),
                imageConnection(targetNodeId: 'model-2'),
                gate(),
              ],
            ),
          ),
          WorkflowValidationStatus.incompatiblePort,
        );
      });

      test('rejects anything but one branch of a condition on condicion', () {
        for (final connections in [
          [...captureConnections(), gate(), gate(branch: 'false')],
          [
            ...captureConnections(),
            imageConnection(
              sourceNodeId: 'model-1',
              sourcePort: 'result',
              targetNodeId: 'capture-1',
              targetPort: 'condicion',
            ),
          ],
          [
            ...captureConnections(),
            imageConnection(targetNodeId: 'capture-1', targetPort: 'condicion'),
          ],
          [...captureConnections(), gate(branch: 'result')],
        ]) {
          expect(
            validate(
              definition(
                schemaVersion: '3',
                nodes: [
                  imageInput(),
                  model(),
                  output(),
                  condition(),
                  capture(),
                ],
                connections: connections,
              ),
            ),
            WorkflowValidationStatus.incompatiblePort,
          );
        }
      });

      test('still wants the image and the result of a gated capture', () {
        final connections = captureConnections();
        for (final broken in [
          [connections[0], connections[1], gate()],
          [connections[0], connections[2], gate()],
        ]) {
          expect(
            validate(
              definition(
                schemaVersion: '3',
                nodes: [
                  imageInput(),
                  model(),
                  output(),
                  condition(),
                  capture(),
                ],
                connections: broken,
              ),
            ),
            WorkflowValidationStatus.incompatiblePort,
          );
        }
      });

      test('keeps the published capture node unchanged', () {
        expect(
          validate(
            definition(
              schemaVersion: '3',
              nodes: [
                imageInput(),
                model(),
                output(),
                condition(),
                capture(
                  inputs: const {
                    'imagen': 'image',
                    'resultado': 'inferenceResult',
                    'condicion': 'boolean',
                  },
                ),
              ],
              connections: [...captureConnections(), gate()],
            ),
          ),
          WorkflowValidationStatus.invalidSchema,
        );
      });
    });
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

  test('accepts detection results adding a numeric score threshold', () {
    expect(
      validate(
        definition(
          nodes: [
            model(
              resultType: 'detection',
              labels: const ['hoja'],
              scoreThreshold: 0.5,
            ),
          ],
        ),
      ),
      WorkflowValidationStatus.valid,
    );
    expect(
      validate(
        definition(nodes: [model(resultType: 'detection', scoreThreshold: 1)]),
      ),
      WorkflowValidationStatus.valid,
    );
  });

  test('rejects malformed score thresholds on model results', () {
    expect(
      validate(
        definition(
          nodes: [model(resultType: 'detection', scoreThreshold: '0.5')],
        ),
      ),
      WorkflowValidationStatus.invalidSchema,
    );
    expect(
      validate(definition(nodes: [model(scoreThreshold: 0.5)])),
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
              'modelName': 'Detector',
              'version': '1.0.0',
              'inputs': {
                'image': {'type': 'image'},
              },
              'outputs': {
                'result': {
                  'type': 'detection',
                  'labels': ['hoja'],
                  'scoreThreshold': 0.5,
                  'maxDetections': 10,
                },
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
      WorkflowValidationStatus.incompatiblePort,
    );
    expect(
      validate(
        definition(
          nodes: [imageInput(), model()],
          connections: [imageConnection(), imageConnection()],
        ),
      ),
      WorkflowValidationStatus.incompatiblePort,
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
