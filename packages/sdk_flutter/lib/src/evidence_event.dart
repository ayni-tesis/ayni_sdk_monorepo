/// What the SDK did with the evidence a `dataset.capture` node asked for,
/// reported to the `onEvidence` callback of [AyniSdk.run] (US-066, US-067).
///
/// The SDK only creates evidence when the app passes `evidenceConsent: true`
/// to [AyniSdk.run]; without it, no event is reported and the image is not
/// kept. Each evidence reports [evidenceOptimizing] and then either
/// [evidencePrepared] and [evidenceQueued], or [evidenceDiscarded].
enum EvidenceEvent {
  /// The SDK started reducing and compressing the image of the evidence with
  /// the size and quality of the application's collection policy.
  evidenceOptimizing,

  /// The SDK saved the optimized image and the inference result on the
  /// device, complete and ready to send.
  evidencePrepared,

  /// The SDK saved the image and the inference result on the device, to send
  /// them later.
  evidenceQueued,

  /// The SDK could not prepare the evidence, for example because it had no
  /// collection policy yet or could not optimize or save the image, and
  /// discarded it without leaving partial files. The result [AyniSdk.run]
  /// returned does not change.
  evidenceDiscarded;

  /// A Spanish message for diagnostics, which the SDK also reports through
  /// [AyniSdk.onProgress]: `Optimizando`,
  /// `Evidencia preparada para envío.`,
  /// `Evidencia guardada para envío posterior.` or
  /// `No se pudo preparar una evidencia. El resultado del análisis no se vio afectado.`
  String get message => switch (this) {
    EvidenceEvent.evidenceOptimizing => 'Optimizando',
    EvidenceEvent.evidencePrepared => 'Evidencia preparada para envío.',
    EvidenceEvent.evidenceQueued => 'Evidencia guardada para envío posterior.',
    EvidenceEvent.evidenceDiscarded =>
      'No se pudo preparar una evidencia. El resultado del análisis no se vio afectado.',
  };
}
