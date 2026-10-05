import 'models/validation_run_record.dart';

const validationBuildMode = String.fromEnvironment(
  'VALIDATION_CONDITION',
  defaultValue: 'selector',
);

const validationBuildModeIsValid =
    validationBuildMode == 'selector' ||
    validationBuildMode == 'control' ||
    validationBuildMode == 'treatment';

bool isValidationBuildModeValid(String buildMode) =>
    buildMode == 'selector' ||
    buildMode == 'control' ||
    buildMode == 'treatment';

enum ValidationRunnerKind { unavailable, direct, sdk }

ValidationRunnerKind validationRunnerKindFor({
  required String buildMode,
  required ValidationCondition condition,
}) {
  if (buildMode == 'selector') {
    return condition == ValidationCondition.control
        ? ValidationRunnerKind.direct
        : ValidationRunnerKind.sdk;
  }
  if (buildMode == 'control' && condition == ValidationCondition.control) {
    return ValidationRunnerKind.direct;
  }
  if (buildMode == 'treatment' && condition == ValidationCondition.treatment) {
    return ValidationRunnerKind.sdk;
  }
  return ValidationRunnerKind.unavailable;
}
