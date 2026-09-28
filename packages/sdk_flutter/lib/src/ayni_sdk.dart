import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'model_artifact_downloader.dart';
import 'model_artifact_installer.dart';
import 'model_artifact_integrity_verifier.dart';
import 'sdk_internal.dart';
import 'workflow_definition_validator.dart';
import 'workflow_version_downloader.dart';
import 'workflow_execution.dart';

enum SyncStatus { updated, upToDate, offline, error }

enum SyncResourceStatus {
  updated,
  upToDate,
  invalidRemoteResource,
  invalidWorkflow,
  installationFailed,
  dependencyFailed,
  workflowUnavailable,
}

enum SyncResourceType { workflow, model }

class SyncResourceResult {
  const SyncResourceResult({
    required this.type,
    required this.status,
    this.resourceVersionId,
    this.version,
    this.name,
    this.previousVersionRetained = false,
    this.dependencyName,
    this.remoteHashConflict = false,
  });

  final SyncResourceType type;
  final SyncResourceStatus status;
  final String? resourceVersionId;
  final String? version;
  final String? name;

  /// Whether a valid local version of this workflow was kept when the update
  /// was rejected by validation (US-042); it selects the `invalidWorkflow`
  /// message below.
  final bool previousVersionRetained;

  /// The name of the failed dependency for `dependencyFailed` status (US-044).
  final String? dependencyName;
  final bool remoteHashConflict;

  String? get message =>
      status == SyncResourceStatus.invalidRemoteResource && remoteHashConflict
      ? 'La actualización no coincide con la versión instalada; se conservará la copia local.'
      : switch (status) {
          SyncResourceStatus.invalidRemoteResource =>
            'Se mantuvo la versión local porque la actualización no es válida.',
          SyncResourceStatus.invalidWorkflow when previousVersionRetained =>
            'La actualización de $name no es compatible. Se mantuvo la última versión válida.',
          SyncResourceStatus.invalidWorkflow =>
            'La actualización de $name no es compatible. No se instaló ninguna versión.',
          SyncResourceStatus.installationFailed when previousVersionRetained =>
            'No se pudo guardar la actualización. Se mantuvo la versión anterior.',
          SyncResourceStatus.installationFailed =>
            'No se pudo guardar la actualización. No se instaló ninguna versión.',
          SyncResourceStatus.dependencyFailed when previousVersionRetained =>
            'No se pudo preparar $name: $dependencyName. Se mantuvo la última versión válida.',
          SyncResourceStatus.dependencyFailed =>
            'No se pudo preparar $name: $dependencyName.',
          SyncResourceStatus.workflowUnavailable when previousVersionRetained =>
            'El workflow ya no está disponible. Se mantuvo la versión anterior.',
          SyncResourceStatus.workflowUnavailable =>
            'El workflow ya no está disponible. No se instaló ninguna versión.',
          _ => null,
        };
}

class SyncResult {
  const SyncResult(this.status, [this.resources = const []]);

  final SyncStatus status;
  final List<SyncResourceResult> resources;
}

/// Status indicating the outcome of SDK initialization.
enum InitializationStatus {
  /// The SDK was successfully initialized with valid configuration.
  ready,

  /// One or more required configuration parameters are missing or invalid.
  incompleteConfiguration,

  /// An unexpected error occurred during initialization.
  error,
}

/// Configuration required to initialize the Ayni SDK.
class AyniConfig {
  /// Creates an SDK configuration instance.
  AyniConfig({
    required this.serverUrl,
    required this.credential,
    required this.storageDirectory,
    this.syncTimeout = const Duration(seconds: 30),
    this.allowInsecureLoopback = false,
    this.onProgress,
    this.onBeforeInventoryPersist,
  });

  /// The server URL for the Ayni API (must use HTTPS, or HTTP for loopback
  /// when [allowInsecureLoopback] is true).
  final Uri serverUrl;

  /// The SDK secret credential (`ayni_sk_...`).
  final String credential;

  /// Directory where the SDK stores workflows, models, and sync inventory.
  final Directory storageDirectory;

  /// Maximum duration for a sync operation. Defaults to 30 seconds.
  final Duration syncTimeout;

  /// Whether insecure HTTP is permitted for local loopback development.
  final bool allowInsecureLoopback;

  /// Optional callback to receive human-readable progress messages.
  final void Function(String message)? onProgress;

  /// Optional callback invoked before writing inventory to disk.
  final Future<void> Function()? onBeforeInventoryPersist;

  /// Whether this configuration is complete and valid for SDK initialization.
  bool get isValid =>
      credential.trim().isNotEmpty &&
      storageDirectory.path.trim().isNotEmpty &&
      syncTimeout > Duration.zero &&
      AyniSdk._canSendCredentialTo(
        serverUrl,
        allowInsecureLoopback: allowInsecureLoopback,
      );

  @override
  String toString() =>
      'AyniConfig('
      'serverUrl: $serverUrl, '
      'credential: [REDACTED], '
      'storageDirectory: ${storageDirectory.path}, '
      'syncTimeout: $syncTimeout, '
      'allowInsecureLoopback: $allowInsecureLoopback'
      ')';
}

/// Alias for [AyniConfig].
typedef AyniSdkConfig = AyniConfig;

/// The result of an SDK initialization attempt.
class AyniInitializationResult {
  /// Creates an initialization result.
  const AyniInitializationResult({
    required this.status,
    required this.message,
    this.sdk,
  }) : isSuccess = status == InitializationStatus.ready;

  /// The status of the initialization attempt.
  final InitializationStatus status;

