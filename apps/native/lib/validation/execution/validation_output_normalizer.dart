import 'package:ayni_sdk/ayni_sdk.dart';

import '../models/experiment_plan.dart';

class ValidationTensor {
  ValidationTensor({required List<int> shape, required List<double> values})
    : shape = List.unmodifiable(shape),
      values = List.unmodifiable(values);

  final List<int> shape;
  final List<double> values;
}

class ValidationOutputNormalizer {
  const ValidationOutputNormalizer();

  Map<String, Object?> normalizeDirect({
    required List<ValidationTensor> tensors,
    required List<ValidationOutputContract> contracts,
  }) {
    if (contracts.length != 1) {
      throw const ValidationOutputException('unsupportedOutputCount');
    }
    final contract = contracts.single;
    final normalized = switch (contract.resultType) {
      ValidationResultType.classification => _classificationFromTensors(
        tensors,
        contract,
      ),
      ValidationResultType.detection => _detectionsFromTensors(
        tensors,
        contract,
      ),
      ValidationResultType.boolean => throw const ValidationOutputException(
        'unsupportedDirectOutputType',
      ),
    };
    return {contract.name: normalized};
  }

  Map<String, Object?> normalizeSdk({
    required Map<String, WorkflowValue> outputs,
    required List<ValidationOutputContract> contracts,
  }) {
    final expectedNames = contracts.map((contract) => contract.name).toSet();
    if (outputs.keys.toSet().difference(expectedNames).isNotEmpty ||
        expectedNames.difference(outputs.keys.toSet()).isNotEmpty) {
      throw const ValidationOutputException('outputNamesMismatch');
    }
    return {
      for (final contract in contracts)
        contract.name: _normalizeSdkValue(outputs[contract.name]!, contract),
    };
  }

  Object? _classificationFromTensors(
    List<ValidationTensor> tensors,
    ValidationOutputContract contract,
  ) {
    if (tensors.isEmpty) {
      throw const ValidationOutputException('classificationTensorMissing');
    }
    final scores = tensors.first.values;
    if (scores.length != contract.labels.length ||
        scores.any((value) => !value.isFinite || value < 0 || value > 1)) {
      throw const ValidationOutputException('classificationScoresInvalid');
    }
    var best = 0;
    for (var index = 1; index < scores.length; index++) {
      if (scores[index] > scores[best]) best = index;
    }
    return {
      'type': 'classification',
      'label': contract.labels[best],
      'confidence': scores[best],
      'confidences': {
        for (var index = 0; index < scores.length; index++)
          contract.labels[index]: scores[index],
      },
    };
  }

  Object? _detectionsFromTensors(
    List<ValidationTensor> tensors,
    ValidationOutputContract contract,
  ) {
    if (tensors.length != 4 || contract.scoreThreshold == null) {
      throw const ValidationOutputException('detectionTensorsInvalid');
    }
    final boxIndex = tensors.indexWhere(
      (tensor) =>
          tensor.shape.length == 3 &&
          tensor.shape.first == 1 &&
          tensor.shape.last == 4,
    );
    if (boxIndex < 0) {
      throw const ValidationOutputException('detectionBoxesMissing');
    }
    final boxes = tensors[boxIndex].values;
    final vectors = <List<double>>[];
    for (var index = 0; index < tensors.length; index++) {
      final shape = tensors[index].shape;
      if (index != boxIndex &&
          shape.length == 2 &&
          shape.first == 1 &&
          shape.last == boxes.length ~/ 4) {
        vectors.add(tensors[index].values);
      }
    }
    if (vectors.length < 2) {
      throw const ValidationOutputException('detectionVectorsMissing');
    }
    final scores = vectors.cast<List<double>?>().firstWhere(
      (vector) =>
          vector!.every((score) => score.isFinite && score >= 0 && score <= 1),
      orElse: () => null,
    );
    if (scores == null) {
      throw const ValidationOutputException('detectionScoresInvalid');
    }
    final classes = vectors.cast<List<double>?>().firstWhere(
      (vector) =>
          !identical(vector, scores) &&
          vector!.every(
            (label) => label.isFinite && label == label.roundToDouble(),
          ),
      orElse: () => null,
    );
    if (classes == null) {
      throw const ValidationOutputException('detectionLabelsInvalid');
    }
    final detections = <Map<String, Object?>>[];
    var invalidAboveThreshold = false;
    for (var index = 0; index < scores.length; index++) {
      final score = scores[index];
      final labelIndex = classes[index].toInt();
      final yMin = boxes[index * 4];
      final xMin = boxes[index * 4 + 1];
      final yMax = boxes[index * 4 + 2];
      final xMax = boxes[index * 4 + 3];
      if (score < contract.scoreThreshold!) continue;
      if (labelIndex < 0 ||
          labelIndex >= contract.labels.length ||
          [
            xMin,
            yMin,
            xMax,
            yMax,
          ].any((value) => !value.isFinite || value < 0 || value > 1) ||
          xMin >= xMax ||
          yMin >= yMax) {
        invalidAboveThreshold = true;
        continue;
      }
      detections.add({
        'label': contract.labels[labelIndex],
        'confidence': score,
        'xMin': xMin,
        'yMin': yMin,
        'xMax': xMax,
        'yMax': yMax,
      });
    }
    if (detections.isEmpty && invalidAboveThreshold) {
      throw const ValidationOutputException('detectionValuesInvalid');
    }
    return {'type': 'detection', 'detections': detections};
  }

  Object? _normalizeSdkValue(
    WorkflowValue value,
    ValidationOutputContract contract,
  ) {
    if (contract.resultType == ValidationResultType.classification &&
        value is ClassificationResult) {
      if (value.confidences.length != contract.labels.length ||
          contract.labels.any(
            (label) => !value.confidences.containsKey(label),
          ) ||
          value.label !=
              contract.labels.firstWhere(
                (label) => value.confidences[label] == value.confidence,
                orElse: () => '',
              )) {
        throw const ValidationOutputException('classificationLabelsMismatch');
      }
      return {
        'type': 'classification',
        'label': value.label,
        'confidence': value.confidence,
        'confidences': value.confidences,
      };
    }
    if (contract.resultType == ValidationResultType.detection &&
        value is DetectionResult) {
      return {
        'type': 'detection',
        'detections': [
          for (final detection in value.detections)
            {
              'label': detection.label,
              'confidence': detection.confidence,
              'xMin': detection.xMin,
              'yMin': detection.yMin,
              'xMax': detection.xMax,
              'yMax': detection.yMax,
            },
        ],
      };
    }
    if (contract.resultType == ValidationResultType.boolean &&
        value is BooleanResult) {
      return {'type': 'boolean', 'value': value.value};
    }
    throw const ValidationOutputException('outputTypeMismatch');
  }
}

class ValidationOutputException implements Exception {
  const ValidationOutputException(this.code);

  final String code;

  @override
  String toString() => 'ValidationOutputException($code)';
}
