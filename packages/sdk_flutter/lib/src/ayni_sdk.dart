import 'dart:async';
import 'dart:convert';
import 'dart:io';

enum SyncStatus { updated, upToDate, offline, error }

enum SyncResourceStatus { updated, upToDate, invalidRemoteResource }

enum SyncResourceType { workflow, model }

class SyncResourceResult {
  const SyncResourceResult({
    required this.type,
    required this.status,
    this.resourceVersionId,
    this.version,
  });

  final SyncResourceType type;
  final SyncResourceStatus status;
  final String? resourceVersionId;
  final String? version;

  String? get message => status == SyncResourceStatus.invalidRemoteResource
      ? 'Se mantuvo la versión local porque la actualización no es válida.'
      : null;
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
  }) : _credential = credential;

  final Uri serverUrl;
  final Directory storageDirectory;
  final Duration syncTimeout;
  final bool allowInsecureLoopback;
  final Future<void> Function()? onBeforeInventoryPersist;
  final String _credential;

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
    if (!comparison.changed) {
      return SyncResult(SyncStatus.upToDate, comparison.resources);
    }

    return await _persistInventory(
          inventoryFile,
          comparison.inventory,
          deadline,
        )
        ? SyncResult(SyncStatus.updated, comparison.resources)
        : const SyncResult(SyncStatus.error);
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

    for (final item in remote['workflows'] as List) {
      final workflow = _Workflow.fromJson(item);
      if (workflow == null) {
        resources.add(_invalidResource(SyncResourceType.workflow, item));
        continue;
      }
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
        ),
      );
    }

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

    final inventory = _Inventory(workflows, models);
    return _Comparison(
      inventory,
      resources,
      resources.any(
        (resource) => resource.status == SyncResourceStatus.updated,
      ),
    );
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
    if (!_isNonEmptyString(id) ||
        !_isNonEmptyString(workflowVersionId) ||
        !_isNonEmptyString(name) ||
        !_isNonEmptyString(version) ||
        modelVersionIds is! List ||
        !modelVersionIds.every(_isNonEmptyString)) {
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
    if (!_isNonEmptyString(id) ||
        !_isNonEmptyString(version) ||
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

bool _isNonEmptyString(Object? value) => value is String && value.isNotEmpty;

class _Comparison {
  const _Comparison(this.inventory, this.resources, this.changed);

  final _Inventory inventory;
  final List<SyncResourceResult> resources;
  final bool changed;
}

class _SyncDeadline {
  var expired = false;

  void expire() => expired = true;
}