  /// Human-readable message describing the initialization outcome.
  final String message;

  /// Whether initialization was successful and the SDK is ready for use.
  final bool isSuccess;

  /// Whether initialization was successful and the SDK is ready for use.
  bool get isReady => isSuccess;

  /// The initialized [AyniSdk] instance, or `null` if initialization failed.
  final AyniSdk? sdk;

  @override
  String toString() =>
      'AyniInitializationResult('
      'status: $status, '
      'message: $message, '
      'isSuccess: $isSuccess, '
      'sdk: ${sdk != null ? 'AyniSdk' : 'null'}'
      ')';
}

/// Alias for [AyniInitializationResult].
typedef InitializationResult = AyniInitializationResult;

/// Manages synchronization and offline execution of workflows.
class AyniSdk {
  /// Creates a new [AyniSdk] instance directly.
  ///
  /// Every parameter is part of the US-090 public contract: it references only
  /// types exported by `package:ayni_sdk/ayni_sdk.dart`.
  AyniSdk({
    required this.serverUrl,
    required String credential,
    required this.storageDirectory,
    this.syncTimeout = const Duration(seconds: 30),
    this.allowInsecureLoopback = false,
    this.onBeforeInventoryPersist,
    this.onProgress,
  }) : _credential = credential;

  static AyniSdk? _instance;

  /// Returns the shared [AyniSdk] instance configured by [initialize].
  ///
  /// Throws a [StateError] if the SDK has not been initialized.
  static AyniSdk get instance {
    final current = _instance;
    if (current == null) {
      throw StateError(
        'AyniSdk no está inicializado. Llama a AyniSdk.initialize primero.',
      );
    }
    return current;
  }

  /// Whether the SDK has been successfully initialized.
  static bool get isInitialized => _instance != null;

  /// Resets the shared SDK singleton for testing.
  static void resetForTesting() {
    _instance = null;
  }

  /// Initializes the shared [AyniSdk] singleton with the provided [config].
  ///
  /// Validates mandatory configuration parameters ([AyniConfig.credential],
  /// [AyniConfig.serverUrl], and [AyniConfig.storageDirectory]).
  /// Returns an [AyniInitializationResult] indicating whether initialization
  /// succeeded.
  ///
  /// Does not initiate network operations or model inference.
  /// If initialization fails, no operative SDK instance is retained.
  static AyniInitializationResult initialize(AyniConfig config) {
    try {
      if (!config.isValid) {
        _instance = null;
        return AyniInitializationResult(
          status: InitializationStatus.incompleteConfiguration,
          message: 'Revisa la configuración del SDK antes de continuar.',
          sdk: null,
        );
      }
      final sdk = AyniSdk(
        serverUrl: config.serverUrl,
        credential: config.credential,
        storageDirectory: config.storageDirectory,
        syncTimeout: config.syncTimeout,
        allowInsecureLoopback: config.allowInsecureLoopback,
        onProgress: config.onProgress,
        onBeforeInventoryPersist: config.onBeforeInventoryPersist,
      );
      _instance = sdk;
      return AyniInitializationResult(
        status: InitializationStatus.ready,
        message: 'SDK listo.',
        sdk: sdk,
      );
    } catch (_) {
      _instance = null;
      return AyniInitializationResult(
        status: InitializationStatus.error,
        message: 'Revisa la configuración del SDK antes de continuar.',
        sdk: null,
      );
    }
  }

  /// Asynchronously initializes the shared [AyniSdk] singleton with [config].
  ///
  /// Delegates to [initialize] and returns a [Future] completing with the
  /// [AyniInitializationResult].
  static Future<AyniInitializationResult> initializeAsync(
    AyniConfig config,
  ) async => initialize(config);

  /// Checks whether [url] is a permitted destination for SDK credentials.
  ///
  /// Requires HTTPS unless [allowInsecureLoopback] is true and [url] targets
  /// a loopback host.
  static bool _canSendCredentialTo(
    Uri url, {
    required bool allowInsecureLoopback,
  }) {
    if (url.host.trim().isEmpty) return false;
    return url.scheme == 'https' ||
        (allowInsecureLoopback &&
            url.scheme == 'http' &&
            _isLoopbackHost(url.host));
  }

  static bool _isLoopbackHost(String host) {
    if (host == 'localhost') return true;
    final normalized = host.startsWith('[') && host.endsWith(']')
        ? host.substring(1, host.length - 1)
        : host;
    return InternetAddress.tryParse(normalized)?.isLoopback == true;
  }

  final Uri serverUrl;
  final Directory storageDirectory;
  final Duration syncTimeout;
  final bool allowInsecureLoopback;

  /// Runs right before the inventory is saved; it exists for the SDK's tests.
  final Future<void> Function()? onBeforeInventoryPersist;

  /// Reports SDK activity, including `Descargando workflow <nombre>…`.
  final void Function(String message)? onProgress;

  final String _credential;

  /// Receives each downloaded or unavailable workflow definition during sync.
  ///
  /// Its type is internal, so it is deliberately not part of the US-090
  /// contract; tests attach it through [createAyniSdkForTesting].
  void Function(WorkflowVersionDownloadResult result)? _onWorkflowDownload;

  /// Fetches workflow definitions during sync; tests may replace it through
  /// [createAyniSdkForTesting].
  WorkflowVersionDownloader _workflowVersionDownloader =
      WorkflowVersionDownloader();
  final WorkflowDefinitionValidator _workflowDefinitionValidator =
      WorkflowDefinitionValidator();
  Future<void> _syncQueue = Future<void>.value();

