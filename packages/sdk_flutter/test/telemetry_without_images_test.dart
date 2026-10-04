import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:ayni_sdk/ayni_sdk.dart';
import 'package:ayni_sdk/src/ayni_sdk.dart' show createAyniSdkForTesting;
import 'package:ayni_sdk/src/telemetry_policy_store.dart';
import 'package:ayni_sdk/src/trace_outbox_store.dart';
import 'package:ayni_sdk/src/trace_payload.dart';
import 'package:ayni_sdk/src/workflow_trace.dart' show createWorkflowTrace;
import 'package:crypto/crypto.dart' as crypto;
import 'package:image/image.dart' as img;
import 'package:test/test.dart';

import 'support/workflow_install.dart';

/// US-073: a workflow without `dataset.capture` only emits telemetry, and a
/// trace never carries the input image, its bytes, secrets or raw inputs.
///
/// The public API has no method to attach data to a trace: [WorkflowTrace]
/// has a private constructor and every value the app passes is typed. A
/// subclass of an exported type, such as [WorkflowTraceContext], can still
/// add a field to its `toJson()`, so the bad path is shown there and where a
/// trace enters and leaves the outbox, [TraceOutboxStore], which keeps only
/// the fields of the published trace schema ([allowlistedTracePayload]).
void main() {
  late Directory storageDirectory;
  late HttpServer server;
  final requests = <String>[];
  final traceBodies = <Map<String, Object?>>[];

  setUp(() async {
    AyniSdk.resetForTesting();
    AyniSdk.setPlatformForTesting(isAndroid: true, androidSdkVersion: 26);
    requests.clear();
    traceBodies.clear();
    storageDirectory = await Directory.systemTemp.createTemp('ayni-us-073-');
    server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    unawaited(
      server.forEach((request) async {
        requests.add(request.uri.path);
        final response = request.response..statusCode = HttpStatus.ok;
        switch (request.uri.path) {
          case '/sdk/telemetry-policy':
            response.write('{"enabled":true,"retentionDays":30}');
          case '/sdk/traces':
            final body =
                jsonDecode(await utf8.decoder.bind(request).join())
                    as Map<String, Object?>;
            traceBodies.add(body);
            response
              ..statusCode = HttpStatus.created
              ..write(
                jsonEncode({
                  'traceId': body['traceId'],
                  'receivedAt': '2026-10-04T12:00:00.000Z',
                }),
              );
          case '/sdk/sync':
            response.write('{"workflows":[],"models":[]}');
          default:
            response.statusCode = HttpStatus.notFound;
        }
        await response.close();
      }),
    );
  });

  tearDown(() async {
    AyniSdk.resetForTesting();
    await server.close(force: true);
    await storageDirectory.delete(recursive: true);
  });

  AyniSdk sdk() => createAyniSdkForTesting(
    serverUrl: Uri.parse(
      'http://${InternetAddress.loopbackIPv4.address}:${server.port}',
    ),
    credential: 'ayni_sk_test',
    storageDirectory: storageDirectory,
    allowInsecureLoopback: true,
    workflowInferenceRunner:
        ({
          required modelPath,
          required inputBytes,
          required acceptedInputShapes,
        }) async => (
          error: null,
          outputs: [
            (shape: [1, 2], values: Float32List.fromList([0.1, 0.9])),
          ],
        ),
  );

  Uint8List pngBytes() {
    final image = img.Image(width: 4, height: 4);
    img.fill(image, color: img.ColorRgb8(12, 200, 34));
    return Uint8List.fromList(img.encodePng(image));
  }

  Future<void> installWorkflowWithoutCapture() async {
    await installWorkflowFiles(
      storageDirectory: storageDirectory,
      inventoryJson: _inventory(),
      workflowVersionId: 'workflow-version-1.0.0',
      definitionJson: _definitionWithoutCapture(),
    );
    final modelDirectory = Directory(
      '${storageDirectory.path}/model-version-1',
    );
    await modelDirectory.create(recursive: true);
    await File(
      '${modelDirectory.path}/model-version-1.tflite',
    ).writeAsString(_modelBytes);
    await File('${modelDirectory.path}/model-version-1.json').writeAsString(
      jsonEncode({
        'modelId': 'model-version-1',
        'modelVersionId': 'model-version-1',
        'sha256': crypto.sha256.convert(utf8.encode(_modelBytes)).toString(),
      }),
    );
    await TelemetryPolicyStore(
      storageDirectory,
    ).write(const TelemetryPolicy(enabled: true, retentionDays: 30));
  }

  group('US-073: Enviar solo telemetría sin nodo de captura', () {
    test(
      'records the run telemetry without the input image when the workflow has no dataset.capture',
      () async {
        await installWorkflowWithoutCapture();
        final input = pngBytes();
        final events = <EvidenceEvent>[];
        final client = sdk();

        // Even with consent, only dataset.capture collects images.
        final result = await client.run(
          'workflow-1',
          input,
          traceContext: WorkflowTraceContext(runId: 'run-1', repetition: 1),
          evidenceConsent: true,
          onEvidence: events.add,
        );
        final queued = await TraceOutboxStore(storageDirectory).pending();
        final encoded = jsonEncode(queued.single);

        expect(result.outputs, contains('Resultado'));
        expect(result.tracePersistenceFailed, isFalse);
        expect(queued.single['traceId'], result.trace!.traceId);
        expect(
          queued.single['nodes'],
          everyElement(
            isA<Map<String, Object?>>().having(
              (node) => node['type'],
              'type',
              isNot('dataset.capture'),
            ),
          ),
        );
        expect(allowlistedTracePayload(queued.single), queued.single);
        expect(encoded, isNot(contains(base64Encode(input))));
        expect(encoded, isNot(contains(input.join(','))));
        // Telemetry does not hold the result back: run() makes no request.
        expect(requests, isEmpty);
        await Future<void>.delayed(const Duration(milliseconds: 50));
        expect(events, isEmpty);
        expect(await client.pendingEvidenceCount(), 0);
        expect(
          Directory('${storageDirectory.path}/evidence').existsSync(),
          isFalse,
        );
      },
    );

    test(
      'drops an image a component attaches to the trace of a run and keeps the trace',
      () async {
        await installWorkflowWithoutCapture();
        final input = pngBytes();
        // Larger than the 2 MiB trace limit on its own: only the allowed
        // fields count, so the attachment never costs the trace.
        final attachment = base64Encode(
          Uint8List(TraceOutboxStore.maxPayloadBytes),
        );

        final result = await sdk().run(
          'workflow-1',
          input,
          traceContext: _ContextWithImage(attachment),
        );
        final queued = await TraceOutboxStore(storageDirectory).pending();

        expect(result.outputs, contains('Resultado'));
        expect(result.tracePersistenceFailed, isFalse);
        expect(queued.single['traceId'], result.trace!.traceId);
        expect(queued.single.containsKey('image'), isFalse);
        expect(queued.single['clientReportedFields'], ['runId', 'repetition']);
        expect(
          jsonEncode(queued.single),
          isNot(contains(attachment.substring(0, 64))),
        );
      },
    );

    test('keeps every field of a complete SDK trace', () {
      final trace = _completeTrace().toJson();

      expect(allowlistedTracePayload(trace), trace);
    });

    test(
      'rejects an image attached to a trace and keeps only the allowed metadata',
      () async {
        final allowed = _completeTrace().toJson();
        final input = pngBytes();

        await TraceOutboxStore(
          storageDirectory,
        ).enqueue(_withAttachments(allowed, input));
        final queued = await TraceOutboxStore(storageDirectory).pending();

        expect(queued.single, allowed);
        expect(jsonEncode(queued.single), isNot(contains(base64Encode(input))));
      },
    );

    test(
      'sends only the allowed metadata of a pending trace that carries an image',
      () async {
        final allowed = _completeTrace().toJson();
        final input = pngBytes();
        // A trace file written without the store, as by an older or altered
        // copy of the outbox: it carries the image and other raw data.
        final outbox = Directory(
          '${storageDirectory.path}/diagnostics/trace-outbox',
        );
        await outbox.create(recursive: true);
        final name = base64Url
            .encode(utf8.encode(allowed['traceId']! as String))
            .replaceAll('=', '');
        await File(
          '${outbox.path}/$name.json',
        ).writeAsString(jsonEncode(_withAttachments(allowed, input)));
        await TelemetryPolicyStore(
          storageDirectory,
        ).write(const TelemetryPolicy(enabled: true, retentionDays: 30));

        await sdk().sync();

        expect(traceBodies, [allowed]);
        expect(await TraceOutboxStore(storageDirectory).pending(), isEmpty);
      },
    );
  });
}

