/// What the SDK did with the evidence a `dataset.capture` node asked for,
/// reported to the `onEvidence` callback of [AyniSdk.run] (US-066 to US-068).
///
/// The SDK only creates evidence when the app passes `evidenceConsent: true`
/// to [AyniSdk.run]; without it, no event is reported and the image is not
/// kept. Each evidence reports [evidenceOptimizing], then [evidencePrepared]
/// once its image is ready, and finally [evidenceQueued] once it is pending
/// in the local queue. When it cannot be kept, the last event is instead
/// [evidenceStorageFull] or [evidenceDiscarded], which can also come right
/// after [evidenceOptimizing].
enum EvidenceEvent {
  /// The SDK started reducing and compressing the image of the evidence with
  /// the size and quality of the application's collection policy.
  evidenceOptimizing,

  /// The SDK optimized the image of the evidence and is about to save it on
  /// the device with the inference result.
  evidencePrepared,

  /// The SDK saved the image and the inference result, complete, in the
  /// local queue of evidence pending upload, where they stay across restarts
  /// of the app. [AyniSdk.pendingEvidenceCount] already counts it.
  evidenceQueued,

  /// The SDK could not prepare the evidence, for example because it had no
  /// collection policy yet or could not optimize the image or save it for a
  /// reason other than a full device, and discarded it without leaving
  /// partial files. The result [AyniSdk.run] returned does not change.
  evidenceDiscarded,

  /// The device had no space left to save the evidence, so the SDK
  /// discarded it without leaving partial files. The result [AyniSdk.run]
  /// returned does not change, and the evidence already pending stays.
  evidenceStorageFull;

  /// A Spanish message for diagnostics, which the SDK also reports through
  /// [AyniSdk.onProgress]: `Optimizando`,
  /// `Evidencia preparada para envío.`,
  /// `Evidencia guardada para envío posterior.`,
  /// `No se pudo preparar una evidencia. El resultado del análisis no se vio afectado.`
  /// or
  /// `No se pudo guardar una imagen para el dataset; el análisis se completó normalmente.`
  String get message => switch (this) {
    EvidenceEvent.evidenceOptimizing => 'Optimizando',
    EvidenceEvent.evidencePrepared => 'Evidencia preparada para envío.',
    EvidenceEvent.evidenceQueued => 'Evidencia guardada para envío posterior.',
    EvidenceEvent.evidenceDiscarded =>
      'No se pudo preparar una evidencia. El resultado del análisis no se vio afectado.',
    EvidenceEvent.evidenceStorageFull =>
      'No se pudo guardar una imagen para el dataset; el análisis se completó normalmente.',
  };
}
