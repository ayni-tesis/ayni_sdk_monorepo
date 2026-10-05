import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:ayni_sdk/ayni_sdk.dart';
import 'package:crypto/crypto.dart';

import '../data/workflow_definition_repository.dart';
import '../data/validation_model_repository.dart';
import '../models/experiment_plan.dart';
import '../models/validation_run_record.dart';
import '../storage/validation_preferences.dart';
import 'validation_condition_runner.dart';
import 'validation_output_normalizer.dart';

abstract interface class AyniSdkClient {
  Future<AyniInitializationResult> initialize(AyniConfig config);

  Future<SyncResult> sync();

  Future<WorkflowResult> run(
    String workflowId,
    Uint8List inputBytes, {
    void Function(String executionId)? onExecutionStarted,
    WorkflowTraceContext? traceContext,
  });

  void cancelExecution(String executionId);

  Future<void> clearPendingTraces();
}

class PublicAyniSdkClient implements AyniSdkClient {
  @override
  Future<AyniInitializationResult> initialize(AyniConfig config) async =>
      AyniSdk.initialize(config);

  @override
  Future<SyncResult> sync() => AyniSdk.instance.sync();

  @override
  Future<WorkflowResult> run(
    String workflowId,
    Uint8List inputBytes, {
    void Function(String executionId)? onExecutionStarted,
    WorkflowTraceContext? traceContext,
  }) => AyniSdk.instance.run(
    workflowId,
    inputBytes,
    onExecutionStarted: onExecutionStarted,
    traceContext: traceContext,
  );

  @override
  void cancelExecution(String executionId) =>
      AyniSdk.instance.cancelExecution(executionId);

  @override
  Future<void> clearPendingTraces() => AyniSdk.instance.clearPendingTraces();
}

class AyniSdkValidationRunner implements ValidationConditionRunner {
  AyniSdkValidationRunner({
    required ValidationResourceProfile profile,
    required this.credentials,
    required Directory storageDirectory,
    required AyniSdkClient sdk,
    required ValidationModelRepository modelRepository,
    required WorkflowDefinitionRepository workflowDefinitions,
    required ValidationPreferences preferences,
    ValidationOutputNormalizer outputNormalizer =
        const ValidationOutputNormalizer(),
    this.allowInsecureLoopback = false,
    this.appVersion = '1.0.0',
    this.sdkVersion = '0.2.0',
  }) : _profile = profile,
       _storageDirectory = storageDirectory,
       _sdk = sdk,
       _modelRepository = modelRepository,
       _workflowDefinitions = workflowDefinitions,
       _preferences = preferences,
       _outputNormalizer = outputNormalizer;

  final ValidationResourceProfile _profile;
  final ValidationSdkCredentials credentials;
  final Directory _storageDirectory;
  final AyniSdkClient _sdk;
  final ValidationModelRepository _modelRepository;
  final WorkflowDefinitionRepository _workflowDefinitions;
  final ValidationPreferences _preferences;
  final ValidationOutputNormalizer _outputNormalizer;
  final bool allowInsecureLoopback;
  final String appVersion;
  final String sdkVersion;

  bool _initialized = false;
  bool _workflowVerified = false;
  String? _activeExecutionId;
  bool _cancellationRequested = false;
  bool _sdkRunActive = false;
  final _operationGate = _AsyncGate();

  @override
  ValidationCondition get condition => ValidationCondition.treatment;

  @override
  Future<void> prepare() => _operationGate.run(_prepare);

  Future<void> _prepare() async {
    if (!_profile.isConfigured) {
      throw const ValidationExecutionException(
        'resourcesNotConfigured',
        'Configura las versiones publicadas del perfil antes de preparar.',
      );
    }
    if (_profile.outputContract.any(
      (output) => output.resultType == ValidationResultType.detection,
    )) {
      throw const ValidationExecutionException(
        'sdkDetectionTensorRolesUnsupported',
        'ayni_sdk 0.2.0 no puede validar todavía los índices de tensores de detección del perfil.',
      );
    }
    await _ensureInitialized();
    final manifestSha256 = await _modelRepository.fetchSha256(
      _profile.treatmentModelVersionId,
    );
    if (manifestSha256 != _profile.treatmentModelSha256) {
      throw const ValidationExecutionException(
        'modelHashMismatch',
        'El SHA-256 publicado del modelo no coincide con el perfil.',
      );
    }
    final definition = await _workflowDefinitions.fetch(
      _profile.treatmentWorkflowVersionId,
    );
    _verifyWorkflowDefinition(definition);
    _workflowVerified = true;
  }