/// A context whose serialization carries the input image, as a component
/// that tries to attach it to the telemetry would.
class _ContextWithImage extends WorkflowTraceContext {
  _ContextWithImage(this.image) : super(runId: 'run-1', repetition: 1);

  final String image;

  @override
  Map<String, Object?> toJson() => {...super.toJson(), 'image': image};
}

const _modelBytes = 'deterministic test model';

/// A trace that fills every field the SDK can write, with all result types.
WorkflowTrace _completeTrace() => createWorkflowTrace(
  traceId: '550e8400-e29b-41d4-a716-446655440073',
  installationId: '550e8400-e29b-41d4-a716-446655440000',
  context: WorkflowTraceContext(
    runId: 'run-1',
    repetition: 2,
    condition: 'treatment',
    caseId: 'case-1',
    scenario: 'campo',
    appCommit: 'abc123',
    sdkCommit: 'def456',
    datasetId: 'dataset-1',
    datasetPartition: 'test',
    datasetSha256: 'b' * 64,
    backend: 'cpu',
    network: 'offline',
    batteryPercent: 80,
    temperatureC: 31.5,
    appVersion: '1.2.3',
    sdkVersion: '0.3.0',
    measurements: [
      TraceMeasurement(
        name: 'latency',
        value: 14.5,
        unit: 'ms',
        method: 'stopwatch',
        source: 'host-app',
        phase: 'workflow',
      ),
    ],
    incidents: ['pantalla bloqueada'],
    validity: 'valid',
  ),
  workflowId: 'workflow-1',
  workflowVersionId: 'workflow-version-1.0.0',
  workflowVersion: '1.0.0',
  models: [
    TraceModel(
      modelVersionId: 'model-version-1',
      version: '1.0.0',
      sha256: 'a' * 64,
    ),
  ],
  profile: const DeviceProfile(
    platform: 'android',
    osVersion: '14',
    apiLevel: 34,
    model: 'Pixel 8',
    ramRange: '8–<12 GB',
    socModel: 'Tensor G3',
  ),
  timestamp: DateTime.utc(2026, 10, 4, 12),
  durationMs: 42,
  nodes: const [
    TraceNodeExecution(
      nodeId: 'model-1',
      type: 'model.tflite',
      status: 'failed',
      durationMs: 30,
      modelVersionId: 'model-version-1',
    ),
    TraceNodeExecution(nodeId: 'output-1', type: 'output', status: 'skipped'),
  ],
  outputs: {
    'Clasificación': const ClassificationResult('model-1', 'perro', 0.9, {
      'perro': 0.9,
      'gato': 0.1,
    }),
    'Detección': const DetectionResult('model-2', [
      Detection('broca', 0.8, 0.1, 0.2, 0.3, 0.4),
    ]),
    'Combinada': const CombinedWorkflowResult('output-2', [
      BooleanResult('condition-1', true),
    ]),
  },
  clientReportedFields: const ['runId', 'repetition', 'condition'],
  error: const WorkflowError(
    WorkflowErrorCategory.modelOutputInvalid,
    nodeId: 'model-1',
    modelVersionId: 'model-version-1',
  ),
);

