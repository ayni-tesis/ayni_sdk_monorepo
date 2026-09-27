import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'model_artifact_downloader.dart';
import 'model_artifact_installer.dart';
import 'model_artifact_integrity_verifier.dart';
import 'sdk_internal.dart';
import 'workflow_definition_validator.dart';
import 'workflow_version_downloader.dart';

enum SyncStatus { updated, upToDate, offline, error }

enum SyncResourceStatus {
  updated,
  upToDate,
  invalidRemoteResource,
  invalidWorkflow,
  installationFailed,
  dependencyFailed,
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

  String? get message => switch (status) {
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
    _ => null,
  };
}

class SyncResult {
  const SyncResult(this.status, [this.resources = const []]);

  final SyncStatus status;
  final List<SyncResourceResult> resources;
}

class AyniSdk {
  AyniSdk({
    required this.serverUrl,
    required String credential,
    required this.storageDirectory,
    this.syncTimeout = const Duration(seconds: 30),
    this.allowInsecureLoopback = false,
    this.onBeforeInventoryPersist,
    this.onProgress,
    this.onWorkflowDownload,
    WorkflowVersionDownloader? workflowVersionDownloader,
  }) : _credential = credential,
       _workflowVersionDownloader =
           workflowVersionDownloader ?? WorkflowVersionDownloader();

  final Uri serverUrl;
  final Directory storageDirectory;
  final Duration syncTimeout;
  final bool allowInsecureLoopback;
  final Future<void> Function()? onBeforeInventoryPersist;

  /// Reports SDK activity, including `Descargando workflow <nombre>…`.
  final void Function(String message)? onProgress;

  /// Receives each downloaded or unavailable workflow definition during sync.
  final void Function(WorkflowVersionDownloadResult result)? onWorkflowDownload;
  final String _credential;
  final WorkflowVersionDownloader _workflowVersionDownloader;
  final WorkflowDefinitionValidator _workflowDefinitionValidator =
      WorkflowDefinitionValidator();

