import 'dart:async';
import 'dart:io';

import 'package:ayni_sdk/ayni_sdk.dart';
import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';

import '../data/dataset_bundle_loader.dart';
import '../data/dataset_repository.dart';
import '../data/validation_model_repository.dart';
import '../data/workflow_definition_repository.dart';
import '../execution/ayni_sdk_runner.dart';
import '../execution/direct_tflite_runner.dart';
import '../execution/validation_batch_controller.dart';
import '../execution/validation_condition_runner.dart';
import '../models/experiment_plan.dart';
import '../models/validation_run_record.dart';
import '../storage/validation_jsonl_exporter.dart';
import '../storage/validation_jsonl_store.dart';
import '../storage/validation_preferences.dart';
import '../validation_build_mode.dart';
import '../validation_run_metadata_reader.dart';

abstract interface class ValidationHomeRuntime {
  Future<ExperimentPlan> loadPlan();

  Future<ValidationSdkCredentials?> readCredentials();

  Future<bool> readTracePermission();

  Future<bool> hasJsonl();

  Future<void> saveCredentials(ValidationSdkCredentials credentials);

  Future<ValidationPreparationState> prepareResources({
    required ValidationResourceProfile profile,
    required ValidationSdkCredentials credentials,
    required ValidationCondition condition,
    void Function(int receivedBytes, int totalBytes)? onDownloadProgress,
  });

  Future<ValidationSyncState> synchronizeSdk();

  Future<BatchRunSummary> runPhase({
    required ValidationResourceProfile profile,
    required String pairRunId,
    required ValidationCondition condition,
    required String scenarioId,
    required ValidationPhase phase,
    required bool captureTrace,
    required Future<bool> Function() isCancelled,
    required void Function(ValidationRunRecord record) onRecord,
  });

  Future<void> cancel();

  Future<void> setTracePermission(bool allowed);

  Future<void> exportJsonl();

  Future<void> dispose();
}

class ValidationPreparationState {
  const ValidationPreparationState({
    required this.datasetVersion,
    required this.datasetSha256,
    required this.caseCount,
    required this.resourcesSummary,
  });

  final String datasetVersion;
  final String datasetSha256;
  final int caseCount;
  final String resourcesSummary;
}

class ValidationSyncState {
  const ValidationSyncState({
    required this.status,
    required this.ready,
    this.workflowVersion,
  });

  final String status;
  final bool ready;
  final String? workflowVersion;
}

class DefaultValidationHomeRuntime implements ValidationHomeRuntime {
  DefaultValidationHomeRuntime({
    ValidationPreferences? preferences,
    AssetBundle? assetBundle,
    Future<Directory> Function()? documentsDirectory,
  }) : _preferences =
           preferences ??
           ValidationPreferences(secureStore: FlutterValidationSecureStore()),
       _assetBundle = assetBundle ?? rootBundle,
       _documentsDirectoryProvider =
           documentsDirectory ?? getApplicationDocumentsDirectory;

  final ValidationPreferences _preferences;
  final AssetBundle _assetBundle;
  final Future<Directory> Function() _documentsDirectoryProvider;
  final ValidationRunMetadataReader _metadataReader =
      const ValidationRunMetadataReader();
  ExperimentPlan? _plan;
  ValidationSdkCredentials? _credentials;
  VerifiedDataset? _dataset;
  ValidationConditionRunner? _activeRunner;
  DirectTfliteRunner? _directRunner;
  AyniSdkValidationRunner? _sdkRunner;
  HttpDatasetTransport? _datasetTransport;
  HttpValidationModelRepository? _modelRepository;
  HttpWorkflowDefinitionRepository? _workflowRepository;
  ValidationBatchController? _batchController;
  Future<Directory>? _documentsDirectory;
  bool _sdkReadyForRuns = false;

  @override
  Future<ExperimentPlan> loadPlan() async {
    if (!validationBuildModeIsValid) {
      throw const ValidationHomeException(
        'invalidBuildMode',
        'La condición fijada para este APK no es válida.',
      );
    }
    final plan = await ExperimentPlan.load(_assetBundle);
    _plan = plan;
    return plan;
  }

  @override
  Future<ValidationSdkCredentials?> readCredentials() async {
    final credentials = await _preferences.readSdkCredentials();
    _credentials = credentials;
    return credentials;
  }