  Future<SyncResult> synchronize() => _operationGate.run(() async {
    if (!_initialized) {
      throw const ValidationExecutionException(
        'sdkNotInitialized',
        'Prepara la condición ayni_sdk antes de sincronizar.',
      );
    }
    // A failed trace revocation must never be followed by a sync that can send
    // the still-queued outbox. Purge again before syncing whenever disabled.
    if (!await _preferences.traceCaptureAllowed) {
      await _sdk.clearPendingTraces();
    }
    return _sdk.sync();
  });

  Future<WorkflowResult> preflight(Uint8List inputBytes) =>
      _operationGate.run(() async {
        _requireReady();
        final result = await _sdk.run(_profile.treatmentWorkflowId, inputBytes);
        _normalizeAndVerifyResult(result);
        return result;
      });

  Future<void> setTraceCaptureAllowed(bool allowed) async {
    if (allowed) {
      await _operationGate.run(
        () => _preferences.setTraceCaptureAllowed(
          true,
          clearPendingTraces: () async {
            await _ensureInitialized();
            await _sdk.clearPendingTraces();
          },
        ),
      );
      return;
    }
    await _preferences.setTraceCaptureAllowed(
      false,
      clearPendingTraces: clearPendingTracesForRevocation,
    );
  }

  Future<void> clearPendingTracesForRevocation() =>
      _operationGate.run(() async {
        await _ensureInitialized();
        await _sdk.clearPendingTraces();
      });

  @override
  Future<ConditionRunResult> runCase(ValidationRunRequest request) =>
      _operationGate.run(() => _runCase(request));

