/// The state of one evidence for datasets kept on this device, which
/// [AyniSdk.evidenceStatusCounts] counts (US-071, US-072).
///
/// A new evidence is [pending], and [uploading] while [AyniSdk.sync] sends
/// it. When the upload ends without a confirmation of the server, it is
/// [retrying] and a later sync tries again, waiting a little longer after
/// each failed attempt. Once the server confirms it, it is [received] and
/// the SDK deletes its local copy, so it leaves the counts. After
/// [AyniSdk.maxEvidenceUploadAttempts] attempts without that confirmation it
/// is [failed]: the SDK keeps it on the device but no longer sends it
/// automatically. [AyniSdk.pendingEvidenceCount] counts the [pending],
/// [uploading] and [retrying] ones.
enum EvidenceStatus {
  /// Saved in the local queue and waiting for its first upload.
  pending,

  /// [AyniSdk.sync] is sending it now. It is never shown as [received]
  /// before the server confirms it.
  uploading,

  /// At least one upload failed, for example because the network or the
  /// server failed, and a later [AyniSdk.sync] tries again.
  retrying,

  /// The server confirmed that it received the evidence, so the SDK does not
  /// send it again and deletes its local copy right away. The counts include
  /// it only while the SDK could not start deleting that copy yet, for
  /// example because a file was locked; a later [AyniSdk.sync] or
  /// [AyniSdk.initialize] deletes it.
  received,

  /// The SDK reached the limit of upload attempts without a confirmation. It
  /// keeps the evidence on the device, does not send it again automatically
  /// and does not count it as pending.
  failed;

  /// A Spanish text the app can show for this state: `Pendiente`,
  /// `Enviando`, `Reintentando`, `Enviada` or `Fallida`.
  String get message => switch (this) {
    EvidenceStatus.pending => 'Pendiente',
    EvidenceStatus.uploading => 'Enviando',
    EvidenceStatus.retrying => 'Reintentando',
    EvidenceStatus.received => 'Enviada',
    EvidenceStatus.failed => 'Fallida',
  };
}