  @override
  Future<bool> readTracePermission() => _preferences.traceCaptureAllowed;

  @override
  Future<bool> hasJsonl() async => (await _resultFile()).exists();

  @override
  Future<void> saveCredentials(ValidationSdkCredentials credentials) async {
    final uri = Uri.tryParse(credentials.serverUrl);
    if (uri == null ||
        !uri.isAbsolute ||
        uri.host.isEmpty ||
        uri.scheme.toLowerCase() != 'https' ||
        uri.userInfo.isNotEmpty ||
        uri.query.isNotEmpty ||
        uri.fragment.isNotEmpty ||
        credentials.credential.trim().isEmpty) {
      throw const ValidationHomeException(
        'invalidConnection',
        'Revisa la URL HTTPS y la credencial SDK.',
      );
    }
    await _preferences.saveSdkCredentials(credentials);
    _credentials = credentials;
  }

  @override
  Future<ValidationPreparationState> prepareResources({
    required ValidationResourceProfile profile,
    required ValidationSdkCredentials credentials,
    required ValidationCondition condition,
    void Function(int receivedBytes, int totalBytes)? onDownloadProgress,
  }) async {
    final runnerKind = validationRunnerKindFor(
      buildMode: validationBuildMode,
      condition: condition,
    );
    if (runnerKind == ValidationRunnerKind.unavailable) {
      throw const ValidationHomeException(
        'conditionUnavailable',
        'La condición seleccionada no está disponible en este APK.',
      );
    }
    if (!profile.isConfigured) {
      throw const ValidationHomeException(
        'profileNotConfigured',
        'El perfil aún es una plantilla. Completa las versiones publicadas y los hashes en assets/validation/experiment_plan.json y vuelve a crear el APK.',
      );
    }
    await saveCredentials(credentials);
    await _closeRepositories();
    final serverUrl = Uri.parse(credentials.serverUrl);
    final documents = await _getDocumentsDirectory();
    final validationDirectory = Directory(
      '${documents.path}${Platform.pathSeparator}validation',
    );
    final datasetsDirectory = Directory(
      '${validationDirectory.path}${Platform.pathSeparator}datasets',
    );
    final modelsDirectory = Directory(
      '${validationDirectory.path}${Platform.pathSeparator}models',
    );
    final sdkStorageDirectory = Directory(
      '${validationDirectory.path}${Platform.pathSeparator}sdk',
    );

    final transport = HttpDatasetTransport(
      serverUrl: serverUrl,
      credential: credentials.credential,
    );
    _datasetTransport = transport;
    final datasetRepository = DatasetRepository(
      transport: transport,
      datasetsDirectory: datasetsDirectory,
      datasetVersionId: profile.datasetVersionId,
      expectedArchiveSha256: profile.datasetSha256,
      expectedPartition: profile.datasetPartition,
    );
    final dataset = await datasetRepository.prepare(
      profile.datasetVersionId,
      onProgress: onDownloadProgress,
    );
    _dataset = dataset;

    _sdkReadyForRuns = false;
    if (runnerKind == ValidationRunnerKind.direct) {
      final modelRepository = HttpValidationModelRepository(
        serverUrl: serverUrl,
        credential: credentials.credential,
        modelsDirectory: modelsDirectory,
      );
      _modelRepository = modelRepository;
      _directRunner = DirectTfliteRunner(
        profile: profile,
        modelRepository: modelRepository,
      );
      await _directRunner!.prepare();
      _activeRunner = _directRunner;
    } else if (runnerKind == ValidationRunnerKind.sdk) {
      final modelRepository = HttpValidationModelRepository(
        serverUrl: serverUrl,
        credential: credentials.credential,
        modelsDirectory: modelsDirectory,
      );
      _modelRepository = modelRepository;
      final workflowRepository = HttpWorkflowDefinitionRepository(
        serverUrl: serverUrl,
        credential: credentials.credential,
      );
      _workflowRepository = workflowRepository;
      _sdkRunner = AyniSdkValidationRunner(
        profile: profile,
        credentials: credentials,
        storageDirectory: sdkStorageDirectory,
        sdk: PublicAyniSdkClient(),
        modelRepository: modelRepository,
        workflowDefinitions: workflowRepository,
        preferences: _preferences,
      );
      await _sdkRunner!.prepare();
      _activeRunner = _sdkRunner;
    } else {
      throw const ValidationHomeException(
        'conditionUnavailable',
        'La condición seleccionada no está disponible en este APK.',
      );
    }
    return ValidationPreparationState(
      datasetVersion: dataset.version,
      datasetSha256: dataset.zipSha256,
      caseCount: dataset.cases.length,
      resourcesSummary: condition == ValidationCondition.control
          ? 'Modelo ${profile.controlModelVersionId} verificado para CPU.'
          : 'Workflow ${profile.treatmentWorkflowVersion} verificado. Pulsa “Sincronizar SDK” para instalar el modelo y el workflow offline.',
    );
  }