  /// Executes the last locally installed, validated version of [workflowId].
  /// [input] is the encoded image bytes (for example JPEG or PNG).
  Future<WorkflowResult> run(String workflowId, Uint8List input) async {
    try {
      final inventoryFile = File(
        '${storageDirectory.path}${Platform.pathSeparator}sync-inventory.json',
      );
      final inventory = await _readInventory(inventoryFile);
      final workflow = inventory.workflows[workflowId];
      if (workflow == null) {
        throw const WorkflowError(WorkflowErrorCategory.workflowNotAvailable);
      }
      final definitionFile = installedWorkflowDefinitionFile(
        storageDirectory,
        workflow.workflowVersionId,
      );
      if (!await definitionFile.exists()) {
        throw const WorkflowError(WorkflowErrorCategory.workflowNotAvailable);
      }
      final decoded = jsonDecode(await definitionFile.readAsString());
      if (_workflowDefinitionValidator.validate(
            definition: decoded,
            declaredModelVersionIds: workflow.modelVersionIds.toSet(),
          ) !=
          WorkflowValidationStatus.valid) {
        throw const WorkflowError(WorkflowErrorCategory.invalidWorkflow);
      }
      final executor = WorkflowExecutor(storageDirectory);
      await executor.validateInputAndContracts(
        decoded as Map<String, dynamic>,
        input,
      );
      // Preflight every dependency before opening an interpreter, so a missing
      // later model can never leave a partially executed workflow.
      final installer = ModelArtifactInstaller(
        storageDirectory: storageDirectory,
      );
      for (final modelVersionId in workflow.modelVersionIds) {
        if (!await installer.isVersionAvailable(
          modelId: modelVersionId,
          modelVersionId: modelVersionId,
        )) {
          throw WorkflowError(
            WorkflowErrorCategory.modelNotAvailable,
            modelVersionId: modelVersionId,
          );
        }
      }
      onProgress?.call('Usando recursos guardados en este dispositivo.');
      return await executor.execute(
        workflowId: workflowId,
        workflowVersion: workflow.version,
        definition: decoded,
        imageBytes: input,
      );
    } on WorkflowError {
      rethrow;
    } on FormatException {
      throw const WorkflowError(WorkflowErrorCategory.invalidWorkflow);
    } on FileSystemException {
      throw const WorkflowError(WorkflowErrorCategory.workflowNotAvailable);
    } catch (_) {
      throw const WorkflowError(WorkflowErrorCategory.runtimeError);
    }
  }

  Future<SyncResult> sync() {
    final previousSync = _syncQueue;
    final syncFinished = Completer<void>();
    _syncQueue = syncFinished.future;
    return _syncAfter(previousSync, syncFinished);
  }

  Future<SyncResult> _syncAfter(
    Future<void> previousSync,
    Completer<void> syncFinished,
  ) async {
    await previousSync;
    final client = HttpClient();
    final deadline = _SyncDeadline();
    var timedOut = false;
    try {
      if (!_canSendCredentialTo(
        serverUrl,
        allowInsecureLoopback: allowInsecureLoopback,
      )) {
        return const SyncResult(SyncStatus.error);
      }
      if (serverUrl.scheme == 'http') client.findProxy = (_) => 'DIRECT';
      final operation = _sync(client, deadline);
      return await operation.timeout(
        syncTimeout,
        onTimeout: () {
          timedOut = true;
          deadline.expire();
          client.close(force: true);
          unawaited(
            operation
                .then<void>((_) {}, onError: (Object _, StackTrace __) {})
                .whenComplete(() {
                  if (!syncFinished.isCompleted) syncFinished.complete();
                }),
          );
          return const SyncResult(SyncStatus.error);
        },
      );
    } on TimeoutException {
      return const SyncResult(SyncStatus.error);
    } on SocketException {
      return const SyncResult(SyncStatus.offline);
    } on FileSystemException {
      return const SyncResult(SyncStatus.error);
    } on IOException {
      return const SyncResult(SyncStatus.error);
    } on FormatException {
      return const SyncResult(SyncStatus.error);
    } finally {
      client.close(force: true);
      if (!timedOut && !syncFinished.isCompleted) syncFinished.complete();
    }
  }

  Future<SyncResult> _sync(HttpClient client, _SyncDeadline deadline) async {
    final request = await client.postUrl(serverUrl.resolve('/sdk/sync'));
    request.followRedirects = false;
    request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $_credential');
    final response = await request.close();
    final body = await utf8.decoder.bind(response).join();
    if (response.statusCode < 200 || response.statusCode >= 300) {
      return const SyncResult(SyncStatus.error);
    }

    final decoded = jsonDecode(body);
    if (!_isInventory(decoded)) {
      return _isAuthenticationAcknowledgement(decoded)
          ? const SyncResult(SyncStatus.upToDate)
          : const SyncResult(SyncStatus.error);
    }
    if (deadline.expired) return const SyncResult(SyncStatus.error);

    final inventoryFile = File(
      '${storageDirectory.path}${Platform.pathSeparator}sync-inventory.json',
    );
    final local = await _readInventory(inventoryFile);
    final comparison = _compareInventories(local, decoded as Map);
    final installation = await _installDownloadedWorkflowVersions(
      local,
      comparison,
      inventoryFile,
      client,
      deadline,
    );
    if (installation == null) return const SyncResult(SyncStatus.error);
    // Validation may roll every update candidate back to the local state;
    // `updated` is reported only when something actually changed (US-042).
    final changed = installation.resources.any(
      (resource) => resource.status == SyncResourceStatus.updated,
    );
    final resourceFailed = installation.resources.any(
      (resource) =>
          resource.status == SyncResourceStatus.invalidRemoteResource ||
          resource.status == SyncResourceStatus.installationFailed ||
          resource.status == SyncResourceStatus.dependencyFailed ||
          resource.status == SyncResourceStatus.workflowUnavailable,
    );
    if (!changed) {
      return SyncResult(
        resourceFailed ? SyncStatus.error : SyncStatus.upToDate,
        installation.resources,
      );
    }
    final persisted = await _persistInventory(
      inventoryFile,
      installation.inventory,
      deadline,
    );
    if (!persisted) {
      // The inventory still names the previous versions, so no definition
      // promoted by this run may stay installed without one.
      for (final file in installation.promotedFiles) {
        await _deleteDownloadedDefinition(file);
      }
      for (final file in installation.installedModelFiles) {
        await _deleteDownloadedDefinition(file);
      }
    }
    return persisted
        ? SyncResult(
            resourceFailed ? SyncStatus.error : SyncStatus.updated,
            installation.resources,
          )
        : const SyncResult(SyncStatus.error);
  }

