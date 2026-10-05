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

// Hallmark · macrostructure: Workbench · theme: existing Ayni Material green · variation: key → one run control → activity ledger · critique P5 H5 E4 S5 R5 V5 · contrast/a11y: pass
const _defaultValidationServerUrl =
    'https://ayni-sdk-monorepo-server.vercel.app/';

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

  Future<ValidationSyncState> synchronizeSdk({bool verifyWorkflow = true});

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
          : 'Workflow ${profile.treatmentWorkflowVersion} verificado.',
    );
  }

  @override
  Future<ValidationSyncState> synchronizeSdk({
    bool verifyWorkflow = true,
  }) async {
    final runner = _sdkRunner;
    final dataset = _dataset;
    if (runner == null || dataset == null) {
      throw const ValidationHomeException(
        'treatmentNotPrepared',
        'Prepara primero los recursos de ayni_sdk.',
      );
    }
    if (verifyWorkflow) _sdkReadyForRuns = false;
    final result = await runner.synchronize();
    if (result.status != SyncStatus.updated &&
        result.status != SyncStatus.upToDate) {
      return ValidationSyncState(
        status: result.status.name,
        ready: _sdkReadyForRuns,
      );
    }
    if (!verifyWorkflow) {
      return ValidationSyncState(
        status: result.status.name,
        ready: _sdkReadyForRuns,
        workflowVersion: _plan?.activeResourceProfile.treatmentWorkflowVersion,
      );
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
  final _credentialController = TextEditingController();
  ExperimentPlan? _plan;
  bool _bootstrapping = true;
  bool _busy = false;
  bool _running = false;
  bool _cancelRequested = false;
  bool _traceAllowed = false;
  bool _hasJsonl = false;
  double? _downloadProgress;
  int _completedRuns = 0;
  int _totalRuns = 0;
  String? _activity;
  String? _status;
  String? _error;
  final List<String> _events = [];
  static const _automaticPhases = {
    ValidationPhase.warmup,
    ValidationPhase.measured,
    ValidationPhase.stress,
  };

  @override
  void initState() {
    super.initState();
    _runtime = widget.runtime ?? DefaultValidationHomeRuntime();
    unawaited(_bootstrap());
  }

  @override
  void dispose() {
    _credentialController.dispose();
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
        _traceAllowed = results[2]! as bool;
        _hasJsonl = results[3]! as bool;
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

  List<ValidationCondition> get _conditions => switch (validationBuildMode) {
    'control' => const [ValidationCondition.control],
    'treatment' => const [ValidationCondition.treatment],
    _ => const [ValidationCondition.control, ValidationCondition.treatment],
  };

  List<ValidationScenario> get _automaticScenarios => (_plan?.scenarios ?? [])
      .where(
        (scenario) =>
            _automaticPhases.contains(scenario.phase) &&
            !scenario.requiresExternalMeasurement,
      )
      .toList(growable: false);

  int get _plannedRuns =>
      _automaticScenarios.fold<int>(
        0,
        (total, item) => total + item.repetitions,
      ) *
      _conditions.length;

  bool get _canStart =>
      !_busy &&
      (_profile?.isConfigured ?? false) &&
      _credentialController.text.trim().isNotEmpty &&
      _automaticScenarios.isNotEmpty;

  Future<void> _runValidation() async {
    final profile = _profile;
    final credentials = _credentialsFromFields();
    final plan = _plan;
    if (profile == null || credentials == null || plan == null) return;

    var captureTrace = _traceAllowed;
    if (!captureTrace) {
      final choice = await _askTracePermission();
      if (choice == null) return;
      captureTrace = choice;
      if (captureTrace && !await _persistTracePermission(true)) return;
    }

    final scenarios = _automaticScenarios;
    final totalRuns = _plannedRuns;
    final pairRunId = 'pair-${DateTime.now().toUtc().millisecondsSinceEpoch}';
    var treatmentPrepared = false;
    var completedRuns = 0;
    setState(() {
      _busy = true;
      _running = true;
      _cancelRequested = false;
      _error = null;
      _status = null;
      _activity = 'Guardando SDK Key…';
      _downloadProgress = null;
      _completedRuns = 0;
      _totalRuns = totalRuns;
    });

    try {
      await _runtime.saveCredentials(credentials);
      _addEvent('SDK Key guardada en almacenamiento seguro.');

      for (final condition in _conditions) {
        if (_cancelRequested) break;
        setState(() {
          _activity = 'Preparando ${_conditionLabel(condition)}…';
          _downloadProgress = null;
        });
        final prepared = await _runtime.prepareResources(
          profile: profile,
          credentials: credentials,
          condition: condition,
          onDownloadProgress: (received, total) {
            if (!mounted) return;
            setState(() {
              _downloadProgress = total <= 0 ? null : received / total;
            });
          },
        );
        _addEvent(
          'Dataset ${prepared.datasetVersion} verificado · ${prepared.caseCount} imágenes.',
        );
        _addEvent(prepared.resourcesSummary);
        if (_cancelRequested) break;

        if (condition == ValidationCondition.treatment) {
          treatmentPrepared = true;
          setState(() {
            _activity = 'Sincronizando SDK y verificando workflow…';
            _downloadProgress = null;
          });
          final sync = await _runtime.synchronizeSdk();
          if (!sync.ready) {
            throw ValidationHomeException(
              'sdkSyncFailed',
              'La sincronización SDK terminó con estado ${sync.status}. Revisa la conexión y vuelve a iniciar.',
            );
          }
          _addEvent(
            'SDK ${sync.status} · workflow ${sync.workflowVersion ?? 'verificado'}.',
          );
        }

        for (final scenario in scenarios) {
          if (_cancelRequested) break;
          setState(() {
            _activity =
                '${_conditionLabel(condition)} · ${_phaseLabel(scenario.phase)}';
            _downloadProgress = null;
          });
          final phaseStart = completedRuns;
          final summary = await _runtime.runPhase(
            profile: profile,
            pairRunId: pairRunId,
            condition: condition,
            scenarioId: scenario.id,
            phase: scenario.phase,
            captureTrace:
                condition == ValidationCondition.treatment && captureTrace,
            isCancelled: () async => _cancelRequested,
            onRecord: (record) {
              if (!mounted) return;
              final count = phaseStart + record.repetition;
              setState(() {
                _completedRuns = count.clamp(0, totalRuns).toInt();
                _hasJsonl = true;
              });
              if (record.repetition == 1 ||
                  record.repetition % 100 == 0 ||
                  record.repetition == scenario.repetitions) {
                _addEvent(
                  '${_conditionLabel(condition)} · ${scenario.id} · #${record.repetition} · ${record.outcome.name}',
                );
              }
            },
          );
          completedRuns = phaseStart + summary.attempted;
          if (mounted) {
            setState(() {
              _completedRuns = completedRuns.clamp(0, totalRuns).toInt();
              _hasJsonl = summary.attempted > 0 || _hasJsonl;
            });
          }
          if (summary.stoppedByCancellation) break;
        }
        if (_cancelRequested) break;
      }

      if (treatmentPrepared) {
        setState(() {
          _activity = 'Enviando trazas autorizadas…';
          _downloadProgress = null;
        });
        final sync = await _runtime.synchronizeSdk(verifyWorkflow: false);
        if (sync.status == 'updated' || sync.status == 'upToDate') {
          _addEvent(
            'Sincronización SDK ${sync.status}; confirma la recepción de trazas en el dashboard.',
          );
        } else {
          _addEvent(
            'Sin conexión para sincronizar trazas (${sync.status}); los resultados JSONL siguen en el dispositivo.',
          );
        }
      }

      if (!mounted) return;
      final wasCancelled = _cancelRequested;
      final status = wasCancelled
          ? 'Validación cancelada · $_completedRuns de $_totalRuns intentos guardados.'
          : 'Validación terminada · $_completedRuns de $_totalRuns intentos guardados.';
      setState(() => _status = status);
      _addEvent(status);
    } on Object catch (error) {
      _showError(_friendlyError(error));
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
          _running = false;
          _activity = null;
          _downloadProgress = null;
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

  Future<bool?> _askTracePermission() => showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('Trazas técnicas SDK'),
      content: const Text(ValidationPreferences.tracePermissionDisclosure),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context, false),
          child: const Text('Ejecutar sin trazas'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(context, true),
          child: const Text('Autorizar y ejecutar'),
        ),
      ],
    ),
  );

  Future<void> _manageTracePermission() async {
    if (_busy) return;
    final allowed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(
          _traceAllowed ? 'Trazas autorizadas' : 'Trazas técnicas SDK',
        ),
        content: const Text(ValidationPreferences.tracePermissionDisclosure),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cerrar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, !_traceAllowed),
            child: Text(_traceAllowed ? 'Revocar permiso' : 'Autorizar trazas'),
          ),
        ],
      ),
    );
    if (allowed != null) await _persistTracePermission(allowed);
  }

  Future<bool> _persistTracePermission(bool allowed) async {
    if (!allowed) setState(() => _traceAllowed = false);
    try {
      await _runtime.setTracePermission(allowed);
      if (!mounted) return false;
      setState(() {
        _traceAllowed = allowed;
        _error = null;
      });
      _addEvent(
        allowed
            ? 'Permiso de trazas activado.'
            : 'Permiso revocado; se vaciaron las trazas SDK pendientes.',
      );
      return true;
    } on Object catch (error) {
      if (mounted && allowed) {
        setState(() => _traceAllowed = false);
      }
      _showError(_friendlyError(error));
      return false;
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
    final credential = _credentialController.text.trim();
    if (credential.isEmpty) return null;
    return ValidationSdkCredentials(
      serverUrl: _defaultValidationServerUrl,
      credential: credential,
    );
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
    final profile = _profile;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Validación'),
        actions: [
          PopupMenuButton<String>(
            tooltip: 'Opciones de validación',
            onSelected: (value) {
              if (value == 'traces') unawaited(_manageTracePermission());
              if (value == 'export') unawaited(_exportJsonl());
            },
            itemBuilder: (context) => [
              PopupMenuItem(
                value: 'traces',
                child: Text(
                  _traceAllowed
                      ? 'Revocar permiso de trazas'
                      : 'Permitir trazas técnicas',
                ),
              ),
              if (_hasJsonl)
                const PopupMenuItem(
                  value: 'export',
                  child: Text('Exportar JSONL'),
                ),
            ],
          ),
        ],
      ),
      body: _bootstrapping
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              key: const ValueKey('validation-home-scroll'),
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
              children: [
                Text(
                  'Ejecuta las fases automáticas del plan.',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 8),
                Text(
                  'La app prepara los recursos, instala y sincroniza ayni_sdk, y guarda los resultados localmente.',
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
                const SizedBox(height: 16),
                _buildConnectionCard(),
                const SizedBox(height: 12),
                _buildActionsCard(profile),
                if (_busy || _totalRuns > 0) ...[
                  const SizedBox(height: 12),
                  _buildProgressCard(),
                ],
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  _buildErrorCard(_error!),
                ],
                const SizedBox(height: 12),
                _buildEventsCard(),
                const SizedBox(height: 12),
                Text(
                  'Arranque en frío (PERF-01) y fallos F1–F6 requieren medición o intervención externa y quedan pendientes.',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
    );
  }

  Widget _buildConnectionCard() => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Conexión SDK', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          TextField(
            key: const ValueKey('sdk-credential'),
            controller: _credentialController,
            enabled: !_busy,
            obscureText: true,
            autocorrect: false,
            enableSuggestions: false,
            decoration: const InputDecoration(
              labelText: 'SDK Key',
              hintText: 'ayni_sk_…',
              border: OutlineInputBorder(),
            ),
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: 8),
          Text(
            'Servidor de producción · la clave se guarda de forma segura al iniciar.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    ),
  );

  Widget _buildActionsCard(ValidationResourceProfile? profile) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Plan de pruebas',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          Text(
            profile?.isConfigured == true
                ? '${_automaticScenarios.length} fases automáticas · ${_conditions.length} ${_conditions.length == 1 ? 'condición' : 'condiciones'} · $_plannedRuns intentos previstos.'
                : 'Faltan los IDs publicados o los hashes del perfil en el APK.',
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              key: const ValueKey('run-validation'),
              onPressed: _running
                  ? _cancelBatch
                  : _canStart
                  ? _runValidation
                  : null,
              icon: Icon(
                _running ? Icons.stop_circle_outlined : Icons.play_arrow,
              ),
              label: Text(
                _running ? 'Cancelar validación' : 'Iniciar validación',
              ),
            ),
          ),
        ],
      ),
    ),
  );

  Widget _buildProgressCard() => Card(
    key: const ValueKey('validation-progress'),
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            _activity ?? 'Procesando…',
            key: const ValueKey('activity-text'),
          ),
          const SizedBox(height: 8),
          LinearProgressIndicator(
            value: _totalRuns > 0
                ? _completedRuns / _totalRuns
                : _downloadProgress,
            semanticsLabel: 'Progreso de la validación',
          ),
          if (_totalRuns > 0)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                '$_completedRuns / $_totalRuns · ${((_completedRuns / _totalRuns) * 100).floor()}%',
                key: const ValueKey('validation-progress-text'),
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
    key: const ValueKey('validation-events'),
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Actividad y trazas',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 4),
          Text(
            _traceAllowed
                ? 'Se intentará sincronizarlas al terminar si la política del servidor las permite; el JSONL queda local.'
                : 'Sin autorización no se capturan trazas SDK; el JSONL queda local.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          if (_status != null) ...[
            const SizedBox(height: 8),
            Text(_status!, key: const ValueKey('status-text')),
          ],
          if (_events.isNotEmpty) ...[
            const Divider(),
            for (final event in _events.skip(1).take(5))
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Text(event),
              ),
          ] else if (_status == null) ...[
            const SizedBox(height: 8),
            const Text('La actividad de la corrida aparecerá aquí.'),
          ],
        ],
      ),
    ),
  );

  static String _conditionLabel(ValidationCondition condition) =>
      condition == ValidationCondition.control ? 'Directa' : 'ayni_sdk';

  static String _phaseLabel(ValidationPhase phase) => switch (phase) {
    ValidationPhase.coldStart => 'arranque en frío',
    ValidationPhase.warmup => 'calentamiento',
    ValidationPhase.measured => 'medición',
    ValidationPhase.stress => 'estrés',
    ValidationPhase.fault => 'fallo',
  };
}