  @override
  Future<ValidationSyncState> synchronizeSdk() async {
    final runner = _sdkRunner;
    final dataset = _dataset;
    if (runner == null || dataset == null) {
      throw const ValidationHomeException(
        'treatmentNotPrepared',
        'Prepara primero los recursos de ayni_sdk.',
      );
    }
    _sdkReadyForRuns = false;
    final result = await runner.synchronize();
    if (result.status != SyncStatus.updated &&
        result.status != SyncStatus.upToDate) {
      return ValidationSyncState(status: result.status.name, ready: false);
    }
    final testCase = dataset.cases.first;
    final bytes = await File(testCase.localPath).readAsBytes();
    if (sha256.convert(bytes).toString() != testCase.sha256) {
      throw const ValidationHomeException(
        'datasetImageChanged',
        'Una imagen del dataset cambió después de verificarlo; vuelve a preparar los recursos.',
      );
    }
    final preflight = await runner.preflight(Uint8List.fromList(bytes));
    _sdkReadyForRuns = true;
    return ValidationSyncState(
      status: result.status.name,
      ready: true,
      workflowVersion: preflight.workflowVersion,
    );
  }

  @override
  Future<BatchRunSummary> runPhase({
    required ValidationResourceProfile profile,
    required String pairRunId,
    required ValidationCondition condition,
    required String scenarioId,
    required ValidationPhase phase,
    required bool captureTrace,
    required Future<bool> Function() isCancelled,
    required void Function(ValidationRunRecord record) onRecord,
  }) async {
    final runner = _activeRunner;
    final dataset = _dataset;
    if (runner == null || dataset == null || runner.condition != condition) {
      throw const ValidationHomeException(
        'resourcesNotPrepared',
        'Prepara los recursos de la condición seleccionada antes de ejecutar.',
      );
    }
    if (condition == ValidationCondition.treatment && !_sdkReadyForRuns) {
      throw const ValidationHomeException(
        'sdkNotSynced',
        'Sincroniza ayni_sdk y verifica el workflow antes de ejecutar.',
      );
    }
    final store = ValidationJsonlStore(await _resultFile());
    final batch = ValidationBatchController(
      store: store,
      metadata: await _metadataReader.read(),
    );
    _batchController = batch;
    return batch.runPhase(
      plan: _plan ?? await loadPlan(),
      pairRunId: pairRunId,
      runner: runner,
      dataset: dataset,
      scenarioId: scenarioId,
      phase: phase,
      captureTrace: captureTrace,
      isCancelled: isCancelled,
      onRecord: onRecord,
    );
  }

  @override
  Future<void> cancel() => _batchController?.cancel() ?? Future<void>.value();

  @override
  Future<void> setTracePermission(bool allowed) async {
    await _preferences.setTraceCaptureAllowed(
      allowed,
      clearPendingTraces: _purgePendingTraces,
    );
  }

  Future<void> _purgePendingTraces() async {
    if (_sdkRunner != null) {
      await _sdkRunner!.clearPendingTracesForRevocation();
      return;
    }
    final credentials = _credentials ?? await _preferences.readSdkCredentials();
    if (credentials == null) {
      if (AyniSdk.isInitialized) {
        await AyniSdk.instance.clearPendingTraces();
        return;
      }
      throw const ValidationHomeException(
        'traceQueueUnavailable',
        'Se necesita configurar el SDK para vaciar las trazas pendientes.',
      );
    }
    final plan = _plan ?? await loadPlan();
    final runner = await _getSdkRunner(credentials, plan.activeResourceProfile);
    await runner.clearPendingTracesForRevocation();
  }

  @override
  Future<void> exportJsonl() async {
    await ValidationJsonlExporter().export(await _resultFile());
  }

