/// What the SDK did with an evidence for datasets: the events of its capture,
/// reported to the `onEvidence` callback of [AyniSdk.run] (US-066 to
/// US-068), and those of its upload, reported to the `onEvidence` callback of
/// [AyniSdk.sync] (US-070). The SDK also reports each [message] to
/// [AyniSdk.onProgress].
///
/// The SDK only creates evidence when the app passes `evidenceConsent: true`
/// to [AyniSdk.run]; without it, no event is reported and the image is not
/// kept. Each evidence reports [evidenceOptimizing], then [evidencePrepared]
/// once its image is ready, and finally [evidenceQueued] once it is pending
/// in the local queue. When it cannot be kept, the last event is instead
/// [evidenceStorageFull] or [evidenceDiscarded], which can also come right
/// after [evidenceOptimizing].
///
/// Each pending evidence that [AyniSdk.sync] starts to upload reports
/// [evidenceUploading], then [evidenceReceived] once the server confirmed it,
/// [evidenceUploadFailed] when it stays pending for a later sync,
/// [evidenceRetriesExhausted] when that failed upload was its last attempt
/// (US-071), or [evidenceCredentialRevoked] when the server rejected the
/// revoked credential.
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
  evidenceStorageFull,

  /// [AyniSdk.sync] started to upload a pending evidence: the collection
  /// policy, consulted right before, allows it over the current connection.
  evidenceUploading,

  /// The server confirmed that it received the evidence, its data and its
  /// image, so it is no longer pending and no later [AyniSdk.sync] uploads it
  /// again.
  evidenceReceived,

  /// The SDK could not send the evidence, or the server did not confirm it,
  /// so it stays pending as [EvidenceStatus.retrying] and a later
  /// [AyniSdk.sync] tries again.
  evidenceUploadFailed,

  /// The server rejected the upload because the credential was revoked. The
  /// evidence stays pending, and the SDK sends no other evidence in that
  /// [AyniSdk.sync]. It does not count as a failed attempt.
  evidenceCredentialRevoked,

  /// The upload failed again and the evidence reached
  /// [AyniSdk.maxEvidenceUploadAttempts] (US-071): it is
  /// [EvidenceStatus.failed]. The SDK keeps it on the device but no longer
  /// sends it automatically.
  evidenceRetriesExhausted;

  /// A Spanish message for diagnostics, which the SDK also reports through
  /// [AyniSdk.onProgress]: `Optimizando`,
  /// `Evidencia preparada para envío.`,
  /// `Evidencia guardada para envío posterior.`,
  /// `No se pudo preparar una evidencia. El resultado del análisis no se vio afectado.`,
  /// `No se pudo guardar una imagen para el dataset; el análisis se completó normalmente.`,
  /// `Subiendo evidencia…`, `Evidencia recibida.`,
  /// `No se pudo enviar la evidencia; se reintentará cuando sea posible.`
  /// `No se puede enviar evidencia porque la credencial fue revocada.`
  /// or
  /// `No se pudo enviar la evidencia después de varios intentos.`
  String get message => switch (this) {
    EvidenceEvent.evidenceOptimizing => 'Optimizando',
    EvidenceEvent.evidencePrepared => 'Evidencia preparada para envío.',
    EvidenceEvent.evidenceQueued => 'Evidencia guardada para envío posterior.',
    EvidenceEvent.evidenceDiscarded =>
      'No se pudo preparar una evidencia. El resultado del análisis no se vio afectado.',
    EvidenceEvent.evidenceStorageFull =>
      'No se pudo guardar una imagen para el dataset; el análisis se completó normalmente.',
    EvidenceEvent.evidenceUploading => 'Subiendo evidencia…',
    EvidenceEvent.evidenceReceived => 'Evidencia recibida.',
    EvidenceEvent.evidenceUploadFailed =>
      'No se pudo enviar la evidencia; se reintentará cuando sea posible.',
    EvidenceEvent.evidenceCredentialRevoked =>
      'No se puede enviar evidencia porque la credencial fue revocada.',
    EvidenceEvent.evidenceRetriesExhausted =>
      'No se pudo enviar la evidencia después de varios intentos.',
  };
}
