/// The state of the local queue of evidence for datasets pending upload on
/// this device, which [AyniSdk.evidenceQueueStatus] reports (US-069).
///
/// The application's collection policy says over which network the SDK may
/// send evidence: `Solo Wi-Fi` or `Wi-Fi y datos móviles`. While it only
/// allows Wi-Fi and the device uses mobile data or has no connection, the
/// queue is [waitingForWifi]: the SDK keeps the evidence pending, starts no
/// upload and uses no mobile data for it.
enum EvidenceQueueStatus {
  /// No evidence is pending upload on this device.
  empty,

  /// Evidence is pending upload, and nothing in the collection policy the
  /// SDK last saved keeps it waiting for Wi-Fi. It stays pending until the
  /// SDK sends it.
  pending,

  /// Evidence is pending upload, the collection policy only allows sending
  /// it over Wi-Fi, and the device uses mobile data, another network or no
  /// connection, so the SDK keeps it pending until the device uses Wi-Fi.
  waitingForWifi;

  /// A Spanish text the app can show for this state:
  /// `Sin evidencia pendiente de envío`, `Evidencia pendiente de envío` or
  /// `Pendiente de Wi-Fi`.
  String get message => switch (this) {
    EvidenceQueueStatus.empty => 'Sin evidencia pendiente de envío',
    EvidenceQueueStatus.pending => 'Evidencia pendiente de envío',
    EvidenceQueueStatus.waitingForWifi => 'Pendiente de Wi-Fi',
  };
}