  @override
  Future<void> dispose() => _closeRepositories();

  Future<AyniSdkValidationRunner> _getSdkRunner(
    ValidationSdkCredentials credentials,
    ValidationResourceProfile profile,
  ) async {
    final current = _sdkRunner;
    if (current != null) return current;
    final documents = await _getDocumentsDirectory();
    final validationDirectory = Directory(
      '${documents.path}${Platform.pathSeparator}validation',
    );
    final modelRepository = HttpValidationModelRepository(
      serverUrl: Uri.parse(credentials.serverUrl),
      credential: credentials.credential,
      modelsDirectory: Directory(
        '${validationDirectory.path}${Platform.pathSeparator}models',
      ),
    );
    _modelRepository = modelRepository;
    final repository = HttpWorkflowDefinitionRepository(
      serverUrl: Uri.parse(credentials.serverUrl),
      credential: credentials.credential,
    );
    _workflowRepository = repository;
    return _sdkRunner = AyniSdkValidationRunner(
      profile: profile,
      credentials: credentials,
      storageDirectory: Directory(
        '${validationDirectory.path}${Platform.pathSeparator}sdk',
      ),
      sdk: PublicAyniSdkClient(),
      modelRepository: modelRepository,
      workflowDefinitions: repository,
      preferences: _preferences,
    );
  }

  Future<File> _resultFile() async {
    final documents = await _getDocumentsDirectory();
    final directory = Directory(
      '${documents.path}${Platform.pathSeparator}validation',
    );
    await directory.create(recursive: true);
    return File('${directory.path}${Platform.pathSeparator}runs.jsonl');
  }

  Future<Directory> _getDocumentsDirectory() =>
      _documentsDirectory ??= _documentsDirectoryProvider();

  Future<void> _closeRepositories() async {
    _datasetTransport?.close(force: true);
    _modelRepository?.close(force: true);
    _workflowRepository?.close(force: true);
    _datasetTransport = null;
    _modelRepository = null;
    _workflowRepository = null;
    _directRunner = null;
    _sdkRunner = null;
    _activeRunner = null;
    _sdkReadyForRuns = false;
  }
}

class ValidationHomeException implements Exception {
  const ValidationHomeException(this.code, this.message);

  final String code;
  final String message;
}

class ValidationHomePage extends StatefulWidget {
  const ValidationHomePage({super.key, this.runtime});

  final ValidationHomeRuntime? runtime;

  @override
  State<ValidationHomePage> createState() => _ValidationHomePageState();
}

class _ValidationHomePageState extends State<ValidationHomePage> {
  late final ValidationHomeRuntime _runtime;
  final _serverUrlController = TextEditingController();
  final _credentialController = TextEditingController();
  final _pairRunIdController = TextEditingController();
  ExperimentPlan? _plan;
  ValidationCondition _condition = validationBuildMode == 'treatment'
      ? ValidationCondition.treatment
      : ValidationCondition.control;
  ValidationScenario? _scenario;
  ValidationPreparationState? _prepared;
  bool _bootstrapping = true;
  bool _busy = false;
  bool _running = false;
  bool _cancelRequested = false;
  bool _credentialsSaved = false;
  bool _traceAllowed = false;
  bool _sdkReady = false;
  bool _hasJsonl = false;
  double? _downloadProgress;
  double _batchProgress = 0;
  String? _activity;
  String? _status;
  String? _error;
  final List<String> _events = [];

  @override
  void initState() {
    super.initState();
    _runtime = widget.runtime ?? DefaultValidationHomeRuntime();
    _pairRunIdController.text =
        'pair-${DateTime.now().toUtc().millisecondsSinceEpoch}';
    unawaited(_bootstrap());
  }

  @override
  void dispose() {
    _serverUrlController.dispose();
    _credentialController.dispose();
    _pairRunIdController.dispose();
    unawaited(_runtime.dispose());
    super.dispose();
  }

