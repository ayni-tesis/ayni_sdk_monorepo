/// What the SDK did with the evidence a `dataset.capture` node asked for,
/// reported to the `onEvidence` callback of [AyniSdk.run] (US-066).
///
/// The SDK only creates evidence when the app passes `evidenceConsent: true`
/// to [AyniSdk.run]; without it, no event is reported and the image is not
/// kept.
enum EvidenceEvent {
  /// The SDK saved the image and the inference result on the device, to send
  /// them later.
  evidenceQueued;

  /// A Spanish message for diagnostics, which the SDK also reports through
  /// [AyniSdk.onProgress]: `Evidencia guardada para envío posterior.`
  String get message => switch (this) {
    EvidenceEvent.evidenceQueued => 'Evidencia guardada para envío posterior.',
  };
}