  Future<_Installation?> _installDownloadedWorkflowVersions(
    _Inventory local,
    _Comparison comparison,
    File inventoryFile,
    HttpClient client,
    _SyncDeadline deadline,
  ) async {
    final localVersionIds = await _localWorkflowVersionIds(inventoryFile);
    final workflows = Map<String, _Workflow>.of(comparison.inventory.workflows);
    final models = Map<String, _Model>.of(comparison.inventory.models);
    final rejections = <_WorkflowRejection>[];
    final promotedFiles = <File>[];
    final installedModelFiles = <File>[];
    final installedModelVersionIds = <String>[];
    final rolledBackModelVersionIds = <String>{};
    Future<_Installation?> abort([File? pendingFile]) async {
      if (pendingFile != null) await _deleteDownloadedDefinition(pendingFile);
      for (final file in [...promotedFiles, ...installedModelFiles]) {
        await _deleteDownloadedDefinition(file);
      }
      return null;
    }

    Future<void> rollbackModelsSince(
      int fileStart,
      int versionStart, {
      String? failedDependencyId,
    }) async {
      for (final file in installedModelFiles.skip(fileStart)) {
        await _deleteDownloadedDefinition(file);
      }
      installedModelFiles.removeRange(fileStart, installedModelFiles.length);
      final versionIdsToRollback = {
        ...installedModelVersionIds.skip(versionStart),
        if (failedDependencyId != null) failedDependencyId,
      };
      for (final versionId in versionIdsToRollback) {
        rolledBackModelVersionIds.add(versionId);
        final previous = local.models[versionId];
        if (previous == null) {
          models.remove(versionId);
        } else {
          models[versionId] = previous;
        }
      }
      installedModelVersionIds.removeRange(
        versionStart,
        installedModelVersionIds.length,
      );
    }

    for (final workflow in comparison.acceptedWorkflows) {
      if (deadline.expired) return abort();
      if (localVersionIds.contains(workflow.workflowVersionId)) continue;

      // Two phases per download: the downloader streams into an isolated
      // `<installed>.part` attempt file; only after validation the file is
      // renamed (promoted) to the installed path. A rejected definition is
      // deleted and never occupies the installed path.
      final installedFile = installedWorkflowDefinitionFile(
        storageDirectory,
        workflow.workflowVersionId,
      );
      final WorkflowVersionDownloadResult result;
      try {
        result = await _workflowVersionDownloader.download(
          serverUrl: serverUrl,
          credential: _credential,
          workflowVersionId: workflow.workflowVersionId,
          workflowName: workflow.name,
          temporaryDefinition: installedFile,
          allowInsecureLoopback: allowInsecureLoopback,
          onProgress: onProgress,
          httpClient: client,
        );
      } catch (_) {
        return abort();
      }
      try {
        _onWorkflowDownload?.call(result);
      } catch (_) {
        return abort(
          result.temporaryDefinition == null
              ? null
              : File(result.temporaryDefinition!),
        );
      }
      if (result.status != WorkflowVersionDownloadStatus.downloaded) {
        await _rejectWorkflow(
          workflow,
          result.temporaryDefinition == null
              ? null
              : File(result.temporaryDefinition!),
          local,
          workflows,
          rejections,
          unavailable: true,
        );
        continue;
      }
      final downloadedFile = File(result.temporaryDefinition!);
      if (deadline.expired) {
        return abort(downloadedFile);
      }
      final validation = await _validateDownloadedDefinition(
        downloadedFile,
        workflow.modelVersionIds,
      );
      if (validation == WorkflowValidationStatus.valid) {
        final installedModelFileCount = installedModelFiles.length;
        final installedModelVersionCount = installedModelVersionIds.length;
        var failedDependency = 'modelo desconocido';
        String? failedDependencyId;
        final depsOk = await _installModelDependencies(
          workflow,
          comparison.inventory.models,
          client,
          deadline,
          (name) {
            failedDependency = name;
            failedDependencyId = name;
          },
          installedModelFiles,
          installedModelVersionIds,
        );
        if (!depsOk) {
          await rollbackModelsSince(
            installedModelFileCount,
            installedModelVersionCount,
            failedDependencyId: failedDependencyId,
          );
          await _rejectWorkflow(
            workflow,
            downloadedFile,
            local,
            workflows,
            rejections,
            dependencyFailed: true,
            dependencyName: failedDependency,
          );
          continue;
        }
        for (final versionId in installedModelVersionIds.skip(
          installedModelVersionCount,
        )) {
          rolledBackModelVersionIds.remove(versionId);
          final remoteModel = comparison.inventory.models[versionId];
          if (remoteModel != null) models[versionId] = remoteModel;
        }
        if (deadline.expired) {
          return abort(downloadedFile);
        }
        try {
          await _promoteToInstalledDefinition(downloadedFile, installedFile);
          promotedFiles.add(installedFile);
        } on FileSystemException {
          await rollbackModelsSince(
            installedModelFileCount,
            installedModelVersionCount,
          );
          await _rejectWorkflow(
            workflow,
            downloadedFile,
            local,
            workflows,
            rejections,
            installationFailed: true,
          );
        }
      } else {
        await _rejectWorkflow(
          workflow,
          downloadedFile,
          local,
          workflows,
          rejections,
        );
      }
    }
    if (deadline.expired) return abort();
    return _Installation(
      inventory: _Inventory(workflows, models),
      resources: _resourcesWithRejections(
        comparison.resources,
        rejections,
        rolledBackModelVersionIds,
        local.models,
      ),
      promotedFiles: promotedFiles,
      installedModelFiles: installedModelFiles,
    );
  }

