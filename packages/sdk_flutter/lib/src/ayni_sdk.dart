import 'dart:convert';
import 'dart:io';

enum SyncStatus { updated, upToDate, offline, error }

class AyniSdk {
  AyniSdk({
    required this.serverUrl,
    required String credential,
    required this.storageDirectory,
  }) : _credential = credential;

  final Uri serverUrl;
  final Directory storageDirectory;
  final String _credential;

  Future<SyncStatus> sync() async {
    final client = HttpClient();
    try {
      final request = await client.postUrl(serverUrl.resolve('/sdk/sync'));
      request.headers.set(
        HttpHeaders.authorizationHeader,
        'Bearer $_credential',
      );
      final response = await request.close();
      final body = await utf8.decoder.bind(response).join();
      if (response.statusCode < 200 || response.statusCode >= 300) {
        return SyncStatus.error;
      }

      final decoded = jsonDecode(body);
      if (decoded is! Map || decoded['authenticated'] != true) {
        return SyncStatus.error;
      }

      final inventory = jsonEncode(Map<String, dynamic>.from(decoded));
      final inventoryFile = File(
        '${storageDirectory.path}${Platform.pathSeparator}sync-inventory.json',
      );
      if (await inventoryFile.exists() &&
          await inventoryFile.readAsString() == inventory) {
        return SyncStatus.upToDate;
      }

      await _persistInventory(inventoryFile, inventory);
      return SyncStatus.updated;
    } on SocketException {
      return SyncStatus.offline;
    } on HttpException {
      return SyncStatus.offline;
    } on FileSystemException {
      return SyncStatus.error;
    } on FormatException {
      return SyncStatus.error;
    } finally {
      client.close(force: true);
    }
  }

  Future<void> _persistInventory(File inventoryFile, String inventory) async {
    await storageDirectory.create(recursive: true);
    final temporaryFile = File(
      '${inventoryFile.path}.${DateTime.now().microsecondsSinceEpoch}.tmp',
    );
    try {
      await temporaryFile.writeAsString(inventory, flush: true);
      await temporaryFile.rename(inventoryFile.path);
    } finally {
      if (await temporaryFile.exists()) await temporaryFile.delete();
    }
  }
}