  Future<void> _bootstrap() async {
    try {
      final results = await Future.wait<Object?>([
        _runtime.loadPlan(),
        _runtime.readCredentials(),
        _runtime.readTracePermission(),
        _runtime.hasJsonl(),
      ]);
      final plan = results[0]! as ExperimentPlan;
      final credentials = results[1] as ValidationSdkCredentials?;
      if (!mounted) return;
      setState(() {
        _plan = plan;
        _scenario = plan.scenarioFor(ValidationPhase.measured);
        _traceAllowed = results[2]! as bool;
        _hasJsonl = results[3]! as bool;
        _credentialsSaved = credentials != null;
        _serverUrlController.text = credentials?.serverUrl ?? '';
        _credentialController.text = credentials?.credential ?? '';
        _bootstrapping = false;
      });
    } on Object catch (error) {
      if (!mounted) return;
      setState(() {
        _bootstrapping = false;
        _error = _friendlyError(error);
      });
    }
  }

  ValidationResourceProfile? get _profile => _plan?.activeResourceProfile;

  bool get _hasConnection =>
      _serverUrlController.text.trim().isNotEmpty &&
      _credentialController.text.trim().isNotEmpty;

  bool get _canPrepare =>
      !_busy &&
      (_profile?.isConfigured ?? false) &&
      _hasConnection &&
      _conditionAvailable;

  bool get _conditionAvailable =>
      validationRunnerKindFor(
        buildMode: validationBuildMode,
        condition: _condition,
      ) !=
      ValidationRunnerKind.unavailable;

  bool get _canRun =>
      !_busy &&
      _prepared != null &&
      _scenario != null &&
      _scenario!.phase != ValidationPhase.coldStart &&
      _pairRunIdController.text.trim().isNotEmpty &&
      _conditionAvailable &&
      (_condition == ValidationCondition.control || _sdkReady);