/// [trace] with the input image and other data no trace may carry, at the top
/// level and inside each nested object.
Map<String, Object?> _withAttachments(
  Map<String, Object?> trace,
  Uint8List image,
) {
  Map<String, Object?> copy(Object? value) =>
      Map<String, Object?>.from(value! as Map);
  final outputs = copy(trace['outputs']);
  final classification = copy(outputs['Clasificación'])
    ..['tensor'] = [0.1, 0.9];
  return {
    ...trace,
    'image': base64Encode(image),
    'inputBytes': image,
    'input': {'bytes': base64Encode(image), 'path': '/data/user/0/app/a.png'},
    'credential': 'ayni_sk_secret',
    'profile': copy(trace['profile'])..['serialNumber'] = 'R58M12345',
    'models': [
      for (final model in trace['models']! as List)
        copy(model)..['artifact'] = base64Encode(image),
    ],
    'nodes': [
      for (final node in trace['nodes']! as List)
        copy(node)..['image'] = base64Encode(image),
      base64Encode(image),
    ],
    'measurements': [
      for (final measurement in trace['measurements']! as List)
        copy(measurement)..['raw'] = image,
    ],
    'incidents': [...trace['incidents']! as List, image],
    'outputs': {
      ...outputs,
      'Clasificación': classification,
      'Imagen': {
        'type': 'image',
        'nodeId': 'input-1',
        'bytes': base64Encode(image),
      },
    },
    'error': copy(trace['error'])..['message'] = 'failed reading /tmp/a.png',
  };
}

String _inventory() => jsonEncode({
  'workflows': [
    {
      'workflowId': 'workflow-1',
      'workflowVersionId': 'workflow-version-1.0.0',
      'name': 'Clasificar hoja',
      'version': '1.0.0',
      'modelVersionIds': ['model-version-1'],
    },
  ],
  'models': [
    {
      'modelVersionId': 'model-version-1',
      'version': '1.0.0',
      'sha256': 'a' * 64,
    },
  ],
});

String _definitionWithoutCapture() => jsonEncode({
  'schemaVersion': '1',
  'nodes': [
    {
      'id': 'input-1',
      'type': 'input.image',
      'outputs': {'imagen': 'image'},
    },
    {
      'id': 'model-1',
      'type': 'model.tflite',
      'modelVersionId': 'model-version-1',
      'modelName': 'Clasificador',
      'version': '1.0.0',
      'inputs': {
        'image': {
          'type': 'image',
          'width': 4,
          'height': 4,
          'channels': 3,
          'normalization': 'zero_to_one',
        },
      },
      'outputs': {
        'result': {
          'type': 'classification',
          'labels': ['perro', 'gato'],
        },
      },
    },
    {
      'id': 'output-1',
      'type': 'output',
      'name': 'Resultado',
      'sourceNodeId': 'model-1',
      'sourcePort': 'result',
      'resultType': 'classification',
    },
  ],
  'connections': [
    {
      'sourceNodeId': 'input-1',
      'sourcePort': 'imagen',
      'targetNodeId': 'model-1',
      'targetPort': 'image',
    },
  ],
});