  /// Records a workflow rejection: deletes the downloaded definition,
  /// restores the local inventory entry (if any), and adds a
  /// [_WorkflowRejection] with the appropriate status.
  Future<void> _rejectWorkflow(
    _Workflow workflow,
    File? downloadedFile,
    _Inventory local,
    Map<String, _Workflow> workflows,
    List<_WorkflowRejection> rejections, {
    bool installationFailed = false,
    bool dependencyFailed = false,
    String? dependencyName,
    bool unavailable = false,
  }) async {
    if (downloadedFile != null)
      await _deleteDownloadedDefinition(downloadedFile);
    final previous = local.workflows[workflow.id];
    if (previous == null) {
      workflows.remove(workflow.id);
    } else {
      workflows[workflow.id] = previous;
    }
    rejections.add(
      _WorkflowRejection(
        workflow,
        previousVersionRetained: previous != null,
        installationFailed: installationFailed,
        dependencyFailed: dependencyFailed,
        dependencyName: dependencyName,
        unavailable: unavailable,
      ),
    );
  }

  /// Rebuilds the reported resources with each rejected workflow's optimistic
  /// `updated` entry replaced by `invalidWorkflow` (never a partial in-place
  /// edit of the comparison result).
  List<SyncResourceResult> _resourcesWithRejections(
    List<SyncResourceResult> resources,
    List<_WorkflowRejection> rejections,
    Set<String> rolledBackModelVersionIds,
    Map<String, _Model> localModels,
  ) {
    if (rejections.isEmpty && rolledBackModelVersionIds.isEmpty) {
      return resources;
    }
    final rejected = {
      for (final rejection in rejections)
        rejection.workflow.workflowVersionId: rejection,
    };
    final result = <SyncResourceResult>[];
    for (final resource in resources) {
      if (resource.type == SyncResourceType.model &&
          rolledBackModelVersionIds.contains(resource.resourceVersionId)) {
        final previous = localModels[resource.resourceVersionId];
        if (previous == null) continue;
        result.add(
          SyncResourceResult(
            type: resource.type,
            status: SyncResourceStatus.upToDate,
            resourceVersionId: resource.resourceVersionId,
            version: previous.version,
            name: resource.name,
          ),
        );
      } else if (resource.type == SyncResourceType.workflow &&
          rejected.containsKey(resource.resourceVersionId)) {
        result.add(rejected[resource.resourceVersionId]!.toResult());
      } else {
        result.add(resource);
      }
    }
    return result;
  }

  Future<void> _promoteToInstalledDefinition(
    File downloadedFile,
    File installedFile,
  ) async {
    try {
      await downloadedFile.rename(installedFile.path);
    } on FileSystemException {
      if (!await installedFile.exists()) rethrow;
      await installedFile.delete();
      await downloadedFile.rename(installedFile.path);
    }
  }

  Future<WorkflowValidationStatus> _validateDownloadedDefinition(
    File definition,
    List<String> declaredModelVersionIds,
  ) async {
    final Object? decoded;
    try {
      decoded = jsonDecode(await definition.readAsString());
    } on FormatException {
      return WorkflowValidationStatus.invalidSchema;
    }
    return _workflowDefinitionValidator.validate(
      definition: decoded,
      declaredModelVersionIds: declaredModelVersionIds.toSet(),
    );
  }

