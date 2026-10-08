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
import '../validation_lab_launch.dart';
import '../validation_performance_trace.dart';
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

  Future<ValidationSyncState> synchronizeSdk({
    required ValidationResourceProfile profile,
    bool verifyWorkflow = true,
    bool uploadPendingTraces = true,
  });

  Future<BatchRunSummary> runPhase({
    required ValidationResourceProfile profile,
    required String pairRunId,
    required ValidationCondition condition,
    required String scenarioId,
    required ValidationPhase phase,
    String? coldStartRunLabel,
    required bool captureTrace,
    required Future<bool> Function() isCancelled,
    required void Function(ValidationRunRecord record) onRecord,
  });

  Future<BatchRunSummary> runSuite({
    required String pairRunId,
    required List<ValidationCondition> conditions,
    bool quickRun = false,
    required bool captureTrace,
    required Future<bool> Function() isCancelled,
    required void Function(ValidationRunRecord record) onRecord,
    required void Function(ValidationSuiteProgress progress) onProgress,
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
    this.issues = const [],
  });

  final String status;
  final bool ready;
  final String? workflowVersion;
  final List<String> issues;
}

class DefaultValidationHomeRuntime implements ValidationHomeRuntime {
  DefaultValidationHomeRuntime({
    ValidationPreferences? preferences,
    AssetBundle? assetBundle,
    Future<Directory> Function()? documentsDirectory,
    String buildMode = validationBuildMode,
    ValidationPerformanceTrace? performanceTrace,
  }) : _preferences =
           preferences ??
           ValidationPreferences(secureStore: FlutterValidationSecureStore()),
       _assetBundle = assetBundle ?? rootBundle,
       _documentsDirectoryProvider =
           documentsDirectory ?? getApplicationDocumentsDirectory,
       _buildMode = buildMode,
       _performanceTrace =
           performanceTrace ?? const ValidationPerformanceTrace(enabled: false);

  final ValidationPreferences _preferences;
  final AssetBundle _assetBundle;
  final Future<Directory> Function() _documentsDirectoryProvider;
  final String _buildMode;
  final ValidationPerformanceTrace _performanceTrace;
  final ValidationRunMetadataReader _metadataReader =
      const ValidationRunMetadataReader();
  ExperimentPlan? _plan;
  ValidationSdkCredentials? _credentials;
  final Map<String, VerifiedDataset> _datasets = {};
  final Map<String, DirectTfliteRunner> _directRunners = {};
  final Map<String, AyniSdkValidationRunner> _sdkRunners = {};
  final Set<String> _sdkReadyProfileIds = {};
  HttpDatasetTransport? _datasetTransport;
  HttpValidationModelRepository? _modelRepository;
  HttpWorkflowDefinitionRepository? _workflowRepository;
  ValidationBatchController? _batchController;
  Future<Directory>? _documentsDirectory;

