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
    final indices = contract.tensorIndices;
    if (tensors.length != 4 ||
        contract.scoreThreshold == null ||
        indices == null ||
        indices.keys.toSet().difference(const {
          'boxes',
          'classes',
          'scores',
          'count',
        }).isNotEmpty ||
        indices.length != 4 ||
        indices.values.toSet().length != 4 ||
        indices.values.any((index) => index < 0 || index >= tensors.length)) {
      throw const ValidationOutputException('detectionTensorsInvalid');
    }
    final boxesTensor = tensors[indices['boxes']!];
    final classesTensor = tensors[indices['classes']!];
    final scoresTensor = tensors[indices['scores']!];
    final countTensor = tensors[indices['count']!];
    final boxes = boxesTensor.values;
    if (boxesTensor.shape.length != 3 ||
        boxesTensor.shape[0] != 1 ||
        boxesTensor.shape[2] != 4 ||
        boxes.length != boxesTensor.shape[1] * 4) {
      throw const ValidationOutputException('detectionBoxesMissing');
    }
    final candidateCount = boxesTensor.shape[1];
    if (classesTensor.shape.length != 2 ||
        classesTensor.shape[0] != 1 ||
        classesTensor.shape[1] != candidateCount ||
        classesTensor.values.length != candidateCount) {
      throw const ValidationOutputException('detectionLabelsInvalid');
    }
    if (scoresTensor.shape.length != 2 ||
        scoresTensor.shape[0] != 1 ||
        scoresTensor.shape[1] != candidateCount ||
        scoresTensor.values.length != candidateCount ||
        scoresTensor.values.any(
          (score) => !score.isFinite || score < 0 || score > 1,
        )) {
      throw const ValidationOutputException('detectionScoresInvalid');
    }
    final classes = classesTensor.values;
    if (classes.any(
      (label) => !label.isFinite || label != label.roundToDouble(),
    )) {
      throw const ValidationOutputException('detectionLabelsInvalid');
    }
    final countShapeIsValid =
        (countTensor.shape.length == 1 && countTensor.shape[0] == 1) ||
        (countTensor.shape.length == 2 &&
            countTensor.shape[0] == 1 &&
            countTensor.shape[1] == 1);
    if (!countShapeIsValid || countTensor.values.length != 1) {
      throw const ValidationOutputException('detectionTensorsInvalid');
    }
    final count = countTensor.values.single;
    if (!count.isFinite ||
        count != count.roundToDouble() ||
        count < 0 ||
        count > candidateCount) {
      throw const ValidationOutputException('detectionTensorsInvalid');
    }
    final detections = <Map<String, Object?>>[];
    var invalidAboveThreshold = false;
    for (var index = 0; index < count.toInt(); index++) {
      final score = scoresTensor.values[index];
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