  /// Downloads and installs model versions required by a workflow that are
  /// not yet available locally (US-044). Each newly installed model file is
  /// added to the installed-file and version-id lists immediately so the
  /// caller can roll them back if a later dependency fails. Returns `false`
  /// when a dependency could not be installed.
  Future<bool> _installModelDependencies(
    _Workflow workflow,
    Map<String, _Model> models,
    HttpClient client,
    _SyncDeadline deadline,
    void Function(String name) setFailedDependency,
    List<File> installedModelFiles,
    List<String> installedModelVersionIds,
  ) async {
    final installer = ModelArtifactInstaller(
      storageDirectory: storageDirectory,
    );
    final downloader = ModelArtifactDownloader();
    final verifier = ModelArtifactIntegrityVerifier();

    for (final modelVersionId in workflow.modelVersionIds) {
      if (deadline.expired) return false;

      final available = await installer.isVersionAvailable(
        modelId: modelVersionId,
        modelVersionId: modelVersionId,
      );
      if (available) continue;

      final model = models[modelVersionId];
      if (model == null) {
        setFailedDependency(modelVersionId);
        return false;
      }

      onProgress?.call('Descargando modelos para ${workflow.name}…');

      final manifestResult = await _fetchModelManifest(modelVersionId, client);
      if (manifestResult == null) {
        setFailedDependency(modelVersionId);
        return false;
      }
      if (deadline.expired) return false;

      final temporaryArtifact = File(
        '${storageDirectory.path}${Platform.pathSeparator}'
        'model-downloads${Platform.pathSeparator}$modelVersionId.tflite',
      );
      final verifiedArtifact = File('${temporaryArtifact.path}.verified');

      final downloadResult = await downloader.download(
        manifest: manifestResult,
        temporaryArtifact: temporaryArtifact,
        httpClient: client,
        allowInsecureLoopback: allowInsecureLoopback,
      );
      if (downloadResult.status != ModelArtifactDownloadStatus.downloaded) {
        await _cleanupModelFiles(temporaryArtifact, verifiedArtifact);
        setFailedDependency(modelVersionId);
        return false;
      }
      if (deadline.expired) {
        await _cleanupModelFiles(temporaryArtifact, verifiedArtifact);
        return false;
      }

      final integrityResult = await verifier.verify(
        modelVersionId: modelVersionId,
        temporaryArtifact: File(downloadResult.temporaryArtifact!),
        verifiedArtifact: verifiedArtifact,
        expectedSha256: manifestResult.sha256,
        isDownloadComplete: true,
      );
      if (!integrityResult.isVerified) {
        await _cleanupModelFiles(temporaryArtifact, verifiedArtifact);
        setFailedDependency(modelVersionId);
        return false;
      }
      if (deadline.expired) {
        await _cleanupModelFiles(temporaryArtifact, verifiedArtifact);
        return false;
      }

      final modelDirectory = Directory(
        '${storageDirectory.path}${Platform.pathSeparator}$modelVersionId',
      );
      final artifactPath =
          '${modelDirectory.path}${Platform.pathSeparator}$modelVersionId.tflite';
      final metadataPath =
          '${modelDirectory.path}${Platform.pathSeparator}$modelVersionId.json';
      final availableBeforeInstall = await installer.isVersionAvailable(
        modelId: modelVersionId,
        modelVersionId: modelVersionId,
      );

      final installResult = await installer.install(
        modelId: modelVersionId,
        version: model.version,
        verifiedArtifact: verifiedArtifact,
        integrity: integrityResult,
      );
      if (installResult.status != ModelArtifactInstallStatus.availableOffline) {
        await _cleanupModelFiles(temporaryArtifact, verifiedArtifact);
        setFailedDependency(modelVersionId);
        return false;
      }

      if (!availableBeforeInstall) {
        installedModelFiles.add(File(artifactPath));
        installedModelFiles.add(File(metadataPath));
        installedModelVersionIds.add(modelVersionId);
      }
    }

    return true;
  }

  Future<ModelDownloadManifest?> _fetchModelManifest(
    String modelVersionId,
    HttpClient client,
  ) async {
    try {
      final request = await client.getUrl(
        serverUrl.resolve('/sdk/model-versions/$modelVersionId/manifest'),
      );
      request.followRedirects = false;
      request.headers.set(
        HttpHeaders.authorizationHeader,
        'Bearer $_credential',
      );
      final response = await request.close();
      final body = await utf8.decoder.bind(response).join();
      if (response.statusCode < 200 || response.statusCode >= 300) {
        return null;
      }
      // The server wraps the manifest: `{ "manifest": { ... } }`
      // (apps/server/src/sdk-model-versions.ts).
      final decoded = jsonDecode(body) as Map<String, dynamic>;
      return ModelDownloadManifest.fromJson(
        decoded['manifest'] as Map<String, dynamic>,
      );
    } on IOException {
      return null;
    } on FormatException {
      return null;
    } on TypeError {
      return null;
    }
  }

  Future<void> _cleanupModelFiles(
    File temporaryArtifact,
    File verifiedArtifact,
  ) async {
    try {
      if (await temporaryArtifact.exists()) await temporaryArtifact.delete();
    } on IOException {}
    try {
      if (await verifiedArtifact.exists()) await verifiedArtifact.delete();
    } on IOException {}
  }

  Future<void> _deleteDownloadedDefinition(File file) async {
    try {
      await file.delete();
    } on IOException {
      // The rejection stands even when the download cannot be removed.
    }
  }

  Future<Set<String>> _localWorkflowVersionIds(File inventoryFile) async {
    if (!await inventoryFile.exists()) return {};
    try {
      return _workflows(
        jsonDecode(await inventoryFile.readAsString()),
      ).map((workflow) => workflow.versionId).toSet();
    } on FormatException {
      return {};
    }
  }

  Iterable<_WorkflowManifestEntry> _workflows(Object inventory) {
    if (inventory is! Map || inventory['workflows'] is! List) return const [];
    return (inventory['workflows'] as List)
        .map(_Workflow.fromJson)
        .whereType<_Workflow>()
        .map(
          (workflow) =>
              _WorkflowManifestEntry(workflow.workflowVersionId, workflow.name),
        );
  }

  bool _isInventory(Object? value) =>
      value is Map &&
      value.keys.every((key) => key == 'workflows' || key == 'models') &&
      value['workflows'] is List &&
      value['models'] is List;

  bool _isAuthenticationAcknowledgement(Object? value) =>
      value is Map &&
      value['authenticated'] == true &&
      !value.containsKey('workflows') &&
      !value.containsKey('models');