  Future<ConditionRunResult> _runCase(ValidationRunRequest request) async {
    _requireReady();
    _activeExecutionId = null;
    _cancellationRequested = false;
    WorkflowTraceContext? traceContext;
    var tracePersistenceFailed = false;
    try {
      validateRequestDataset(request, _profile);
      if (sha256.convert(request.inputBytes).toString() !=
          request.inputSha256) {
        throw const ValidationExecutionException(
          'inputHashMismatch',
          'La imagen del lote no coincide con su SHA-256 verificado.',
        );
      }
      final authorized =
          request.captureTrace && await _preferences.traceCaptureAllowed;
      traceContext = authorized
          ? WorkflowTraceContext(
              runId: request.pairRunId,
              repetition: request.repetition,
              condition: condition.name,
              caseId: request.caseId,
              scenario: '${request.phase.name}:${request.scenarioId}',
              datasetId: request.datasetId,
              datasetPartition: request.datasetPartition,
              datasetSha256: request.datasetSha256,
              backend: 'CPU',
              appVersion: appVersion,
              sdkVersion: sdkVersion,
            )
          : null;
    } on ValidationExecutionException catch (error) {
      return ConditionRunResult.failure(
        durationMicros: 0,
        modelVersionId: _profile.treatmentModelVersionId,
        modelSha256: _profile.treatmentModelSha256,
        workflowVersionId: _profile.treatmentWorkflowVersionId,
        workflowVersion: _profile.treatmentWorkflowVersion,
        errorCode: error.code,
        errorMessage: error.message,
      );
    } on Object {
      return ConditionRunResult.failure(
        durationMicros: 0,
        modelVersionId: _profile.treatmentModelVersionId,
        modelSha256: _profile.treatmentModelSha256,
        workflowVersionId: _profile.treatmentWorkflowVersionId,
        workflowVersion: _profile.treatmentWorkflowVersion,
        errorCode: 'requestPreparationFailed',
        errorMessage: 'No se pudo preparar esta ejecución del SDK.',
      );
    }
    final stopwatch = Stopwatch()..start();
    try {
      _sdkRunActive = true;
      final result = await _sdk.run(
        _profile.treatmentWorkflowId,
        request.inputBytes,
        onExecutionStarted: (executionId) {
          _activeExecutionId = executionId;
          if (_cancellationRequested) _sdk.cancelExecution(executionId);
        },
        traceContext: traceContext,
      );
      tracePersistenceFailed = result.tracePersistenceFailed;
      final output = _normalizeAndVerifyResult(result);
      stopwatch.stop();
      return ConditionRunResult.success(
        durationMicros: stopwatch.elapsedMicroseconds,
        modelVersionId: _profile.treatmentModelVersionId,
        modelSha256: _profile.treatmentModelSha256,
        workflowVersionId: _profile.treatmentWorkflowVersionId,
        workflowVersion: result.workflowVersion,
        normalizedOutput: output,
        tracePersistenceFailed: result.tracePersistenceFailed,
      );
    } on WorkflowError catch (error) {
      stopwatch.stop();
      if (error.category == WorkflowErrorCategory.cancelled) {
        return ConditionRunResult.cancelled(
          durationMicros: stopwatch.elapsedMicroseconds,
          modelVersionId: _profile.treatmentModelVersionId,
          modelSha256: _profile.treatmentModelSha256,
          workflowVersionId: _profile.treatmentWorkflowVersionId,
          workflowVersion: _profile.treatmentWorkflowVersion,
          tracePersistenceFailed: error.tracePersistenceFailed,
        );
      }
      return ConditionRunResult.failure(
        durationMicros: stopwatch.elapsedMicroseconds,
        modelVersionId: _profile.treatmentModelVersionId,
        modelSha256: _profile.treatmentModelSha256,
        workflowVersionId: _profile.treatmentWorkflowVersionId,
        workflowVersion: _profile.treatmentWorkflowVersion,
        errorCode: error.category.name,
        errorMessage:
            'El workflow local no pudo completarse (${error.category.name}).',
        tracePersistenceFailed: error.tracePersistenceFailed,
      );
    } on ValidationExecutionException catch (error) {
      stopwatch.stop();
      return ConditionRunResult.failure(
        durationMicros: stopwatch.elapsedMicroseconds,
        modelVersionId: _profile.treatmentModelVersionId,
        modelSha256: _profile.treatmentModelSha256,
        workflowVersionId: _profile.treatmentWorkflowVersionId,
        workflowVersion: _profile.treatmentWorkflowVersion,
        errorCode: error.code,
        errorMessage: error.message,
        tracePersistenceFailed: tracePersistenceFailed,
      );
    } on Object {
      stopwatch.stop();
      return ConditionRunResult.failure(
        durationMicros: stopwatch.elapsedMicroseconds,
        modelVersionId: _profile.treatmentModelVersionId,
        modelSha256: _profile.treatmentModelSha256,
        workflowVersionId: _profile.treatmentWorkflowVersionId,
        workflowVersion: _profile.treatmentWorkflowVersion,
        errorCode: 'workflowExecutionFailed',
        errorMessage: 'No se pudo ejecutar el workflow local.',
        tracePersistenceFailed: tracePersistenceFailed,
      );
    } finally {
      _sdkRunActive = false;
      _activeExecutionId = null;
      _cancellationRequested = false;
    }
  }

  @override
  Future<void> cancelActive() async {
    if (!_sdkRunActive) return;
    _cancellationRequested = true;
    final executionId = _activeExecutionId;
    if (executionId != null) _sdk.cancelExecution(executionId);
  }

  @override
  Future<void> close() async {}