  Future<SyncResult> sync() async {
    if (!_canSendCredentialTo(serverUrl))
      return const SyncResult(SyncStatus.error);

    final client = HttpClient();
    if (serverUrl.scheme == 'http') client.findProxy = (_) => 'DIRECT';
    final deadline = _SyncDeadline();
    try {
      return await _sync(client, deadline).timeout(
        syncTimeout,
        onTimeout: () {
          deadline.expire();
          client.close(force: true);
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
    if (!changed) {
      return SyncResult(SyncStatus.upToDate, installation.resources);
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
        ? SyncResult(SyncStatus.updated, installation.resources)
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
    final rejections = <_WorkflowRejection>[];
    final promotedFiles = <File>[];
    final installedModelFiles = <File>[];
    for (final workflow in comparison.acceptedWorkflows) {
      if (deadline.expired) return null;
      if (localVersionIds.contains(workflow.workflowVersionId)) continue;

      // Two phases per download: the downloader streams into an isolated
      // `<installed>.part` attempt file; only after validation the file is
      // renamed (promoted) to the installed path. A rejected definition is
      // deleted and never occupies the installed path.
      final installedFile = installedWorkflowDefinitionFile(
        storageDirectory,
        workflow.workflowVersionId,
      );
      final result = await _workflowVersionDownloader.download(
        serverUrl: serverUrl,
        credential: _credential,
        workflowVersionId: workflow.workflowVersionId,
        workflowName: workflow.name,
        temporaryDefinition: installedFile,
        allowInsecureLoopback: allowInsecureLoopback,
        onProgress: onProgress,
        httpClient: client,
      );
      try {
        onWorkflowDownload?.call(result);
      } catch (_) {
        return null;
      }
      if (result.status != WorkflowVersionDownloadStatus.downloaded) {
        return null;
      }
      final downloadedFile = File(result.temporaryDefinition!);
      if (deadline.expired) {
        await _deleteDownloadedDefinition(downloadedFile);
        return null;
      }
      final validation = await _validateDownloadedDefinition(
        downloadedFile,
        workflow.modelVersionIds,
      );
      if (validation == WorkflowValidationStatus.valid) {
        var failedDependency = 'modelo desconocido';
        final depsOk = await _installModelDependencies(
          workflow,
          comparison.inventory.models,
          client,
          deadline,
          (name) => failedDependency = name,
          installedModelFiles,
        );
        if (!depsOk) {
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
        if (deadline.expired) {
          await _deleteDownloadedDefinition(downloadedFile);
          return null;
        }
        try {
          await _promoteToInstalledDefinition(downloadedFile, installedFile);
          promotedFiles.add(installedFile);
        } on FileSystemException {
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
    if (deadline.expired) return null;
    return _Installation(
      inventory: _Inventory(workflows, comparison.inventory.models),
      resources: _resourcesWithRejections(comparison.resources, rejections),
      promotedFiles: promotedFiles,
      installedModelFiles: installedModelFiles,
    );
  }

  /// Records a workflow rejection: deletes the downloaded definition,
  /// restores the local inventory entry (if any), and adds a
  /// [_WorkflowRejection] with the appropriate status.
  Future<void> _rejectWorkflow(
    _Workflow workflow,
    File downloadedFile,
    _Inventory local,
    Map<String, _Workflow> workflows,
    List<_WorkflowRejection> rejections, {
    bool installationFailed = false,
    bool dependencyFailed = false,
    String? dependencyName,
  }) async {
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
      ),
    );
  }

  /// Rebuilds the reported resources with each rejected workflow's optimistic
  /// `updated` entry replaced by `invalidWorkflow` (never a partial in-place
  /// edit of the comparison result).
  List<SyncResourceResult> _resourcesWithRejections(
    List<SyncResourceResult> resources,
    List<_WorkflowRejection> rejections,
  ) {
    if (rejections.isEmpty) return resources;
    final rejected = {
      for (final rejection in rejections)
        rejection.workflow.workflowVersionId: rejection,
    };
    return [
      for (final resource in resources)
        if (resource.type == SyncResourceType.workflow &&
            rejected.containsKey(resource.resourceVersionId))
          rejected[resource.resourceVersionId]!.toResult()
        else
          resource,
    ];
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
  /// added to [installedModelFiles] immediately after installation so that
  /// the caller can clean them up even if a later dependency fails. Returns
  /// `false` when a dependency could not be installed.
  Future<bool> _installModelDependencies(
    _Workflow workflow,
    Map<String, _Model> models,
    HttpClient client,
    _SyncDeadline deadline,
    void Function(String name) setFailedDependency,
    List<File> installedModelFiles,
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

      installedModelFiles.add(
        File(
          '${storageDirectory.path}${Platform.pathSeparator}'
          '$modelVersionId${Platform.pathSeparator}$modelVersionId.tflite',
        ),
      );
      installedModelFiles.add(
        File(
          '${storageDirectory.path}${Platform.pathSeparator}'
          '$modelVersionId${Platform.pathSeparator}$modelVersionId.json',
        ),
      );
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
      return ModelDownloadManifest.fromJson(
        jsonDecode(body) as Map<String, dynamic>,
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

  bool _canSendCredentialTo(Uri url) =>
      url.scheme == 'https' ||
      (allowInsecureLoopback &&
          url.scheme == 'http' &&
          (url.host == 'localhost' ||
              InternetAddress.tryParse(url.host)?.isLoopback == true));

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

    for (final item in remote['models'] as List) {
      final model = _Model.fromJson(item);
      if (model == null) {
        resources.add(_invalidResource(SyncResourceType.model, item));
        continue;
      }
      final previous = models[model.id];
      final status = previous?.version == model.version
          ? SyncResourceStatus.upToDate
          : SyncResourceStatus.updated;
      if (status == SyncResourceStatus.updated) models[model.id] = model;
      resources.add(
        SyncResourceResult(
          type: SyncResourceType.model,
          status: status,
          resourceVersionId: model.id,
          version: model.version,
        ),
      );
    }

    for (final item in remote['workflows'] as List) {
      final workflow = _Workflow.fromJson(item);
      if (workflow == null ||
          !workflow.modelVersionIds.every(models.containsKey)) {
        resources.add(_invalidResource(SyncResourceType.workflow, item));
        continue;
      }
      acceptedWorkflows.add(workflow);
      final previous = workflows[workflow.id];
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
  });

  final _Workflow workflow;
  final bool previousVersionRetained;
  final bool installationFailed;
  final bool dependencyFailed;
  final String? dependencyName;

  SyncResourceResult toResult() => SyncResourceResult(
    type: SyncResourceType.workflow,
    status: dependencyFailed
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
