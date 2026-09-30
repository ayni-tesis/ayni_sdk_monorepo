// Example of recording one specific privacy choice with the public SDK API.
import 'package:ayni_sdk/ayni_sdk.dart';

/// Saves the current choice for the image model improvement purpose.
Future<void> recordModelImprovementConsent(
  AyniSdk sdk,
  String opaqueUserId,
  bool enabled,
  String displayedNoticeVersion,
  void Function(String message) showMessage,
) async {
  // #region registrarConsentimiento
  final result = await sdk.recordConsent(
    subjectId: opaqueUserId,
    purpose: ConsentPurpose.modelImprovement,
    decision: enabled ? ConsentDecision.accepted : ConsentDecision.declined,
    noticeVersion: displayedNoticeVersion,
  );
  showMessage(result.message);
  // #endregion registrarConsentimiento
}