  Future<void> _ensureInitialized() async {
    if (_initialized) return;
    await _storageDirectory.create(recursive: true);
    final serverUrl = Uri.tryParse(credentials.serverUrl);
    if (serverUrl == null ||
        !serverUrl.isAbsolute ||
        serverUrl.host.isEmpty ||
        serverUrl.userInfo.isNotEmpty ||
        serverUrl.query.isNotEmpty ||
        serverUrl.fragment.isNotEmpty ||
        credentials.credential.trim().isEmpty) {
      throw const ValidationExecutionException(
        'invalidSdkConfiguration',
        'Revisa la configuración segura del servidor y la credencial del SDK.',
      );
    }
    final config = AyniConfig(
      serverUrl: serverUrl,
      credential: credentials.credential,
      storageDirectory: _storageDirectory,
      allowInsecureLoopback: allowInsecureLoopback,
    );
    final result = await _sdk.initialize(config);
    if (!result.isReady) {
      throw ValidationExecutionException(
        'sdkInitializationFailed',
        result.message,
      );
    }
    _initialized = true;
  }

  void _requireReady() {
    if (!_initialized || !_workflowVerified) {
      throw const ValidationExecutionException(
        'runnerNotPrepared',
        'Prepara y verifica la versión del workflow antes de ejecutar.',
      );
    }
  }

  Map<String, Object?> _normalizeAndVerifyResult(WorkflowResult result) {
    if (result.workflowId != _profile.treatmentWorkflowId ||
        result.workflowVersion != _profile.treatmentWorkflowVersion ||
        !result.usingOfflineCache) {
      throw const ValidationExecutionException(
        'workflowVersionMismatch',
        'El SDK no ejecutó la versión offline esperada del workflow.',
      );
    }
    try {
      return _outputNormalizer.normalizeSdk(
        outputs: result.outputs,
        contracts: _profile.outputContract,
      );
    } on ValidationOutputException {
      throw const ValidationExecutionException(
        'workflowOutputMismatch',
        'Las salidas del workflow no coinciden con el contrato de validación.',
      );
    }
  }

  void _verifyWorkflowDefinition(Map<String, Object?> definition) {
    const requiredFields = {'schemaVersion', 'nodes', 'connections'};
    if (definition.keys.toSet().length != requiredFields.length ||
        !definition.keys.toSet().containsAll(requiredFields) ||
        definition['schemaVersion'] != '1' ||
        definition['nodes'] is! List ||
        definition['connections'] is! List) {
      throw const ValidationExecutionException(
        'workflowDefinitionInvalid',
        'La definición publicada del workflow no es compatible.',
      );
    }
    final nodes = (definition['nodes'] as List).whereType<Map>().toList();
    final models = nodes
        .where((node) => node['type'] == 'model.tflite')
        .toList();
    if (models.isEmpty ||
        models.any(
          (node) => node['modelVersionId'] != _profile.treatmentModelVersionId,
        )) {
      throw const ValidationExecutionException(
        'workflowModelVersionMismatch',
        'El workflow no referencia la misma versión del modelo del modo directo.',
      );
    }
    for (final node in models) {
      final inputs = node['inputs'];
      final outputs = node['outputs'];
      if (inputs is! Map ||
          outputs is! Map ||
          inputs['image'] is! Map ||
          outputs['result'] is! Map) {
        throw const ValidationExecutionException(
          'workflowModelContractInvalid',
          'El contrato del modelo publicado no está completo.',
        );
      }
      final contract = <String, Object?>{
        'input': inputs['image'],
        'output': outputs['result'],
      };
      if (!modelContractMatchesValidationProfile(contract, _profile)) {
        throw const ValidationExecutionException(
          'workflowModelContractMismatch',
          'El contrato del modelo del workflow no coincide con el perfil.',
        );
      }
    }
    final outputNames = nodes
        .where((node) => node['type'] == 'output')
        .map((node) => node['name'])
        .whereType<String>()
        .toSet();
    if (_profile.outputContract.any(
      (contract) => !outputNames.contains(contract.name),
    )) {
      throw const ValidationExecutionException(
        'workflowOutputsMismatch',
        'El workflow no publica todas las salidas requeridas por el perfil.',
      );
    }
  }
}

class _AsyncGate {
  Future<void> _tail = Future<void>.value();

  Future<T> run<T>(Future<T> Function() operation) async {
    final previous = _tail;
    final release = Completer<void>();
    _tail = release.future;
    await previous;
    try {
      return await operation();
    } finally {
      release.complete();
    }
  }
}