  Future<void> _saveConnection() async {
    final credentials = _credentialsFromFields();
    if (credentials == null) {
      return _showError('Ingresa la URL HTTPS y la credencial SDK.');
    }
    setState(() {
      _busy = true;
      _error = null;
      _activity = 'Guardando conexión segura…';
    });
    try {
      await _runtime.saveCredentials(credentials);
      if (!mounted) return;
      setState(() => _credentialsSaved = true);
      _addEvent('Conexión guardada en el almacenamiento seguro.');
    } on Object catch (error) {
      _showError(_friendlyError(error));
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
          _activity = null;
        });
      }
    }
  }

  Future<void> _prepareResources() async {
    final profile = _profile;
    final credentials = _credentialsFromFields();
    if (profile == null || credentials == null) {
      return _showError('Ingresa la URL HTTPS y la credencial SDK.');
    }
    setState(() {
      _busy = true;
      _error = null;
      _activity = 'Preparando dataset y recursos…';
      _downloadProgress = null;
      _prepared = null;
      _sdkReady = false;
    });
    try {
      await _runtime.saveCredentials(credentials);
      final result = await _runtime.prepareResources(
        profile: profile,
        credentials: credentials,
        condition: _condition,
        onDownloadProgress: (received, total) {
          if (!mounted) return;
          setState(() {
            _downloadProgress = total <= 0 ? null : received / total;
          });
        },
      );
      if (!mounted) return;
      setState(() {
        _credentialsSaved = true;
        _prepared = result;
        _sdkReady = false;
      });
      _addEvent(
        'Dataset ${result.datasetVersion} verificado (${result.caseCount} imágenes).',
      );
      _addEvent(result.resourcesSummary);
    } on Object catch (error) {
      _showError(_friendlyError(error));
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
          _activity = null;
          _downloadProgress = null;
        });
      }
    }
  }

  Future<void> _synchronizeSdk() async {
    setState(() {
      _busy = true;
      _error = null;
      _activity = 'Sincronizando recursos SDK y verificando workflow…';
    });
    try {
      final result = await _runtime.synchronizeSdk();
      if (!mounted) return;
      setState(() => _sdkReady = result.ready);
      _addEvent(
        result.ready
            ? 'SDK ${result.status}; workflow ${result.workflowVersion ?? 'verificado'}. Confirma la recepción de trazas en el dashboard después de sincronizar.'
            : 'SDK ${result.status}; no se habilitaron las corridas de tratamiento.',
      );
    } on Object catch (error) {
      if (mounted) setState(() => _sdkReady = false);
      _showError(_friendlyError(error));
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
          _activity = null;
        });
      }
    }
  }

  Future<void> _runBatch() async {
    final profile = _profile;
    final scenario = _scenario;
    if (profile == null || scenario == null) return;
    setState(() {
      _busy = true;
      _running = true;
      _cancelRequested = false;
      _error = null;
      _activity = 'Ejecutando lote…';
      _batchProgress = 0;
    });
    try {
      final summary = await _runtime.runPhase(
        profile: profile,
        pairRunId: _pairRunIdController.text.trim(),
        condition: _condition,
        scenarioId: scenario.id,
        phase: scenario.phase,
        captureTrace: _traceAllowed,
        isCancelled: () async => _cancelRequested,
        onRecord: (record) {
          if (!mounted) return;
          setState(() {
            _batchProgress = record.repetition / scenario.repetitions;
            _hasJsonl = true;
          });
          _addEvent(
            '#${record.repetition} · ${record.caseId} · ${record.outcome.name}',
          );
        },
      );
      if (!mounted) return;
      setState(() => _hasJsonl = summary.attempted > 0 || _hasJsonl);
      _addEvent(
        summary.stoppedByCancellation
            ? 'Lote cancelado: ${summary.attempted} intentos guardados.'
            : 'Lote completo: ${summary.successes} correctos, ${summary.errors} errores.',
      );
    } on Object catch (error) {
      _showError(_friendlyError(error));
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
          _running = false;
          _activity = null;
          _cancelRequested = false;
        });
      }
    }
  }

  Future<void> _cancelBatch() async {
    setState(() => _cancelRequested = true);
    try {
      await _runtime.cancel();
    } on Object catch (error) {
      _showError(_friendlyError(error));
    }
  }

  Future<void> _changeTracePermission(bool allowed) async {
    setState(() {
      _traceAllowed = allowed;
      _error = null;
    });
    try {
      await _runtime.setTracePermission(allowed);
      _addEvent(
        allowed
            ? 'Permiso de trazas activado.'
            : 'Permiso revocado; se solicitó vaciar las trazas pendientes del SDK.',
      );
    } on Object catch (error) {
      if (mounted && allowed) {
        setState(() => _traceAllowed = false);
      }
      _showError(_friendlyError(error));
    }
  }

  Future<void> _exportJsonl() async {
    setState(() {
      _busy = true;
      _error = null;
      _activity = 'Abriendo exportación local…';
    });
    try {
      await _runtime.exportJsonl();
      _addEvent('JSONL local listo para compartir desde el dispositivo.');
    } on Object catch (error) {
      _showError(_friendlyError(error));
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
          _activity = null;
        });
      }
    }
  }

  ValidationSdkCredentials? _credentialsFromFields() {
    final serverUrl = _serverUrlController.text.trim();
    final credential = _credentialController.text.trim();
    if (serverUrl.isEmpty || credential.isEmpty) return null;
    return ValidationSdkCredentials(
      serverUrl: serverUrl,
      credential: credential,
    );
  }

  Future<void> _selectCondition(ValidationCondition? value) async {
    if (value == null ||
        value == _condition ||
        validationBuildMode != 'selector') {
      return;
    }
    setState(() {
      _condition = value;
      _prepared = null;
      _sdkReady = false;
    });
  }

  void _selectScenario(ValidationScenario? value) {
    if (value == null) return;
    setState(() => _scenario = value);
  }

  void _showError(String message) {
    if (!mounted) return;
    setState(() => _error = message);
  }

  void _addEvent(String event) {
    if (!mounted) return;
    setState(() {
      _status = event;
      _events.insert(0, event);
      if (_events.length > 8) _events.removeLast();
    });
  }

  String _friendlyError(Object error) {
    if (error is ValidationHomeException) return error.message;
    if (error is ValidationExecutionException) return error.message;
    if (error is ValidationBatchException) return error.message;
    if (error is DatasetBundleException) return error.message;
    if (error is ValidationJsonlException) return error.message;
    if (error is DatasetTransportException) {
      return switch (error.code) {
        DatasetTransportErrorCode.unauthorized =>
          'El servidor rechazó la credencial SDK.',
        DatasetTransportErrorCode.offline ||
        DatasetTransportErrorCode.networkFailure =>
          'No se pudo conectar al servidor. Verifica la red y vuelve a intentar.',
        DatasetTransportErrorCode.signedUrlExpired =>
          'La descarga temporal expiró; vuelve a preparar los recursos.',
        _ =>
          'La respuesta del servidor no coincide con el manifiesto esperado.',
      };
    }
    return 'No se completó la acción. Revisa la conexión y la configuración del perfil.';
  }

  @override
  Widget build(BuildContext context) {
    final plan = _plan;
    final profile = _profile;
    final scenario = _scenario;
    return Scaffold(
      appBar: AppBar(title: const Text('Validación ayni_sdk')),
      body: _bootstrapping
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              key: const ValueKey('validation-home-scroll'),
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
              children: [
                _buildProfileCard(profile),
                const SizedBox(height: 12),
                _buildConnectionCard(),
                const SizedBox(height: 12),
                _buildExperimentCard(plan, scenario),
                const SizedBox(height: 12),
                if (validationBuildMode != 'control') ...[
                  _buildTraceCard(),
                  const SizedBox(height: 12),
                ],
                _buildActionsCard(),
                if (_activity != null || _downloadProgress != null) ...[
                  const SizedBox(height: 12),
                  _buildProgressCard(),
                ],
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  _buildErrorCard(_error!),
                ],
                if (_status != null || _events.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  _buildEventsCard(),
                ],
              ],
            ),
    );
  }

  Widget _buildProfileCard(ValidationResourceProfile? profile) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Perfil de recursos',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          Text(
            profile?.isConfigured == true
                ? 'Perfil publicado listo para verificar.'
                : 'Perfil pendiente: completa IDs de versiones publicadas y SHA-256 en assets/validation/experiment_plan.json antes de crear el APK.',
          ),
          const SizedBox(height: 8),
          const Text(
            'El ZIP es un paquete comprimido con manifest.json e imágenes. La app lo descarga del bucket privado y verifica el paquete y cada imagen antes de ejecutar.',
          ),
          if (_prepared case final prepared?) ...[
            const Divider(height: 24),
            Text(
              'Dataset ${prepared.datasetVersion} · ${prepared.caseCount} imágenes',
            ),
            SelectableText('SHA-256 ${prepared.datasetSha256}'),
            Text(prepared.resourcesSummary),
          ],
        ],
      ),
    ),
  );

  Widget _buildConnectionCard() => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Conexión privada',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 10),
          TextField(
            key: const ValueKey('server-url'),
            controller: _serverUrlController,
            enabled: !_busy,
            keyboardType: TextInputType.url,
            decoration: const InputDecoration(
              labelText: 'URL HTTPS del servidor',
              hintText: 'https://api.example.org',
              border: OutlineInputBorder(),
            ),
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: 10),
          TextField(
            key: const ValueKey('sdk-credential'),
            controller: _credentialController,
            enabled: !_busy,
            obscureText: true,
            autocorrect: false,
            enableSuggestions: false,
            decoration: const InputDecoration(
              labelText: 'Credencial SDK',
              border: OutlineInputBorder(),
            ),
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Icon(
                _credentialsSaved ? Icons.lock : Icons.lock_outline,
                size: 18,
              ),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  _credentialsSaved
                      ? 'Credencial guardada de forma segura.'
                      : 'Sin conexión guardada.',
                ),
              ),
              TextButton(
                key: const ValueKey('save-connection'),
                onPressed: _busy || !_hasConnection ? null : _saveConnection,
                child: const Text('Guardar'),
              ),
            ],
          ),
        ],
      ),
    ),
  );

  Widget _buildExperimentCard(
    ExperimentPlan? plan,
    ValidationScenario? scenario,
  ) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Corrida', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 10),
          if (validationBuildMode == 'selector') ...[
            DropdownButtonFormField<ValidationCondition>(
              key: const ValueKey('condition-selector'),
              initialValue: _condition,
              decoration: const InputDecoration(
                labelText: 'Condición',
                border: OutlineInputBorder(),
              ),
              items: const [
                DropdownMenuItem(
                  value: ValidationCondition.control,
                  child: Text('Integración directa'),
                ),
                DropdownMenuItem(
                  value: ValidationCondition.treatment,
                  child: Text('ayni_sdk'),
                ),
              ],
              onChanged: _busy ? null : _selectCondition,
            ),
            const SizedBox(height: 10),
          ] else ...[
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Condición fijada para este APK'),
              subtitle: Text(
                _condition == ValidationCondition.control
                    ? 'Integración directa'
                    : 'ayni_sdk',
              ),
            ),
          ],
          DropdownButtonFormField<ValidationScenario>(
            key: const ValueKey('scenario-selector'),
            initialValue: scenario,
            decoration: const InputDecoration(
              labelText: 'Escenario / fase',
              border: OutlineInputBorder(),
            ),
            items: (plan?.scenarios ?? const <ValidationScenario>[])
                .map(
                  (item) => DropdownMenuItem(
                    value: item,
                    child: Text('${item.id} · ${_phaseLabel(item.phase)}'),
                  ),
                )
                .toList(),
            onChanged: _busy ? null : _selectScenario,
          ),
          const SizedBox(height: 10),
          TextField(
            key: const ValueKey('pair-run-id'),
            controller: _pairRunIdController,
            enabled: !_busy,
            decoration: const InputDecoration(
              labelText: 'run_id pareado',
              border: OutlineInputBorder(),
            ),
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: 8),
          Text(
            scenario == null
                ? 'Elige una fase del Plan.'
                : scenario.phase == ValidationPhase.coldStart
                ? 'PERF-01 se mide con el procedimiento externo del Plan.'
                : '${scenario.repetitions} repeticiones · bloques ${scenario.blockSizes.join(' / ')}',
          ),
        ],
      ),
    ),
  );

  Widget _buildTraceCard() => Card(
    child: Column(
      children: [
        SwitchListTile(
          key: const ValueKey('trace-permission-switch'),
          value: _traceAllowed,
          onChanged: _busy ? null : _changeTracePermission,
          title: const Text('Autorizar trazas técnicas SDK'),
          subtitle: const Text(ValidationPreferences.tracePermissionDisclosure),
          controlAffinity: ListTileControlAffinity.trailing,
        ),
      ],
    ),
  );

  Widget _buildActionsCard() => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          FilledButton(
            key: const ValueKey('prepare-resources'),
            onPressed: _canPrepare ? _prepareResources : null,
            child: const Text('Preparar recursos'),
          ),
          FilledButton.tonal(
            key: const ValueKey('run-batch'),
            onPressed: _canRun ? _runBatch : null,
            child: const Text('Ejecutar lote'),
          ),
          OutlinedButton(
            key: const ValueKey('cancel-batch'),
            onPressed: _running ? _cancelBatch : null,
            child: const Text('Cancelar'),
          ),
          if (validationBuildMode != 'control')
            OutlinedButton(
              key: const ValueKey('sync-sdk'),
              onPressed:
                  !_busy &&
                      _condition == ValidationCondition.treatment &&
                      _prepared != null
                  ? _synchronizeSdk
                  : null,
              child: const Text('Sincronizar SDK'),
            ),
          OutlinedButton.icon(
            key: const ValueKey('export-jsonl'),
            onPressed: !_busy && _hasJsonl ? _exportJsonl : null,
            icon: const Icon(Icons.ios_share),
            label: const Text('Exportar JSONL'),
          ),
        ],
      ),
    ),
  );

  Widget _buildProgressCard() => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            _activity ?? 'Procesando…',
            key: const ValueKey('activity-text'),
          ),
          const SizedBox(height: 10),
          LinearProgressIndicator(
            value: _running ? _batchProgress : _downloadProgress,
          ),
          if (_running)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                '${(_batchProgress * (_scenario?.repetitions ?? 0)).floor()} / ${_scenario?.repetitions ?? 0}',
                key: const ValueKey('batch-progress-text'),
              ),
            ),
        ],
      ),
    ),
  );

  Widget _buildErrorCard(String message) => Card(
    key: const ValueKey('validation-error-card'),
    color: Theme.of(context).colorScheme.errorContainer,
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Text(message, key: const ValueKey('error-message')),
    ),
  );

  Widget _buildEventsCard() => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Estado y trazas locales',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          if (_status != null) ...[
            const SizedBox(height: 8),
            Text(_status!, key: const ValueKey('status-text')),
          ],
          if (_events.isNotEmpty) ...[
            const Divider(),
            for (final event in _events.skip(1).take(5))
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 3),
                child: Text(event),
              ),
          ],
        ],
      ),
    ),
  );

  static String _phaseLabel(ValidationPhase phase) => switch (phase) {
    ValidationPhase.coldStart => 'arranque en frío',
    ValidationPhase.warmup => 'calentamiento',
    ValidationPhase.measured => 'medición',
    ValidationPhase.stress => 'estrés',
    ValidationPhase.fault => 'fallo',
  };
}
