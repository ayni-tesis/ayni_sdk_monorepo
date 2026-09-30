// ignore_for_file: public_member_api_docs

import 'dart:convert';
import 'dart:io';

import 'sdk_consent.dart';

class ConsentReceipt {
  const ConsentReceipt({
    required this.receiptId,
    required this.subjectId,
    required this.purpose,
    required this.decision,
    required this.noticeVersion,
    required this.decidedAt,
  });

  final String receiptId;
  final String subjectId;
  final ConsentPurpose purpose;
  final ConsentDecision decision;
  final String noticeVersion;
  final DateTime decidedAt;

  Map<String, Object?> toJson() => {
    'receiptId': receiptId,
    'subjectId': subjectId,
    'purpose': purpose.wireValue,
    'decision': decision.name,
    'noticeVersion': noticeVersion,
    'decidedAt': decidedAt.toUtc().toIso8601String(),
  };

  static ConsentReceipt? fromJson(Object? value) {
    if (value is! Map) return null;
    final receiptId = value['receiptId'];
    final subjectId = value['subjectId'];
    final purposeValue = value['purpose'];
    final decisionValue = value['decision'];
    final noticeVersion = value['noticeVersion'];
    final decidedAtValue = value['decidedAt'];
    final purpose = ConsentPurpose.values.where(
      (item) => item.wireValue == purposeValue,
    );
    final decision = ConsentDecision.values.where(
      (item) => item.name == decisionValue,
    );
    final decidedAt = decidedAtValue is String
        ? DateTime.tryParse(decidedAtValue)
        : null;
    if (receiptId is! String ||
        subjectId is! String ||
        purpose.isEmpty ||
        decision.isEmpty ||
        noticeVersion is! String ||
        decidedAt == null) {
      return null;
    }
    return ConsentReceipt(
      receiptId: receiptId,
      subjectId: subjectId,
      purpose: purpose.first,
      decision: decision.first,
      noticeVersion: noticeVersion,
      decidedAt: decidedAt,
    );
  }
}

class ConsentReceiptStore {
  ConsentReceiptStore(Directory directory)
    : _file = File(
        '${directory.path}${Platform.pathSeparator}consent-receipts.json',
      );

  // ponytail: one lock serializes mutations across directories; use
  // per-directory locks if contention matters.
  static Future<void> _work = Future<void>.value();
  static Future<void> Function()? beforeRemoveForTesting;

  final File _file;

  Future<List<ConsentReceipt>> pending() async {
    if (!await _file.exists()) return [];
    final decoded = jsonDecode(await _file.readAsString());
    if (decoded is! List)
      throw const FormatException('Invalid consent receipt queue');
    final receipts = decoded.map(ConsentReceipt.fromJson).toList();
    if (receipts.any((receipt) => receipt == null)) {
      throw const FormatException('Invalid consent receipt queue');
    }
    return receipts.cast<ConsentReceipt>();
  }

  Future<void> enqueue(ConsentReceipt receipt) async {
    await _serialize(() async {
      final receipts = await pending();
      receipts.add(receipt);
      await _write(receipts);
    });
  }

  Future<void> remove(String receiptId) async {
    await _serialize(() async {
      await beforeRemoveForTesting?.call();
      final receipts = await pending();
      receipts.removeWhere((receipt) => receipt.receiptId == receiptId);
      if (receipts.isEmpty && await _file.exists()) {
        await _file.delete();
        return;
      }
      await _write(receipts);
    });
  }

  Future<void> _serialize(Future<void> Function() operation) {
    final previous = _work;
    final result = previous.then((_) => operation());
    _work = result.then<void>((_) {}, onError: (Object _, StackTrace __) {});
    return result;
  }

  Future<void> _write(List<ConsentReceipt> receipts) async {
    await _file.parent.create(recursive: true);
    final temporaryFile = File(
      '${_file.path}.${DateTime.now().microsecondsSinceEpoch}.tmp',
    );
    try {
      await temporaryFile.writeAsString(
        jsonEncode(receipts.map((receipt) => receipt.toJson()).toList()),
        flush: true,
      );
      await temporaryFile.rename(_file.path);
    } finally {
      if (await temporaryFile.exists()) await temporaryFile.delete();
    }
  }
}
