/// Optional Ayni-owned uses of data. Each purpose requires its own choice.
enum ConsentPurpose {
  /// Use images and their labels to improve Ayni inference models.
  modelImprovement('ayniModelImprovement'),

  /// Use technical traces to improve SDK workflows and components.
  sdkImprovement('ayniSdkImprovement');

  const ConsentPurpose(this.wireValue);

  /// Stable value sent to the Ayni API.
  final String wireValue;
}

/// The user's explicit answer for one [ConsentPurpose].
enum ConsentDecision { accepted, declined }

/// Whether an explicit consent decision reached Ayni.
enum ConsentStatus { synced, pending, error }

/// Result of saving one consent choice locally and, when online, on Ayni.
class ConsentResult {
  /// Creates the result of a consent operation.
  const ConsentResult(this.status);

  /// Whether the receipt was synchronized, queued locally, or could not be saved.
  final ConsentStatus status;

  /// A short Spanish message suitable for the host application's UI.
  String get message => switch (status) {
    ConsentStatus.synced => 'Preferencia guardada.',
    ConsentStatus.pending =>
      'Preferencia guardada en este dispositivo; se sincronizará al recuperar conexión.',
    ConsentStatus.error =>
      'No pudimos guardar tu preferencia. Esta finalidad sigue desactivada.',
  };
}
