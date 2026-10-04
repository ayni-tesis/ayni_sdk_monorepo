/// The state of one evidence for datasets kept on this device, which
/// [AyniSdk.evidenceStatusCounts] counts (US-071).
///
/// A new evidence is [pending]. When [AyniSdk.sync] cannot send it, it is
/// [retrying] and a later sync tries again, waiting a little longer after
/// each failed attempt. Once the server confirms it, it is [received]. After
/// [AyniSdk.maxEvidenceUploadAttempts] attempts without that confirmation it
/// is [failed]: the SDK keeps it on the device but no longer sends it
/// automatically. [AyniSdk.pendingEvidenceCount] counts the [pending] and
/// [retrying] ones.
enum EvidenceStatus {
  /// Saved in the local queue and waiting for its first upload.
  pending,

  /// At least one upload failed, for example because the network or the
  /// server failed, and a later [AyniSdk.sync] tries again.
  retrying,

  /// The server confirmed that it received the evidence. The SDK does not
  /// send it again.
  received,

  /// The SDK reached the limit of upload attempts without a confirmation. It
  /// keeps the evidence on the device, does not send it again automatically
  /// and does not count it as pending.
  failed;

  /// A Spanish text the app can show for this state: `Pendiente`,
  /// `Reintentando`, `Enviada` or `Fallida`.
  String get message => switch (this) {
    EvidenceStatus.pending => 'Pendiente',
    EvidenceStatus.retrying => 'Reintentando',
    EvidenceStatus.received => 'Enviada',
    EvidenceStatus.failed => 'Fallida',
  };
}