  Future<_Inventory> _readInventory(File file) async {
    if (!await file.exists()) return const _Inventory.empty();
    try {
      final decoded = jsonDecode(await file.readAsString());
      return _isInventory(decoded)
          ? _Inventory.fromJson(decoded as Map)
          : const _Inventory.empty();
    } on FormatException {
      return const _Inventory.empty();
    }
  }

  _Comparison _compareInventories(_Inventory local, Map remote) {
    final workflows = {...local.workflows};
    final models = {...local.models};
    final resources = <SyncResourceResult>[];
    final acceptedWorkflows = <_Workflow>[];
    final invalidModelIds = <String>{};

    for (final item in remote['models'] as List) {
      final model = _Model.fromJson(item);
      if (model == null) {
        resources.add(_invalidResource(SyncResourceType.model, item));
        continue;
      }
      final previous = models[model.id];
      final sameVersion = previous?.version == model.version;
      final hashConflict =
          sameVersion &&
          previous!.sha256.toLowerCase() != model.sha256.toLowerCase();
      if (hashConflict) invalidModelIds.add(model.id);
      final status = hashConflict
          ? SyncResourceStatus.invalidRemoteResource
          : sameVersion
          ? SyncResourceStatus.upToDate
          : SyncResourceStatus.updated;
      if (status == SyncResourceStatus.updated) models[model.id] = model;
      resources.add(
        SyncResourceResult(
          type: SyncResourceType.model,
          status: status,
          resourceVersionId: model.id,
          version: model.version,
          remoteHashConflict: hashConflict,
        ),
      );
    }

    for (final item in remote['workflows'] as List) {
      final workflow = _Workflow.fromJson(item);
      final previous = workflow == null ? null : workflows[workflow.id];
      final sameInstalledWorkflow =
          workflow != null &&
          previous != null &&
          previous.workflowVersionId == workflow.workflowVersionId &&
          previous.version == workflow.version &&
          previous.name == workflow.name &&
          previous.modelVersionIds.length == workflow.modelVersionIds.length &&
          previous.modelVersionIds.asMap().entries.every(
            (entry) => entry.value == workflow.modelVersionIds[entry.key],
          );
      if (workflow == null ||
          !workflow.modelVersionIds.every(models.containsKey) ||
          (!sameInstalledWorkflow &&
              workflow.modelVersionIds.any(invalidModelIds.contains))) {
        resources.add(_invalidResource(SyncResourceType.workflow, item));
        continue;
      }
      acceptedWorkflows.add(workflow);
      final status = previous?.version == workflow.version
          ? SyncResourceStatus.upToDate
          : SyncResourceStatus.updated;
      if (status == SyncResourceStatus.updated)
        workflows[workflow.id] = workflow;
      resources.add(
        SyncResourceResult(
          type: SyncResourceType.workflow,
          status: status,
          resourceVersionId: workflow.workflowVersionId,
          version: workflow.version,
          name: workflow.name,
        ),
      );
    }

    final inventory = _Inventory(workflows, models);
    return _Comparison(inventory, resources, acceptedWorkflows);
  }

  SyncResourceResult _invalidResource(SyncResourceType type, Object? item) {
    final json = item is Map ? item : const <Object?, Object?>{};
    final resourceVersionId = type == SyncResourceType.workflow
        ? json['workflowVersionId']
        : json['modelVersionId'];
    return SyncResourceResult(
      type: type,
      status: SyncResourceStatus.invalidRemoteResource,
      resourceVersionId: resourceVersionId is String ? resourceVersionId : null,
      version: json['version'] is String ? json['version'] as String : null,
    );
  }

  Future<bool> _persistInventory(
    File inventoryFile,
    _Inventory inventory,
    _SyncDeadline deadline,
  ) async {
    if (deadline.expired) return false;
    try {
      await onBeforeInventoryPersist?.call();
    } catch (_) {
      return false;
    }
    if (deadline.expired) return false;
    await storageDirectory.create(recursive: true);
    if (deadline.expired) return false;
    final temporaryFile = File(
      '${inventoryFile.path}.${DateTime.now().microsecondsSinceEpoch}.tmp',
    );
    try {
      await temporaryFile.writeAsString(
        jsonEncode(inventory.toJson()),
        flush: true,
      );
      if (deadline.expired) return false;
      await temporaryFile.rename(inventoryFile.path);
      return !deadline.expired;
    } on FileSystemException {
      return false;
    } finally {
      if (await temporaryFile.exists()) await temporaryFile.delete();
    }
  }
}

/// Creates an [AyniSdk] with the test-only hooks that US-090 keeps out of the
/// public contract.
///
/// `onWorkflowDownload` and `workflowVersionDownloader` mention internal
/// types, so neither the public [AyniSdk] constructor nor [AyniConfig] may
/// declare them: `package:ayni_sdk/ayni_sdk.dart` exports only nameable
/// types. This factory stays in `lib/src/` and is deliberately not exported,
/// so only the SDK's own tests can reach it and integrating apps never see it.
AyniSdk createAyniSdkForTesting({
  required Uri serverUrl,
  required String credential,
  required Directory storageDirectory,
  Duration syncTimeout = const Duration(seconds: 30),
  bool allowInsecureLoopback = false,
  Future<void> Function()? onBeforeInventoryPersist,
  void Function(String message)? onProgress,
  void Function(WorkflowVersionDownloadResult result)? onWorkflowDownload,
  WorkflowVersionDownloader? workflowVersionDownloader,
}) {
  final sdk = AyniSdk(
    serverUrl: serverUrl,
    credential: credential,
    storageDirectory: storageDirectory,
    syncTimeout: syncTimeout,
    allowInsecureLoopback: allowInsecureLoopback,
    onBeforeInventoryPersist: onBeforeInventoryPersist,
    onProgress: onProgress,
  );
  sdk._onWorkflowDownload = onWorkflowDownload;
  if (workflowVersionDownloader != null) {
    sdk._workflowVersionDownloader = workflowVersionDownloader;
  }
  return sdk;
}

