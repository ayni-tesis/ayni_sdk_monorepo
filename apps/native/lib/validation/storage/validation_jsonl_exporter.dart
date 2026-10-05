import 'dart:io';

import 'package:share_plus/share_plus.dart';

import 'validation_jsonl_store.dart';

abstract interface class ValidationFileShare {
  Future<void> share(File file);
}

class SharePlusValidationFileShare implements ValidationFileShare {
  const SharePlusValidationFileShare();

  @override
  Future<void> share(File file) async {
    await SharePlus.instance.share(
      ShareParams(
        files: [XFile(file.path)],
        title: 'Resultados de validación',
        subject: 'Resultados de validación JSONL',
      ),
    );
  }
}

class ValidationJsonlExporter {
  ValidationJsonlExporter({
    ValidationFileShare share = const SharePlusValidationFileShare(),
  }) : _share = share;

  final ValidationFileShare _share;

  Future<void> export(File jsonlFile) async {
    if (!await jsonlFile.exists() ||
        !jsonlFile.path.toLowerCase().endsWith('.jsonl')) {
      throw const ValidationJsonlException(
        'No se encontró el archivo local de resultados JSONL.',
      );
    }
    await _share.share(jsonlFile);
  }
}