  @override
  Future<ExperimentPlan> loadPlan() async {
    if (!isValidationBuildModeValid(_buildMode)) {
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
    final previous = _credentials;
    if (previous != null &&
        (previous.serverUrl != credentials.serverUrl ||
            previous.credential != credentials.credential)) {
      await _closeRepositories();
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
      buildMode: _buildMode,
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
    await _ensureRepositories(credentials);
    final documents = await _getDocumentsDirectory();
    final validationDirectory = Directory(
      '${documents.path}${Platform.pathSeparator}validation',
    );
    final datasetsDirectory = Directory(
      '${validationDirectory.path}${Platform.pathSeparator}datasets',
    );
    final dataset =
        _datasets[profile.id] ??
        await DatasetRepository(
          transport: _datasetTransport!,
          datasetsDirectory: datasetsDirectory,
          datasetVersionId: profile.datasetVersionId,
          expectedArchiveSha256: profile.datasetSha256,
          expectedPartition: profile.datasetPartition,
        ).prepare(profile.datasetVersionId, onProgress: onDownloadProgress);
    _datasets[profile.id] = dataset;

    if (runnerKind == ValidationRunnerKind.direct) {
      final runner = _directRunners.putIfAbsent(
        profile.id,
        () => DirectTfliteRunner(
          profile: profile,
          modelRepository: _modelRepository!,
          workflowDefinitions: _workflowRepository!,
        ),
      );
      await runner.prepare();
    } else if (runnerKind == ValidationRunnerKind.sdk) {
      final runner = await _getSdkRunner(credentials, profile);
      await runner.prepare();
      _sdkReadyProfileIds.remove(profile.id);
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
          ? '${profile.modelRequirements.length} modelo(s) verificado(s) para CPU.'
          : 'Workflow ${profile.treatmentWorkflowVersion} verificado.',
    );
  }

  @override
  Future<ValidationSyncState> synchronizeSdk({
    required ValidationResourceProfile profile,
    bool verifyWorkflow = true,
    bool uploadPendingTraces = true,
  }) async {
    final runner = _sdkRunners[profile.id];
    final dataset = _datasets[profile.id];
    if (runner == null || dataset == null) {
      throw const ValidationHomeException(
        'treatmentNotPrepared',
        'Prepara primero los recursos de ayni_sdk.',
      );
    }
    if (verifyWorkflow) _sdkReadyProfileIds.remove(profile.id);
    await runner.activate();
    final result = await runner.synchronize(
      uploadPendingTraces: uploadPendingTraces,
    );
    if (result.status != SyncStatus.updated &&
        result.status != SyncStatus.upToDate) {
      return ValidationSyncState(
        status: result.status.name,
        ready: _sdkReadyProfileIds.contains(profile.id),
        issues: result.resources
            .map((resource) => resource.message)
            .whereType<String>()
            .toList(growable: false),
      );
    }
    if (!verifyWorkflow) {
      return ValidationSyncState(
        status: result.status.name,
        ready: _sdkReadyProfileIds.contains(profile.id),
        workflowVersion: profile.treatmentWorkflowVersion,
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
    _sdkReadyProfileIds.add(profile.id);
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
    String? coldStartRunLabel,
    required bool captureTrace,
    required Future<bool> Function() isCancelled,
    required void Function(ValidationRunRecord record) onRecord,
  }) async {
    final runner = condition == ValidationCondition.control
        ? _directRunners[profile.id]
        : _sdkRunners[profile.id];
    final dataset = _datasets[profile.id];
    if (runner == null || dataset == null || runner.condition != condition) {
      throw const ValidationHomeException(
        'resourcesNotPrepared',
        'Prepara los recursos de la condición seleccionada antes de ejecutar.',
      );
    }
    if (condition == ValidationCondition.treatment &&
        !_sdkReadyProfileIds.contains(profile.id)) {
      throw const ValidationHomeException(
        'sdkNotSynced',
        'Sincroniza ayni_sdk y verifica el workflow antes de ejecutar.',
      );
    }
    if (runner is AyniSdkValidationRunner) await runner.activate();
    final store = ValidationJsonlStore(await _resultFile());
    final batch = ValidationBatchController(
      store: store,
      metadata: await _metadataReader.read(),
      performanceTrace: _performanceTrace,
    );
    _batchController = batch;
    return batch.runPhase(
      plan: _plan ?? await loadPlan(),
      pairRunId: pairRunId,
      runner: runner,
      dataset: dataset,
      scenarioId: scenarioId,
      phase: phase,
      coldStartRunLabel: coldStartRunLabel,
      captureTrace: captureTrace,
      isCancelled: isCancelled,
      onRecord: onRecord,
    );
  }

  @override
  Future<BatchRunSummary> runSuite({
    required String pairRunId,
    required List<ValidationCondition> conditions,
    bool quickRun = false,
    required bool captureTrace,
    required Future<bool> Function() isCancelled,
    required void Function(ValidationRunRecord record) onRecord,
    required void Function(ValidationSuiteProgress progress) onProgress,
  }) async {
    final plan = _plan ?? await loadPlan();
    final batch = ValidationBatchController(
      store: ValidationJsonlStore(await _resultFile()),
      metadata: await _metadataReader.read(),
      performanceTrace: _performanceTrace,
    );
    _batchController = batch;
    final runnersByProfileId =
        <String, Map<ValidationCondition, ValidationConditionRunner>>{};
    for (final profile in plan.resourceProfiles) {
      final runners = <ValidationCondition, ValidationConditionRunner>{};
      final direct = _directRunners[profile.id];
      final sdk = _sdkRunners[profile.id];
      if (direct != null) runners[ValidationCondition.control] = direct;
      if (sdk != null) runners[ValidationCondition.treatment] = sdk;
      runnersByProfileId[profile.id] = runners;
    }
    return batch.runSuite(
      plan: plan,
      pairRunId: pairRunId,
      datasetsByProfileId: _datasets,
      runnersByProfileId: runnersByProfileId,
      conditions: conditions,
      quickRun: quickRun,
      captureTrace: captureTrace,
      isCancelled: isCancelled,
      onRecord: onRecord,
      onProgress: onProgress,
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
    if (_sdkRunners.isNotEmpty) {
      await _sdkRunners.values.first.clearPendingTracesForRevocation();
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
    final profile = plan.resourceProfiles.firstWhere(
      (profile) => profile.isConfigured,
    );
    final runner = await _getSdkRunner(credentials, profile);
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
    final current = _sdkRunners[profile.id];
    if (current != null) return current;
    await _ensureRepositories(credentials);
    final documents = await _getDocumentsDirectory();
    final validationDirectory = Directory(
      '${documents.path}${Platform.pathSeparator}validation',
    );
    final runner = AyniSdkValidationRunner(
      profile: profile,
      credentials: credentials,
      storageDirectory: Directory(
        '${validationDirectory.path}${Platform.pathSeparator}sdk',
      ),
      sdk: PublicAyniSdkClient(),
      modelRepository: _modelRepository!,
      workflowDefinitions: _workflowRepository!,
      preferences: _preferences,
    );
    _sdkRunners[profile.id] = runner;
    return runner;
  }

  Future<void> _ensureRepositories(ValidationSdkCredentials credentials) async {
    if (_datasetTransport != null) return;
    final serverUrl = Uri.parse(credentials.serverUrl);
    final documents = await _getDocumentsDirectory();
    final validationDirectory = Directory(
      '${documents.path}${Platform.pathSeparator}validation',
    );
    _datasetTransport = HttpDatasetTransport(
      serverUrl: serverUrl,
      credential: credentials.credential,
    );
    _modelRepository = HttpValidationModelRepository(
      serverUrl: serverUrl,
      credential: credentials.credential,
      modelsDirectory: Directory(
        '${validationDirectory.path}${Platform.pathSeparator}models',
      ),
    );
    _workflowRepository = HttpWorkflowDefinitionRepository(
      serverUrl: serverUrl,
      credential: credentials.credential,
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
    for (final runner in _directRunners.values) {
      await runner.close();
    }
    for (final runner in _sdkRunners.values) {
      await runner.close();
    }
    _datasetTransport?.close(force: true);
    _modelRepository?.close(force: true);
    _workflowRepository?.close(force: true);
    _datasetTransport = null;
    _modelRepository = null;
    _workflowRepository = null;
    _datasets.clear();
    _directRunners.clear();
    _sdkRunners.clear();
    _sdkReadyProfileIds.clear();
  }
}

class ValidationHomeException implements Exception {
  const ValidationHomeException(this.code, this.message);

  final String code;
  final String message;
}

class ValidationHomePage extends StatefulWidget {
  const ValidationHomePage({
    super.key,
    this.runtime,
    this.labLaunch,
    this.performanceTrace,
  });

  final ValidationHomeRuntime? runtime;
  final ValidationLabLaunch? labLaunch;
  final ValidationPerformanceTrace? performanceTrace;

  @override
  State<ValidationHomePage> createState() => _ValidationHomePageState();
}

class _ValidationHomePageState extends State<ValidationHomePage> {
  late final ValidationHomeRuntime _runtime;
  late final ValidationPerformanceTrace _performanceTrace;
  final _credentialController = TextEditingController();
  ExperimentPlan? _plan;
  bool _bootstrapping = true;
  bool _busy = false;
  bool _running = false;
  bool _cancelRequested = false;
  bool _traceAllowed = false;
  bool _hasJsonl = false;
  bool _runFinished = false;
  double? _downloadProgress;
  int _completedRuns = 0;
  int _totalRuns = 0;
  String? _activity;
  String? _status;
  String? _error;
  final List<String> _events = [];
  String get _buildMode =>
      widget.labLaunch?.condition.name ?? validationBuildMode;
  static const _automaticPhases = {
    ValidationPhase.warmup,
    ValidationPhase.measured,
    ValidationPhase.stress,
  };

  @override
  void initState() {
    super.initState();
    _performanceTrace =
        widget.performanceTrace ??
        ValidationPerformanceTrace(enabled: widget.labLaunch != null);
    _runtime =
        widget.runtime ??
        DefaultValidationHomeRuntime(
          buildMode: _buildMode,
          performanceTrace: _performanceTrace,
        );
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
      if (widget.labLaunch != null) unawaited(_runPerf01());
    } on Object catch (error) {
      if (!mounted) return;
      setState(() {
        _bootstrapping = false;
        _error = _friendlyError(error);
      });
    }
  }

  ValidationResourceProfile? get _profile {
    final profiles =
        _plan?.resourceProfiles ?? const <ValidationResourceProfile>[];
    return profiles
        .where((profile) => profile.id == 'SEG-01' && profile.isConfigured)
        .firstOrNull;
  }

  List<ValidationCondition> get _conditions => switch (_buildMode) {
    'control' => const [ValidationCondition.control],
    'treatment' => const [ValidationCondition.treatment],
    _ => const [ValidationCondition.control, ValidationCondition.treatment],
  };

  List<ValidationScenario> get _allAutomaticScenarios =>
      (_plan?.scenarios ?? [])
          .where(
            (scenario) =>
                _automaticPhases.contains(scenario.phase) &&
                !scenario.requiresExternalMeasurement,
          )
          .toList(growable: false);

  List<ValidationResourceProfile> get _suiteProfiles {
    final plan = _plan;
    if (plan == null) return const [];
    final ids = _allAutomaticScenarios
        .map((scenario) => scenario.resourceProfileId!)
        .toSet();
    return [
      for (final profile in plan.resourceProfiles)
        if (ids.contains(profile.id)) profile,
    ];
  }

  List<ValidationResourceProfile> get _readySuiteProfiles => _suiteProfiles
      .where((profile) => profile.isConfigured)
      .toList(growable: false);

  List<String> get _pendingProfileIds => _suiteProfiles
      .where((profile) => !profile.isConfigured)
      .map((profile) => profile.id)
      .toList(growable: false);

  List<ValidationScenario> get _automaticScenarios {
    final readyProfileIds = _readySuiteProfiles
        .map((profile) => profile.id)
        .toSet();
    return _allAutomaticScenarios
        .where(
          (scenario) => readyProfileIds.contains(scenario.resourceProfileId),
        )
        .toList(growable: false);
  }

  int get _plannedRuns =>
      _automaticScenarios.fold<int>(
        0,
        (total, item) =>
            total +
            ValidationBatchController.repetitionsFor(item, quickRun: false),
      ) *
      _conditions.length;

  int get _quickPlannedRuns =>
      _automaticScenarios.fold<int>(
        0,
        (total, item) =>
            total +
            ValidationBatchController.repetitionsFor(item, quickRun: true),
      ) *
      _conditions.length;

  bool get _canStart =>
      !_busy &&
      _readySuiteProfiles.isNotEmpty &&
      _credentialController.text.trim().isNotEmpty &&
      _automaticScenarios.isNotEmpty;

  Future<void> _runPerf01() async {
    final launch = widget.labLaunch;
    final profile = _profile;
    final credentials = _credentialsFromFields();
    if (launch == null || profile == null || credentials == null) return;

    const totalRuns = 1;
    setState(() {
      _busy = true;
      _running = true;
      _runFinished = false;
      _cancelRequested = false;
      _error = null;
      _status = null;
      _activity = '${launch.runLabel} · preparación';
      _completedRuns = 0;
      _totalRuns = totalRuns;
    });

    try {
      await _runtime.prepareResources(
        profile: profile,
        credentials: credentials,
        condition: launch.condition,
      );
      if (launch.condition == ValidationCondition.treatment) {
        final sync = await _runtime.synchronizeSdk(profile: profile);
        if (!sync.ready) {
          throw ValidationHomeException(
            'sdkSyncFailed',
            _sdkSyncFailureMessage(profile.id, sync),
          );
        }
      }
      await _runtime.runPhase(
        profile: profile,
        pairRunId:
            'perf01-${launch.condition.name}-${launch.runLabel}-${DateTime.now().toUtc().microsecondsSinceEpoch}',
        condition: launch.condition,
        scenarioId: 'PERF-01',
        phase: ValidationPhase.coldStart,
        coldStartRunLabel: launch.runLabel,
        captureTrace: false,
        isCancelled: () async => false,
        onRecord: (record) {
          if (!mounted) return;
          setState(() {
            _completedRuns = 1;
            _hasJsonl = true;
          });
          _addEvent(
            '${launch.runLabel} · ${_conditionLabel(launch.condition)} · ${record.durationMicros} µs · ${record.outcome.name}',
          );
        },
      );
      await _performanceTrace.finishColdStart();
      if (mounted) {
        setState(() => _status = '${launch.runLabel} · medición guardada.');
      }
    } on Object catch (error) {
      _showError(_friendlyError(error));
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
          _running = false;
          _activity = null;
          _runFinished = true;
        });
      }
    }
  }

  Future<void> _runValidation({bool quickRun = false}) async {
    final credentials = _credentialsFromFields();
    final plan = _plan;
    if (credentials == null ||
        plan == null ||
        _readySuiteProfiles.isEmpty ||
        _automaticScenarios.isEmpty) {
      return;
    }

    var captureTrace = _traceAllowed;
    if (!captureTrace) {
      final choice = await _askTracePermission();
      if (choice == null) return;
      captureTrace = choice;
      if (captureTrace && !await _persistTracePermission(true)) return;
    }

    final scenarios = _automaticScenarios;
    final totalRuns = quickRun ? _quickPlannedRuns : _plannedRuns;
    final pairRunId =
        '${quickRun ? 'quick' : 'pair'}-${DateTime.now().toUtc().millisecondsSinceEpoch}';
    var treatmentPrepared = false;
    setState(() {
      _busy = true;
      _running = true;
      _runFinished = false;
      _cancelRequested = false;
      _error = null;
      _status = null;
      _activity = 'Guardando SDK Key…';
      _downloadProgress = null;
      _completedRuns = 0;
      _totalRuns = totalRuns;
    });
    if (quickRun) {
      _addEvent(
        'Prueba rápida iniciada: ${ValidationBatchController.quickRunPercentage}% de los intentos del plan.',
      );
    }

    try {
      await _runtime.saveCredentials(credentials);
      _addEvent('SDK Key guardada en almacenamiento seguro.');

      for (final profile in _readySuiteProfiles) {
        for (final condition in _conditions) {
          if (_cancelRequested) break;
          setState(() {
            _activity =
                '${profile.id} · preparando ${_conditionLabel(condition)}…';
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
            '${profile.id} · dataset ${prepared.datasetVersion} verificado · ${prepared.caseCount} imágenes.',
          );
          _addEvent('${profile.id} · ${prepared.resourcesSummary}');
          if (_cancelRequested) break;

          if (condition == ValidationCondition.treatment) {
            treatmentPrepared = true;
            setState(() {
              _activity =
                  '${profile.id} · sincronizando SDK; la primera descarga puede tardar unos minutos…';
              _downloadProgress = null;
            });
            final sync = await _runtime.synchronizeSdk(
              profile: profile,
              uploadPendingTraces: false,
            );
            if (!sync.ready) {
              throw ValidationHomeException(
                'sdkSyncFailed',
                _sdkSyncFailureMessage(profile.id, sync),
              );
            }
            _addEvent(
              '${profile.id} · SDK ${sync.status} · workflow ${sync.workflowVersion ?? 'verificado'}.',
            );
          }
        }
        if (_cancelRequested) break;
      }

      if (!_cancelRequested) {
        setState(() {
          _activity = 'Verificando todos los perfiles antes de medir…';
          _downloadProgress = null;
        });
        final phaseSummary = await _runtime.runSuite(
          pairRunId: pairRunId,
          conditions: _conditions,
          quickRun: quickRun,
          captureTrace: captureTrace,
          isCancelled: () async => _cancelRequested,
          onRecord: (record) {
            if (!mounted) return;
            setState(() {
              _hasJsonl = true;
            });
            final scenario = scenarios.singleWhere(
              (item) => item.id == record.scenarioId,
            );
            if (record.repetition == 1 ||
                record.repetition % 100 == 0 ||
                record.repetition == scenario.repetitions) {
              _addEvent(
                '${_conditionLabel(record.condition)} · ${record.scenarioId} · #${record.repetition} · ${record.outcome.name}',
              );
            }
          },
          onProgress: (progress) {
            if (!mounted) return;
            setState(() {
              _completedRuns = progress.completedAttempts
                  .clamp(0, totalRuns)
                  .toInt();
              _activity =
                  '${progress.profileId} · ${_conditionLabel(progress.condition)} · ${_phaseLabel(progress.phase)}'
                  '${progress.caseId == null ? '' : ' · ${progress.caseId}'}'
                  '${progress.repetition == null ? '' : ' · #${progress.repetition}'}';
            });
          },
        );
        if (mounted) {
          setState(() {
            _completedRuns = phaseSummary.attempted.clamp(0, totalRuns).toInt();
            _hasJsonl = phaseSummary.attempted > 0 || _hasJsonl;
          });
        }
      }

      if (treatmentPrepared) {
        setState(() {
          _activity = 'Enviando trazas autorizadas…';
          _downloadProgress = null;
        });
        final sync = await _runtime.synchronizeSdk(
          profile: _readySuiteProfiles.last,
          verifyWorkflow: false,
          uploadPendingTraces: true,
        );
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
      final outcome = wasCancelled
          ? quickRun
                ? 'Prueba rápida cancelada'
                : 'Validación cancelada'
          : quickRun
          ? 'Prueba rápida terminada'
          : _pendingProfileIds.isEmpty
          ? 'Validación terminada'
          : 'Validación parcial terminada';
      final pendingStatus = _pendingProfileIds.isEmpty
          ? ''
          : ' · perfiles pendientes: ${_pendingProfileIds.join(', ')}';
      final status =
          '$outcome · $_completedRuns de $_totalRuns intentos guardados$pendingStatus.';
      setState(() => _status = status);
      _addEvent(status);
    } on Object catch (error, stackTrace) {
      debugPrint('Validation run failed (${error.runtimeType}).');
      debugPrintStack(label: 'Validation run failure', stackTrace: stackTrace);
      _addEvent(
        '${quickRun ? 'Prueba rápida' : 'Validación'} detenida antes de medir · $_completedRuns de $_totalRuns intentos guardados.',
      );
      _showError(_friendlyError(error));
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
          _running = false;
          _activity = null;
          _downloadProgress = null;
          _cancelRequested = false;
          _runFinished = true;
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

  String _sdkSyncFailureMessage(String profileId, ValidationSyncState sync) {
    final detail = sync.issues.isNotEmpty
        ? ' Detalle: ${sync.issues.join(' ')}'
        : sync.status == 'offline'
        ? ' No se pudo conectar al servidor; verifica la red.'
        : ' El SDK no indicó qué recurso falló; revisa el manifiesto y el almacenamiento local.';
    return 'La sincronización SDK de $profileId terminó con estado ${sync.status}.$detail';
  }

  static String _formatCount(int value) => value.toString().replaceAllMapped(
    RegExp(r'\B(?=(\d{3})+(?!\d))'),
    (_) => '.',
  );

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
                  child: Text('Compartir JSONL de validación'),
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
                _buildActionsCard(),
                if (_runFinished && _hasJsonl) ...[
                  const SizedBox(height: 12),
                  _buildShareJsonlCard(),
                ],
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
                if (widget.labLaunch == null)
                  Text(
                    'PERF-01 se mide con AndroidX Macrobenchmark en cada dispositivo. F1–F6 requieren inyección controlada de fallos y siguen pendientes.',
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

  Widget _buildActionsCard() => Card(
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
            '${_automaticScenarios.length} fases automáticas en ${_readySuiteProfiles.length} perfiles listos · prueba rápida: ${_formatCount(_quickPlannedRuns)} intentos (${ValidationBatchController.quickRunPercentage}%) · completa: ${_formatCount(_plannedRuns)} intentos.'
            '${_pendingProfileIds.isEmpty ? '' : ' Pendientes: ${_pendingProfileIds.join(', ')}.'}',
          ),
          const SizedBox(height: 12),
          if (_running)
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                key: const ValueKey('run-validation'),
                onPressed: _cancelBatch,
                icon: const Icon(Icons.stop_circle_outlined),
                label: const Text('Cancelar validación'),
              ),
            )
          else ...[
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                key: const ValueKey('quick-run-validation'),
                onPressed: _canStart
                    ? () => _runValidation(quickRun: true)
                    : null,
                icon: const Icon(Icons.flash_on),
                label: const Text('Prueba rápida · 20%'),
              ),
            ),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                key: const ValueKey('run-validation'),
                onPressed: _canStart ? () => _runValidation() : null,
                icon: const Icon(Icons.play_arrow),
                label: const Text('Validación completa'),
              ),
            ),
          ],
        ],
      ),
    ),
  );

  Widget _buildShareJsonlCard() => Card(
    key: const ValueKey('share-jsonl-card'),
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Archivo de validación listo.'),
          const SizedBox(height: 8),
          const Text(
            'Incluye cada intento, el resultado y el estado de captura de trazas. Las trazas SDK completas se sincronizan con el servidor si están autorizadas.',
          ),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              key: const ValueKey('share-jsonl'),
              onPressed: _busy ? null : _exportJsonl,
              icon: const Icon(Icons.ios_share),
              label: const Text('Compartir JSONL de validación'),
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
            _busy
                ? _activity ?? 'Preparando validación…'
                : _error == null
                ? 'Validación finalizada'
                : 'Validación detenida',
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
                ? 'Se enviarán trazas SDK autorizadas al terminar; el JSONL de intentos queda local.'
                : 'Sin autorización no se capturan trazas SDK; el JSONL de intentos queda local.',
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