class _Inventory {
  const _Inventory(this.workflows, this.models);

  const _Inventory.empty() : workflows = const {}, models = const {};

  final Map<String, _Workflow> workflows;
  final Map<String, _Model> models;

  factory _Inventory.fromJson(Map json) {
    final workflows = <String, _Workflow>{};
    final models = <String, _Model>{};
    for (final item in json['workflows'] as List) {
      final workflow = _Workflow.fromJson(item);
      if (workflow != null) workflows[workflow.id] = workflow;
    }
    for (final item in json['models'] as List) {
      final model = _Model.fromJson(item);
      if (model != null) models[model.id] = model;
    }
    return _Inventory(workflows, models);
  }

  Map<String, Object> toJson() => {
    'workflows': workflows.values.map((workflow) => workflow.toJson()).toList(),
    'models': models.values.map((model) => model.toJson()).toList(),
  };
}

class _Workflow {
  const _Workflow({
    required this.id,
    required this.workflowVersionId,
    required this.name,
    required this.version,
    required this.modelVersionIds,
  });

  final String id;
  final String workflowVersionId;
  final String name;
  final String version;
  final List<String> modelVersionIds;

  static _Workflow? fromJson(Object? value) {
    if (value is! Map) return null;
    final id = value['workflowId'];
    final workflowVersionId = value['workflowVersionId'];
    final name = value['name'];
    final version = value['version'];
    final modelVersionIds = value['modelVersionIds'];
    if (!isNonEmptyString(id) ||
        !isNonEmptyString(workflowVersionId) ||
        !isNonEmptyString(name) ||
        !isNonEmptyString(version) ||
        modelVersionIds is! List ||
        !modelVersionIds.every(isNonEmptyString)) {
      return null;
    }
    return _Workflow(
      id: id,
      workflowVersionId: workflowVersionId,
      name: name,
      version: version,
      modelVersionIds: List<String>.from(modelVersionIds),
    );
  }

  Map<String, Object> toJson() => {
    'workflowId': id,
    'workflowVersionId': workflowVersionId,
    'name': name,
    'version': version,
    'modelVersionIds': modelVersionIds,
  };
}

class _Model {
  const _Model({required this.id, required this.version, required this.sha256});

  final String id;
  final String version;
  final String sha256;

  static _Model? fromJson(Object? value) {
    if (value is! Map) return null;
    final id = value['modelVersionId'];
    final version = value['version'];
    final sha256 = value['sha256'];
    if (!isNonEmptyString(id) ||
        !isNonEmptyString(version) ||
        sha256 is! String ||
        !RegExp(r'^[a-fA-F0-9]{64}$').hasMatch(sha256)) {
      return null;
    }
    return _Model(id: id, version: version, sha256: sha256);
  }

  Map<String, String> toJson() => {
    'modelVersionId': id,
    'version': version,
    'sha256': sha256,
  };
}

class _Comparison {
  const _Comparison(this.inventory, this.resources, this.acceptedWorkflows);

  final _Inventory inventory;
  final List<SyncResourceResult> resources;
  final List<_Workflow> acceptedWorkflows;
}

/// The outcome of installing the downloaded workflow definitions: the
/// inventory to persist (with rejected workflows rolled back to their local
/// state), the reported resources, where rejected workflows now carry
/// `invalidWorkflow`, and the definitions promoted this run, which are
/// removed again when the inventory cannot be persisted.
class _Installation {
  const _Installation({
    required this.inventory,
    required this.resources,
    required this.promotedFiles,
    this.installedModelFiles = const [],
  });

  final _Inventory inventory;
  final List<SyncResourceResult> resources;
  final List<File> promotedFiles;
  final List<File> installedModelFiles;
}

/// A workflow whose downloaded definition failed validation or whose
/// installation failed due to a storage error. It owns the user-facing
/// result because only the install step knows whether a previous valid
/// version was retained, which selects the appropriate message.
class _WorkflowRejection {
  const _WorkflowRejection(
    this.workflow, {
    required this.previousVersionRetained,
    this.installationFailed = false,
    this.dependencyFailed = false,
    this.dependencyName,
    this.unavailable = false,
  });

  final _Workflow workflow;
  final bool previousVersionRetained;
  final bool installationFailed;
  final bool dependencyFailed;
  final String? dependencyName;
  final bool unavailable;

  SyncResourceResult toResult() => SyncResourceResult(
    type: SyncResourceType.workflow,
    status: unavailable
        ? SyncResourceStatus.workflowUnavailable
        : dependencyFailed
        ? SyncResourceStatus.dependencyFailed
        : installationFailed
        ? SyncResourceStatus.installationFailed
        : SyncResourceStatus.invalidWorkflow,
    resourceVersionId: workflow.workflowVersionId,
    version: workflow.version,
    name: workflow.name,
    previousVersionRetained: previousVersionRetained,
    dependencyName: dependencyName,
  );
}

class _SyncDeadline {
  var expired = false;

  void expire() => expired = true;
}

class _WorkflowManifestEntry {
  const _WorkflowManifestEntry(this.versionId, this.name);

  final String versionId;
  final String name;
}
