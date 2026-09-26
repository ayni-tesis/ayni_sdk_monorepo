import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'workflow_version_downloader.dart';

enum SyncStatus { updated, upToDate, offline, error }

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

  Future<SyncStatus> sync() async {
    if (!_canSendCredentialTo(serverUrl)) return SyncStatus.error;

    final client = HttpClient();
    if (serverUrl.scheme == 'http') client.findProxy = (_) => 'DIRECT';
    final deadline = _SyncDeadline();
    try {
      return await _sync(client, deadline).timeout(
        syncTimeout,
        onTimeout: () {
          deadline.expire();
          client.close(force: true);
          return SyncStatus.error;
        },
      );
    } on TimeoutException {
      return SyncStatus.error;
    } on SocketException {
      return SyncStatus.offline;
    } on FileSystemException {
      return SyncStatus.error;
    } on IOException {
      return SyncStatus.error;
    } on FormatException {
      return SyncStatus.error;
    } finally {
      client.close(force: true);
    }
  }

  Future<SyncStatus> _sync(HttpClient client, _SyncDeadline deadline) async {
    final request = await client.postUrl(serverUrl.resolve('/sdk/sync'));
    request.followRedirects = false;
    request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $_credential');
    final response = await request.close();
    final body = await utf8.decoder.bind(response).join();
    if (response.statusCode < 200 || response.statusCode >= 300) {
      return SyncStatus.error;
    }

    final decoded = jsonDecode(body);
    if (!_isInventory(decoded)) {
      return _isAuthenticationAcknowledgement(decoded)
          ? SyncStatus.upToDate
          : SyncStatus.error;
    }
    if (deadline.expired) return SyncStatus.error;

    final inventory = jsonEncode(decoded);
    final inventoryFile = File(
      '${storageDirectory.path}${Platform.pathSeparator}sync-inventory.json',
    );
    if (await inventoryFile.exists() &&
        await inventoryFile.readAsString() == inventory) {
      return SyncStatus.upToDate;
    }

    if (!await _downloadNewWorkflowVersions(
      decoded,
      inventoryFile,
      client,
      deadline,
    )) {
      return SyncStatus.error;
    }

    return await _persistInventory(inventoryFile, inventory, deadline)
        ? SyncStatus.updated
        : SyncStatus.error;
  }

  Future<bool> _downloadNewWorkflowVersions(
    Object inventory,
    File inventoryFile,
    HttpClient client,
    _SyncDeadline deadline,
  ) async {
    final localVersionIds = await _localWorkflowVersionIds(inventoryFile);
    for (final workflow in _workflows(inventory)) {
      if (deadline.expired) return false;
      if (localVersionIds.contains(workflow.versionId)) continue;

      final temporaryDefinition = File(
        '${storageDirectory.path}${Platform.pathSeparator}workflow-definitions'
        '${Platform.pathSeparator}${base64Url.encode(utf8.encode(workflow.versionId))}.json',
      );
      final result = await _workflowVersionDownloader.download(
        serverUrl: serverUrl,
        credential: _credential,
        workflowVersionId: workflow.versionId,
        workflowName: workflow.name,
        temporaryDefinition: temporaryDefinition,
        allowInsecureLoopback: allowInsecureLoopback,
        onProgress: onProgress,
        httpClient: client,
      );
      try {
        onWorkflowDownload?.call(result);
      } catch (_) {
        return false;
      }
      if (result.status != WorkflowVersionDownloadStatus.downloaded)
        return false;
    }
    return !deadline.expired;
  }

  Future<Set<String>> _localWorkflowVersionIds(File inventoryFile) async {
    if (!await inventoryFile.exists()) return {};
    try {
      return _workflows(jsonDecode(await inventoryFile.readAsString()))
          .map((workflow) => workflow.versionId)
          .toSet();
    } on FormatException {
      return {};
    }
  }

  Iterable<_WorkflowManifestEntry> _workflows(Object inventory) {
    if (inventory is! Map || inventory['workflows'] is! List) return const [];
    return (inventory['workflows'] as List).whereType<Map>().expand((workflow) {
      final versionId = workflow['workflowVersionId'];
      final name = workflow['name'];
      return versionId is String && name is String
          ? [_WorkflowManifestEntry(versionId, name)]
          : const <_WorkflowManifestEntry>[];
    });
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
      value['models'] is List &&
      (value['workflows'] as List).every((item) => item is Map) &&
      (value['models'] as List).every((item) => item is Map);

  bool _isAuthenticationAcknowledgement(Object? value) =>
      value is Map &&
      value['authenticated'] == true &&
      !value.containsKey('workflows') &&
      !value.containsKey('models');

  Future<bool> _persistInventory(
    File inventoryFile,
    String inventory,
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
      await temporaryFile.writeAsString(inventory, flush: true);
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

class _SyncDeadline {
  var expired = false;

  void expire() => expired = true;
}

class _WorkflowManifestEntry {
  const _WorkflowManifestEntry(this.versionId, this.name);

  final String versionId;
  final String name;
}
