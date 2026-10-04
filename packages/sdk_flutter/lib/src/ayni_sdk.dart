import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';
import 'device_profile.dart';
import 'model_artifact_downloader.dart';
import 'model_artifact_installer.dart';
import 'model_artifact_integrity_verifier.dart';
import 'consent_receipt_store.dart';
import 'evidence_event.dart';
import 'evidence_store.dart';
import 'installation_id_store.dart';
import 'sdk_consent.dart';
import 'telemetry_policy_store.dart';
import 'trace_outbox_store.dart';
import 'sdk_internal.dart';
import 'uuid_v4.dart';
import 'workflow_definition_validator.dart';
import 'workflow_version_downloader.dart';
import 'workflow_execution.dart';
import 'workflow_trace.dart';
import 'supported_platform_stub.dart'
    if (dart.library.ui) 'supported_platform_flutter.dart'
    as platform;
import 'device_profile_reader_stub.dart'
    if (dart.library.ui) 'device_profile_reader_flutter.dart'
    as device_profile_reader;

/// The overall outcome of an [AyniSdk.sync] call, in [SyncResult.status].
///
/// Whatever the status, the workflow and model versions the device already
/// had stay installed, so [AyniSdk.run] keeps working offline.
enum SyncStatus {
  /// The device saved at least one new workflow or model version (see
  /// [SyncResourceStatus.updated]).
  ///
  /// When another resource failed in the same sync, the status is [error]
  /// instead.
  updated,

  /// Nothing new was installed.
  ///
  /// The device already had every published version, the server acknowledged
  /// the credential without listing resources, or the only rejections were
  /// incompatible workflow definitions
  /// ([SyncResourceStatus.invalidWorkflow] or
  /// [SyncResourceStatus.unsupportedWorkflowVersion]).
  upToDate,

  /// The server could not be reached, for example because the device has no
  /// network connection.
  offline,

  /// The sync did not complete.
  ///
  /// It happens when [AyniSdk.serverUrl] cannot receive the credential (see
  /// [AyniConfig.serverUrl]), the server answers with a non-2xx status (such
  /// as a revoked credential), the response is not a valid inventory,
  /// [AyniSdk.syncTimeout] elapses, the device storage fails, or a resource
  /// update fails. [SyncResult.resources] names the failed resources, if any.
  error,
}

/// The outcome of one workflow or model during an [AyniSdk.sync], in
/// [SyncResourceResult.status].
enum SyncResourceStatus {
  /// The device saved the resource's new published version.
  ///
  /// A workflow's new definition is installed. A model's new file is
  /// downloaded only when a workflow that needs it is installed; until then
  /// only its new version is recorded.
  updated,

  /// The installed version is the published one, so nothing changed.
  ///
  /// A model also reports it when its new version was rolled back because a
  /// workflow that needed it failed; the previous version stays installed.
  upToDate,

  /// The server listed the resource with invalid data, so the local version
  /// was kept.
  ///
  /// It happens when the entry lacks a required field or has an invalid one,
  /// when a workflow needs a model that is neither listed nor installed or
  /// that is itself invalid, or when a model keeps its installed version
  /// number but changes its SHA-256 hash
  /// ([SyncResourceResult.remoteHashConflict]).
  invalidRemoteResource,

  /// The downloaded workflow definition failed the SDK's validation (invalid
  /// schema, unknown node type, undeclared model, missing node, cycle, or
  /// incompatible port), so it was not installed.
  ///
  /// It does not turn [SyncResult.status] into [SyncStatus.error].
  /// [SyncResourceResult.previousVersionRetained] tells whether the last
  /// valid version is still installed.
  invalidWorkflow,

  /// The workflow definition declares a schema version that this SDK release
  /// does not support (US-098), so it was not installed.
  ///
  /// It does not turn [SyncResult.status] into [SyncStatus.error].
  /// [SyncResourceResult.previousVersionRetained] tells whether the last
  /// compatible version is still installed.
  unsupportedWorkflowVersion,

  /// The workflow definition was valid but could not be saved on the device.
  installationFailed,

  /// A model the workflow needs could not be downloaded, verified, or
  /// installed; [SyncResourceResult.dependencyName] names it.
  dependencyFailed,

  /// The server no longer serves the workflow version it listed (it answered
  /// `404 Not Found`).
  workflowUnavailable,
}

/// The kind of resource a [SyncResourceResult] describes.
enum SyncResourceType {
  /// A published workflow version.
  workflow,

  /// An on-device model version that a workflow needs.
  model,
}

/// The outcome of one workflow or model during an [AyniSdk.sync].
///
/// Show [message] when it is not `null`: it explains, in Spanish, what
/// happened and whether the previous version is still installed.
class SyncResourceResult {
  /// Creates the result of one resource.
  ///
  /// The SDK creates these results during [AyniSdk.sync]; apps only read
  /// them.
  const SyncResourceResult({
    required this.type,
    required this.status,
    this.resourceVersionId,
    this.version,
    this.name,
    this.previousVersionRetained = false,
    this.dependencyName,
    this.remoteHashConflict = false,
  });

  /// Whether this result describes a workflow or a model.
  final SyncResourceType type;

  /// What happened to the resource during the sync.
  final SyncResourceStatus status;

  /// The ID of the workflow version or model version, or `null` when the
  /// server listed the resource without a valid one.
  final String? resourceVersionId;

  /// The version the server published, such as `1.2.0`, or `null` when the
  /// server listed the resource without a valid one.
  ///
  /// For a model rolled back to its installed version, it is the installed
  /// version.
  final String? version;

  /// The workflow's name, or `null` for models and for invalid server
  /// entries.
  final String? name;

  /// Whether a valid local version of this workflow was kept when the update
  /// was rejected (US-042, US-098).
  ///
  /// It applies to [SyncResourceStatus.invalidWorkflow],
  /// [SyncResourceStatus.unsupportedWorkflowVersion],
  /// [SyncResourceStatus.installationFailed],
  /// [SyncResourceStatus.dependencyFailed], and
  /// [SyncResourceStatus.workflowUnavailable], and selects their [message].
  /// Defaults to `false`.
  final bool previousVersionRetained;

  /// The model version ID of the dependency that failed, for
  /// [SyncResourceStatus.dependencyFailed] (US-044); `null` otherwise.
  final String? dependencyName;

  /// Whether the server published a model with the installed version number
  /// but a different SHA-256 hash.
  ///
  /// Only an [SyncResourceStatus.invalidRemoteResource] model sets it; the
  /// installed copy is kept. Defaults to `false`.
  final bool remoteHashConflict;

  /// A Spanish message that explains the outcome, or `null` when [status] is
  /// [SyncResourceStatus.updated] or [SyncResourceStatus.upToDate].
  ///
  /// For example, an [SyncResourceStatus.invalidWorkflow] whose previous
  /// version was kept returns `La actualización de <name> no es compatible.
  /// Se mantuvo la última versión válida.`
  String? get message =>
      status == SyncResourceStatus.invalidRemoteResource && remoteHashConflict
      ? 'La actualización no coincide con la versión instalada; se conservará la copia local.'
      : switch (status) {
          SyncResourceStatus.invalidRemoteResource =>
            'Se mantuvo la versión local porque la actualización no es válida.',
          SyncResourceStatus.invalidWorkflow when previousVersionRetained =>
            'La actualización de $name no es compatible. Se mantuvo la última versión válida.',
          SyncResourceStatus.invalidWorkflow =>
            'La actualización de $name no es compatible. No se instaló ninguna versión.',
          SyncResourceStatus.unsupportedWorkflowVersion
              when previousVersionRetained =>
            'Este workflow requiere una versión más reciente del SDK. Se conservará la última versión compatible.',
          SyncResourceStatus.unsupportedWorkflowVersion =>
            'Este workflow requiere una versión más reciente del SDK. No se instaló ninguna versión.',
          SyncResourceStatus.installationFailed when previousVersionRetained =>
            'No se pudo guardar la actualización. Se mantuvo la versión anterior.',
          SyncResourceStatus.installationFailed =>
            'No se pudo guardar la actualización. No se instaló ninguna versión.',
          SyncResourceStatus.dependencyFailed when previousVersionRetained =>
            'No se pudo preparar $name: $dependencyName. Se mantuvo la última versión válida.',
          SyncResourceStatus.dependencyFailed =>
            'No se pudo preparar $name: $dependencyName.',
          SyncResourceStatus.workflowUnavailable when previousVersionRetained =>
            'El workflow ya no está disponible. Se mantuvo la versión anterior.',
          SyncResourceStatus.workflowUnavailable =>
            'El workflow ya no está disponible. No se instaló ninguna versión.',
          _ => null,
        };
}

/// The outcome of an [AyniSdk.sync] call.
///
/// ```dart
/// final result = await sdk.sync();
/// switch (result.status) {
///   case SyncStatus.offline:
///     showMessage('Sin conexión. Se usarán los workflows instalados.');
///   case SyncStatus.error:
///     showMessage(
///       result.resources.isNotEmpty
///           ? 'La sincronización terminó con errores. Revisa cada recurso.'
///           : 'La sincronización terminó con errores.',
///     );
///   case SyncStatus.updated:
///   case SyncStatus.upToDate:
///     break;
/// }
/// for (final resource in result.resources) {
///   switch (resource.status) {
///     case SyncResourceStatus.updated:
///       showMessage('Recurso actualizado.');
///     case SyncResourceStatus.upToDate:
///       showMessage('El recurso ya está actualizado.');
///     case SyncResourceStatus.invalidRemoteResource:
///     case SyncResourceStatus.invalidWorkflow:
///     case SyncResourceStatus.unsupportedWorkflowVersion:
///     case SyncResourceStatus.installationFailed:
///     case SyncResourceStatus.dependencyFailed:
///     case SyncResourceStatus.workflowUnavailable:
///       showMessage(resource.message ?? 'No se pudo actualizar un recurso.');
///   }
/// }
/// ```
class SyncResult {
  /// Creates a sync result with its overall [status] and the outcome of each
  /// resource.
  ///
  /// [resources] defaults to an empty list. The SDK creates these results;
  /// apps only read them.
  const SyncResult(this.status, [this.resources = const []]);

  /// The overall outcome of the sync.
  final SyncStatus status;

  /// The outcome of every workflow and model the server listed, except a new
  /// model that was removed again because the workflow that needed it failed.
  ///
  /// It is empty when the sync stopped before comparing the server's list
  /// with the device, for example when [status] is [SyncStatus.offline].
  final List<SyncResourceResult> resources;
}

/// Status indicating the outcome of SDK initialization.
enum InitializationStatus {
  /// The SDK was successfully initialized with valid configuration.
  ready,

  /// One or more required configuration parameters are missing or invalid.
  incompleteConfiguration,

  /// An unexpected error occurred during initialization.
  error,

  /// The SDK is running on a platform other than Android or iOS.
  unsupportedPlatform,
}

/// Configuration required to initialize the Ayni SDK.
///
/// Pass it to [AyniSdk.initialize], which checks [isValid] before creating
/// the shared [AyniSdk.instance]. Its [toString] never shows the credential.
class AyniConfig {
  /// Creates an SDK configuration instance.
  ///
  /// [serverUrl], [credential], and [storageDirectory] are required.
  /// [syncTimeout] defaults to 30 seconds and [allowInsecureLoopback] to
  /// `false`; the [onProgress] callback is optional.
  /// The constructor never throws: [AyniSdk.initialize] reports an invalid
  /// configuration.
  AyniConfig({
    required this.serverUrl,
    required this.credential,
    required this.storageDirectory,
    this.syncTimeout = const Duration(seconds: 30),
    this.allowInsecureLoopback = false,
    this.onProgress,
  });

  /// The server URL for the Ayni API (must use HTTPS, or HTTP for loopback
  /// when [allowInsecureLoopback] is true).
  ///
  /// A URL without a host, or with any scheme other than `https` outside that
  /// loopback case, makes the configuration invalid.
  final Uri serverUrl;

  /// The SDK secret credential (`ayni_sk_...`).
  ///
  /// A blank credential makes the configuration invalid. Read it at runtime,
  /// for example from secure storage; never hard-code it.
  final String credential;

  /// Directory where the SDK stores workflows, models, and sync inventory.
  ///
  /// A directory with a blank path makes the configuration invalid.
  final Directory storageDirectory;

  /// Maximum duration for a sync operation. Defaults to 30 seconds.
  ///
  /// It must be positive; see [AyniSdk.syncTimeout] for what happens when it
  /// elapses.
  final Duration syncTimeout;

  /// Whether insecure HTTP is permitted for local loopback development.
  ///
  /// Defaults to `false`. When `true`, [serverUrl] may use `http` only for
  /// `localhost` or a loopback address.
  final bool allowInsecureLoopback;

  /// Optional callback to receive human-readable progress messages.
  ///
  /// See [AyniSdk.onProgress].
  final void Function(String message)? onProgress;

  /// Whether this configuration is complete and valid for SDK initialization.
  ///
  /// It is `true` when [credential] and the [storageDirectory] path are not
  /// blank, [syncTimeout] is positive, and [serverUrl] can receive the
  /// credential.
  bool get isValid =>
      credential.trim().isNotEmpty &&
      storageDirectory.path.trim().isNotEmpty &&
      syncTimeout > Duration.zero &&
      AyniSdk._canSendCredentialTo(
        serverUrl,
        allowInsecureLoopback: allowInsecureLoopback,
      );

  @override
  String toString() =>
      'AyniConfig('
      'serverUrl: $serverUrl, '
      'credential: [REDACTED], '
      'storageDirectory: ${storageDirectory.path}, '
      'syncTimeout: $syncTimeout, '
      'allowInsecureLoopback: $allowInsecureLoopback'
      ')';
}

/// Alias for [AyniConfig].
typedef AyniSdkConfig = AyniConfig;

/// The result of an SDK initialization attempt.
class AyniInitializationResult {
  /// Creates an initialization result.
  const AyniInitializationResult({
    required this.status,
    required this.message,
    this.sdk,
  }) : isSuccess = status == InitializationStatus.ready;

  /// The status of the initialization attempt.
  final InitializationStatus status;

  /// Human-readable message describing the initialization outcome.
  ///
  /// It is `SDK listo.` for [InitializationStatus.ready],
  /// `Revisa la configuración del SDK antes de continuar.` for
  /// [InitializationStatus.incompleteConfiguration] and
  /// [InitializationStatus.error], and
  /// `Esta plataforma no es compatible con ayni_sdk.` for
  /// [InitializationStatus.unsupportedPlatform].
  final String message;

  /// Whether initialization was successful and the SDK is ready for use.
  final bool isSuccess;

  /// Whether initialization was successful and the SDK is ready for use.
  bool get isReady => isSuccess;

  /// The initialized [AyniSdk] instance, or `null` if initialization failed.
  final AyniSdk? sdk;

  @override
  String toString() =>
      'AyniInitializationResult('
      'status: $status, '
      'message: $message, '
      'isSuccess: $isSuccess, '
      'sdk: ${sdk != null ? 'AyniSdk' : 'null'}'
      ')';
}

/// Alias for [AyniInitializationResult].
typedef InitializationResult = AyniInitializationResult;

/// Manages synchronization and offline execution of workflows.
///
/// Create the client with [initialize], which validates an [AyniConfig] and
/// keeps the shared [instance], or with the constructor. Then call [sync] to
/// install the application's published workflows and their models, and [run]
/// to execute an installed workflow on the device, even without a network
/// connection.
///
/// ```dart
/// final result = AyniSdk.initialize(
///   AyniConfig(
///     serverUrl: Uri.parse('https://tu-servidor-ayni.example'),
///     credential: credential,
///     storageDirectory: storageDirectory,
///   ),
/// );
/// if (!result.isReady) {
///   showMessage(result.message);
///   return null;
/// }
/// return AyniSdk.instance;
/// ```
class AyniSdk {
  /// Creates a new [AyniSdk] instance directly.
  ///
  /// [serverUrl], [credential], and [storageDirectory] are required and mean
  /// the same as in [AyniConfig]. [syncTimeout] defaults to 30 seconds and
  /// [allowInsecureLoopback] to `false`.
  ///
  /// Unlike [initialize], the constructor does not validate its arguments and
  /// does not set [instance]: a [serverUrl] that cannot receive the credential
  /// makes every [sync] return [SyncStatus.error].
  ///
  /// Every parameter is part of the US-090 public contract: it references only
  /// types exported by `package:ayni_sdk/ayni_sdk.dart`.
  AyniSdk({
    required this.serverUrl,
    required String credential,
    required this.storageDirectory,
    this.syncTimeout = const Duration(seconds: 30),
    this.allowInsecureLoopback = false,
    this.onProgress,
  }) : _credential = credential;

  /// The workflow schema versions supported by this SDK release (US-098).
  ///
  /// A workflow declaring a schema version outside this set will not be
  /// installed or executed.
  static const supportedWorkflowSchemaVersions =
      WorkflowDefinitionValidator.supportedSchemaVersions;

  static AyniSdk? _instance;

  /// Returns the shared [AyniSdk] instance configured by [initialize].
  ///
  /// Throws a [StateError] if the SDK has not been initialized.
  static AyniSdk get instance {
    final current = _instance;
    if (current == null) {
      throw StateError(
        'AyniSdk no está inicializado. Llama a AyniSdk.initialize primero.',
      );
    }
    return current;
  }

  /// Whether the SDK has been successfully initialized.
  static bool get isInitialized => _instance != null;

  /// Resets the shared SDK singleton for testing.
  ///
  /// Afterwards [isInitialized] is `false` and [instance] throws until the
  /// next successful [initialize].
  static void resetForTesting() {
    _instance = null;
    platform.resetPlatformForTesting();
  }

  static const Object _unsetPlatformOverride = Object();

  /// Sets platform configuration overrides for testing.
  static void setPlatformForTesting({
    int? androidSdkVersion,
    Object? iosMajorVersion = _unsetPlatformOverride,
    bool? isAndroid,
    bool? isIos,
    bool? isWeb,
  }) {
    platform.setPlatformOverrideForTesting(
      androidSdkVersion: androidSdkVersion,
      iosMajorVersion: iosMajorVersion,
      isAndroid: isAndroid,
      isIos: isIos,
      isWeb: isWeb,
    );
  }

  /// Initializes the shared [AyniSdk] singleton with the provided [config].
  ///
  /// Validates mandatory configuration parameters ([AyniConfig.credential],
  /// [AyniConfig.serverUrl], and [AyniConfig.storageDirectory]).
  /// Returns an [AyniInitializationResult] indicating whether initialization
  /// succeeded.
  ///
  /// Does not initiate network operations or model inference.
  /// If initialization fails, no operative SDK instance is retained.
  /// On an unsupported platform, it returns
  /// [InitializationStatus.unsupportedPlatform] with
  /// `Esta plataforma no es compatible con ayni_sdk.`. On an Android device
  /// that does not meet the minimum version requirement (API 26), it returns
  /// [InitializationStatus.unsupportedPlatform] with
  /// `Este dispositivo Android no cumple el requisito mínimo del SDK.`. On an
  /// iOS device that does not meet the minimum version requirement (iOS 11.0),
  /// it returns [InitializationStatus.unsupportedPlatform] with
  /// `Este dispositivo iOS no cumple el requisito mínimo del SDK.`.
  /// In either unsupported case, it returns before checking the configuration.
  /// On a supported platform, an invalid configuration ([AyniConfig.isValid]
  /// is `false`) returns [InitializationStatus.incompleteConfiguration]; an
  /// unexpected failure returns [InitializationStatus.error]. In all failure
  /// cases, [AyniInitializationResult.sdk] is `null` and [isInitialized]
  /// remains `false`.
  ///
  /// It never throws.
  ///
  /// ```dart
  /// final result = AyniSdk.initialize(
  ///   AyniConfig(
  ///     serverUrl: Uri.parse('https://tu-servidor-ayni.example'),
  ///     credential: credential,
  ///     storageDirectory: storageDirectory,
  ///   ),
  /// );
  /// if (!result.isReady) {
  ///   showMessage(result.message);
  ///   return null;
  /// }
  /// return AyniSdk.instance;
  /// ```
  static AyniInitializationResult initialize(AyniConfig config) {
    try {
      if (platform.isUnsupportedAndroid) {
        _instance = null;
        return const AyniInitializationResult(
          status: InitializationStatus.unsupportedPlatform,
          message:
              'Este dispositivo Android no cumple el requisito mínimo del SDK.',
        );
      }
      if (platform.isUnsupportedIos) {
        _instance = null;
        return const AyniInitializationResult(
          status: InitializationStatus.unsupportedPlatform,
          message:
              'Este dispositivo iOS no cumple el requisito mínimo del SDK.',
        );
      }
      if (!platform.isSupported) {
        _instance = null;
        return const AyniInitializationResult(
          status: InitializationStatus.unsupportedPlatform,
          message: 'Esta plataforma no es compatible con ayni_sdk.',
        );
      }
      if (!config.isValid) {
        _instance = null;
        return AyniInitializationResult(
          status: InitializationStatus.incompleteConfiguration,
          message: 'Revisa la configuración del SDK antes de continuar.',
          sdk: null,
        );
      }
      final sdk = AyniSdk(
        serverUrl: config.serverUrl,
        credential: config.credential,
        storageDirectory: config.storageDirectory,
        syncTimeout: config.syncTimeout,
        allowInsecureLoopback: config.allowInsecureLoopback,
        onProgress: config.onProgress,
      );
      sdk._ensureInstallationId();
      _instance = sdk;
      return AyniInitializationResult(
        status: InitializationStatus.ready,
        message: 'SDK listo.',
        sdk: sdk,
      );
    } catch (_) {
      _instance = null;
      return AyniInitializationResult(
        status: InitializationStatus.error,
        message: 'Revisa la configuración del SDK antes de continuar.',
        sdk: null,
      );
    }
  }

  /// Asynchronously initializes the shared [AyniSdk] singleton with [config].
  ///
  /// Delegates to [initialize] and returns a [Future] completing with the
  /// [AyniInitializationResult].
  static Future<AyniInitializationResult> initializeAsync(
    AyniConfig config,
  ) async => initialize(config);

  /// Checks whether [url] is a permitted destination for SDK credentials.
  ///
  /// Requires HTTPS unless [allowInsecureLoopback] is true and [url] targets
  /// a loopback host.
  static bool _canSendCredentialTo(
    Uri url, {
    required bool allowInsecureLoopback,
  }) {
    if (url.host.trim().isEmpty) return false;
    return url.scheme == 'https' ||
        (allowInsecureLoopback &&
            url.scheme == 'http' &&
            _isLoopbackHost(url.host));
  }

  static bool _isLoopbackHost(String host) {
    if (host == 'localhost') return true;
    final normalized = host.startsWith('[') && host.endsWith(']')
        ? host.substring(1, host.length - 1)
        : host;
    return InternetAddress.tryParse(normalized)?.isLoopback == true;
  }

  /// The Ayni server the SDK syncs with; [sync] posts to its `/sdk/sync`
  /// path.
  ///
  /// It must use HTTPS, or HTTP to a loopback host when
  /// [allowInsecureLoopback] is `true`; otherwise [sync] returns
  /// [SyncStatus.error] without sending the credential.
  final Uri serverUrl;

  /// The directory where the SDK keeps the installed workflow definitions,
  /// models, and the sync inventory that [run] reads.
  final Directory storageDirectory;

  /// The longest a [sync] call may take. Defaults to 30 seconds.
  ///
  /// When it elapses, [sync] stops its downloads and returns a [SyncResult]
  /// with [SyncStatus.error] and no resources. The inventory keeps the
  /// versions installed before that sync, so [run] keeps using them. A later
  /// [sync] starts once the abandoned one has finished.
  final Duration syncTimeout;

  /// Whether [serverUrl] may use plain HTTP to `localhost` or a loopback
  /// address, for local development. Defaults to `false`.
  final bool allowInsecureLoopback;

  /// Runs right before the inventory is saved; it exists for the SDK's tests,
  /// which attach it through [createAyniSdkForTesting].
  Future<void> Function()? _onBeforeInventoryPersist;

  /// Reports SDK activity, including `Descargando workflow <nombre>…`.
  ///
  /// Other messages include `Descargando modelos para <nombre>…` during
  /// [sync] and `Usando recursos guardados en este dispositivo.` during [run].
  final void Function(String message)? onProgress;

  /// Installation identity used only by policy-enabled diagnostic traces.
  String? _installationId;

  String _ensureInstallationId() =>
      _installationId ??= InstallationIdStore(storageDirectory).loadOrCreate();

  Future<DeviceProfile>? _deviceProfileFuture;
  DeviceProfile? _deviceProfile;

  /// Reads the allowlisted device and operating-system profile on this device.
  ///
  /// The profile stays in memory and is cached for this [AyniSdk] instance.
  /// This method does not send a request or write to [storageDirectory].
  /// Fields unavailable on the current platform are omitted. It never includes
  /// device names, serial numbers, build identifiers, vendor IDs or plugin-wide
  /// device data.
  Future<DeviceProfile> getDeviceProfile() =>
      _deviceProfileFuture ??= () async {
        final profile = await device_profile_reader.readDeviceProfile();
        _deviceProfile = profile;
        return profile;
      }();

  /// Builds an in-memory trace for a control execution performed by the host.
  ///
  /// Returns `null` unless a valid enabled policy was cached by [sync]. The
  /// host must call this only when its applicable off-by-default capture
  /// consent is enabled. This method performs no inference or network request.
  Future<WorkflowTrace?> createClientExecutionTrace({
    required WorkflowTraceContext context,
    required String workflowId,
    required String workflowVersionId,
    required String workflowVersion,
    required DateTime timestamp,
    required int durationMs,
    Map<String, WorkflowValue> outputs = const {},
    List<TraceModel> models = const [],
    List<TraceNodeExecution> nodes = const [],
    WorkflowError? error,
  }) async {
    if (durationMs < 0 || !await _captureEnabled()) return null;
    try {
      final readProfile = await getDeviceProfile();
      final clientReportedRamRange =
          readProfile.ramRange == null && context.ramRange != null;
      final clientReportedSocModel =
          readProfile.socModel == null && context.socModel != null;
      final profile = DeviceProfile(
        platform: readProfile.platform,
        osVersion: readProfile.osVersion,
        apiLevel: readProfile.apiLevel,
        model: readProfile.model,
        ramRange: readProfile.ramRange ?? context.ramRange,
        socModel: readProfile.socModel ?? context.socModel,
      );
      return _createWorkflowTrace(
        context: context,
        workflowId: workflowId,
        workflowVersionId: workflowVersionId,
        workflowVersion: workflowVersion,
        models: models,
        profile: profile,
        timestamp: timestamp,
        durationMs: durationMs,
        nodes: nodes,
        outputs: outputs,
        error: error,
        clientReportedRamRange: clientReportedRamRange,
        clientReportedSocModel: clientReportedSocModel,
      );
    } on Object {
      return null;
    }
  }

  Future<bool> _captureEnabled() async {
    try {
      return (await _telemetryPolicy.read())?.enabled == true;
    } on Object {
      return false;
    }
  }

  Future<bool> _persistTrace(WorkflowTrace? trace, int generation) async {
    if (trace == null) return false;
    try {
      final payload = trace.toJson();
      if (utf8.encode(jsonEncode(payload)).length >
          TraceOutboxStore.maxPayloadBytes) {
        return false;
      }
      if (generation != _traceOutboxGeneration || _traceUploadsPaused) {
        return false;
      }
      await _traceOutbox.enqueue(payload);
      return true;
    } on Object {
      return false;
    }
  }

  Future<WorkflowTrace?> _traceForRun({
    required WorkflowTraceContext? context,
    required bool enabled,
    required _Workflow? workflow,
    required _Inventory? inventory,
    required DateTime timestamp,
    required int durationMs,
    required List<TraceNodeExecution> nodes,
    Map<String, WorkflowValue> outputs = const {},
    WorkflowError? error,
  }) async {
    if (!enabled || context == null || workflow == null || inventory == null) {
      return null;
    }
    try {
      final profile =
          _deviceProfile ?? const DeviceProfile(platform: 'unknown');
      final clientReportedRamRange =
          profile.ramRange == null && context.ramRange != null;
      final clientReportedSocModel =
          profile.socModel == null && context.socModel != null;
      final enrichedProfile = DeviceProfile(
        platform: profile.platform,
        osVersion: profile.osVersion,
        apiLevel: profile.apiLevel,
        model: profile.model,
        ramRange: profile.ramRange ?? context.ramRange,
        socModel: profile.socModel ?? context.socModel,
      );
      return _createWorkflowTrace(
        context: context,
        workflowId: workflow.id,
        workflowVersionId: workflow.workflowVersionId,
        workflowVersion: workflow.version,
        models: [
          for (final id
              in nodes
                  .where(
                    (node) =>
                        node.type == 'model.tflite' && node.status != 'skipped',
                  )
                  .map((node) => node.modelVersionId)
                  .whereType<String>()
                  .toSet())
            if (inventory.models[id] case final model?)
              TraceModel(
                modelVersionId: id,
                version: model.version,
                sha256: model.sha256,
              ),
        ],
        profile: enrichedProfile,
        timestamp: timestamp,
        durationMs: durationMs,
        nodes: nodes,
        outputs: outputs,
        error: error,
        clientReportedRamRange: clientReportedRamRange,
        clientReportedSocModel: clientReportedSocModel,
      );
    } on Object {
      return null;
    }
  }

  Future<WorkflowError> _errorWithExecutionTrace(
    WorkflowError error, {
    required WorkflowTraceContext? context,
    required bool enabled,
    required int generation,
    required _Workflow? workflow,
    required _Inventory? inventory,
    required DateTime timestamp,
    required int durationMs,
    required List<TraceNodeExecution> nodes,
  }) async {
    final trace = await _traceForRun(
      context: context,
      enabled: enabled,
      workflow: workflow,
      inventory: inventory,
      timestamp: timestamp,
      durationMs: durationMs,
      nodes: nodes,
      error: error,
    );
    final persisted = await _persistTrace(trace, generation);
    return error.withTrace(
      trace,
      tracePersistenceFailed: trace != null && !persisted,
    );
  }

  WorkflowTrace _createWorkflowTrace({
    required WorkflowTraceContext context,
    required String workflowId,
    required String workflowVersionId,
    required String workflowVersion,
    required List<TraceModel> models,
    required DeviceProfile profile,
    required DateTime timestamp,
    required int durationMs,
    required List<TraceNodeExecution> nodes,
    required Map<String, WorkflowValue> outputs,
    WorkflowError? error,
    bool clientReportedRamRange = false,
    bool clientReportedSocModel = false,
  }) {
    final clientFields = <String>[
      'runId',
      'repetition',
      for (final entry in context.toJson().entries)
        if (entry.key != 'runId' &&
            entry.key != 'repetition' &&
            entry.key != 'ramRange' &&
            entry.key != 'socModel' &&
            entry.key != 'measurements' &&
            entry.key != 'incidents' &&
            entry.key != 'validity')
          entry.key,
      if (clientReportedRamRange) 'ramRange',
      if (clientReportedSocModel) 'socModel',
      if (context.measurements.isNotEmpty) 'measurements',
      if (context.incidents.isNotEmpty) 'incidents',
      if (context.validity != null) 'validity',
    ];
    return createWorkflowTrace(
      traceId: createUuidV4(),
      installationId: _ensureInstallationId(),
      context: context,
      timestamp: timestamp,
      workflowId: workflowId,
      workflowVersionId: workflowVersionId,
      workflowVersion: workflowVersion,
      models: models,
      profile: profile,
      durationMs: durationMs,
      nodes: nodes,
      clientReportedFields: clientFields.toSet().toList(),
      outputs: outputs,
      error: error,
    );
  }

  final String _credential;
  final Map<String, _ActiveExecution> _activeExecutions = {};
  late final ConsentReceiptStore _consentReceipts = ConsentReceiptStore(
    storageDirectory,
  );
  late final TelemetryPolicyStore _telemetryPolicy = TelemetryPolicyStore(
    storageDirectory,
  );
  late final TraceOutboxStore _traceOutbox = TraceOutboxStore(storageDirectory);
  late final EvidenceStore _evidence = EvidenceStore(storageDirectory);
  Future<void> _consentWork = Future<void>.value();
  var _traceOutboxGeneration = 0;
  var _traceUploadsPaused = false;
  var _traceClearsInProgress = 0;

  /// Requests cancellation of an active execution.
  ///
  /// The identifier is provided to [run]'s `onExecutionStarted` callback.
  /// Cancellation takes effect before the next node begins; an in-progress
  /// model inference is allowed to finish. Throws
  /// [WorkflowErrorCategory.executionNotFound] when the execution has ended
  /// or the identifier is unknown.
  void cancelExecution(String executionId) {
    final execution = _activeExecutions[executionId];
    if (execution == null) {
      throw const WorkflowError(WorkflowErrorCategory.executionNotFound);
    }
    execution.cancelled = true;
  }

  /// Deletes pending validation traces after the host revokes that permission.
  ///
  /// Disable capture and wait for active [run] calls before calling this
  /// method. It pauses trace uploads immediately and clears the outbox before
  /// waiting for an active [sync] to finish. Passing [WorkflowTraceContext] to
  /// a later [run] resumes trace capture and uploads when the host has enabled
  /// the applicable permission again. This does not affect the separate
  /// `sdkImprovement` consent.
  Future<void> clearPendingTraces() async {
    _traceUploadsPaused = true;
    _traceClearsInProgress++;
    _traceOutboxGeneration++;
    final syncInProgress = _syncQueue;
    try {
      await _traceOutbox.clear();
      await syncInProgress;
    } finally {
      _traceClearsInProgress--;
    }
  }

  /// Deletes the evidence for datasets saved on this device (US-066).
  ///
  /// Call it when the person withdraws the consent the app passes to [run]
  /// as `evidenceConsent`: first stop passing `evidenceConsent: true` and
  /// wait for active [run] calls. It waits for the evidence the SDK is still
  /// saving and then deletes it too, so no image of a capture stays on the
  /// device. It does not affect installed workflows and models or pending
  /// traces.
  Future<void> clearPendingEvidence() => _evidence.clear();

  void _queueEvidence(
    List<WorkflowCapture> captures, {
    required Uint8List image,
    required _Workflow workflow,
    required _Inventory inventory,
    required DateTime capturedAt,
    void Function(EvidenceEvent event)? onEvidence,
  }) {
    for (final capture in captures) {
      final evidenceId = createUuidV4();
      final model = inventory.models[capture.modelVersionId];
      unawaited(
        _evidence
            .save(evidenceId, image, {
              'evidenceSchemaVersion': 1,
              'evidenceId': evidenceId,
              'capturedAt': capturedAt.toIso8601String(),
              'workflowId': workflow.id,
              'workflowVersionId': workflow.workflowVersionId,
              'workflowVersion': workflow.version,
              'captureNodeId': capture.nodeId,
              'model': {
                'modelVersionId': capture.modelVersionId,
                if (model != null) 'version': model.version,
                if (model != null) 'sha256': model.sha256,
              },
              'result': WorkflowTrace.encodeOutputs({
                'result': capture.result,
              })['result'],
            })
            .then(
              (_) {
                onProgress?.call(EvidenceEvent.evidenceQueued.message);
                onEvidence?.call(EvidenceEvent.evidenceQueued);
              },
              // The result was already returned; a capture that cannot be
              // saved is dropped without affecting it.
              onError: (Object _) {},
            ),
      );
    }
  }

  /// Replaces the installation UUID used by traces created from now on.
  ///
  /// Traces already in the local outbox keep their original UUID. This does
  /// not remove pending traces or installed workflows and models. The new ID
  /// becomes active only after it has been persisted. The returned future
  /// completes with a [FileSystemException] if storage is unavailable.
  Future<void> resetInstallationId() => Future<void>.sync(() {
    _installationId = InstallationIdStore(storageDirectory).reset();
  });

  /// Receives each downloaded or unavailable workflow definition during sync.
  ///
  /// Its type is internal, so it is deliberately not part of the US-090
  /// contract; tests attach it through [createAyniSdkForTesting].
  void Function(WorkflowVersionDownloadResult result)? _onWorkflowDownload;

  /// Fetches workflow definitions during sync; tests may replace it through
  /// [createAyniSdkForTesting].
  WorkflowVersionDownloader _workflowVersionDownloader =
      WorkflowVersionDownloader();
  WorkflowInferenceRunner? _workflowInferenceRunner;
  final WorkflowDefinitionValidator _workflowDefinitionValidator =
      WorkflowDefinitionValidator();
  Future<void> _syncQueue = Future<void>.value();

  /// Executes the last locally installed, validated version of [workflowId].
  /// [input] is the encoded image bytes (for example JPEG or PNG).
  ///
  /// It runs entirely on the device, without a network connection, and
  /// completes with a [WorkflowResult] whose [WorkflowResult.outputs] hold the
  /// value of each output node the workflow reached.
  ///
  /// It throws an [UnsupportedError] on unsupported platforms, including
  /// Android devices below API 26 or iOS devices below iOS 11.0, before
  /// workflow validation or inference.
  ///
  /// It throws a [WorkflowError] whose [WorkflowError.category] says why the
  /// workflow could not run; see [WorkflowErrorCategory] for every case.
  /// A workflow that was never synced, for example, throws
  /// [WorkflowErrorCategory.workflowNotAvailable], and an [input] that is not
  /// an image throws [WorkflowErrorCategory.invalidInput].
  ///
  /// [onExecutionStarted] receives an identifier that can be passed to
  /// [cancelExecution] while this call is active. Cancellation stops pending
  /// nodes after any currently running inference finishes.
  ///
  /// When the workflow reaches a `dataset.capture` node, the SDK creates
  /// evidence for a dataset only if [evidenceConsent] is `true`: pass it only
  /// while the person has given the consent your app requires for evidence
  /// collection. The SDK saves a copy of [input] with the captured inference
  /// result, the workflow version, and the model in [storageDirectory] after
  /// returning the result, without delaying it or failing it, and then
  /// reports [EvidenceEvent.evidenceQueued] to [onEvidence] and its message,
  /// `Evidencia guardada para envío posterior.`, to [onProgress]. Without
  /// consent (the default), it skips the capture and keeps no image.
  ///
  /// ```dart
  /// try {
  ///   final result = await sdk.run(workflowId, image);
  ///   return [
  ///     for (final MapEntry(key: name, value: value) in result.outputs.entries)
  ///       switch (value) {
  ///         ClassificationResult(:final label, :final confidence) =>
  ///           '$name: $label ($confidence)',
  ///         DetectionResult(:final detections) =>
  ///           '$name: ${detections.length} objetos',
  ///         CombinedWorkflowResult(:final values) =>
  ///           '$name: ${values.length} resultados',
  ///         BooleanResult(value: final passed) => '$name: $passed',
  ///       },
  ///   ];
  /// } on UnsupportedError catch (error) {
  ///   return ['Plataforma no admitida: ${error.message}'];
  /// } on WorkflowError catch (error) {
  ///   return ['No se pudo ejecutar el workflow: ${error.category.name}'];
  /// }
  /// ```
  Future<WorkflowResult> run(
    String workflowId,
    Uint8List input, {
    void Function(String executionId)? onExecutionStarted,
    WorkflowTraceContext? traceContext,
    bool evidenceConsent = false,
    void Function(EvidenceEvent event)? onEvidence,
  }) async {
    if (platform.isUnsupportedAndroid) {
      throw UnsupportedError(
        'Este dispositivo Android no cumple el requisito mínimo del SDK.',
      );
    }
    if (platform.isUnsupportedIos) {
      throw UnsupportedError(
        'Este dispositivo iOS no cumple el requisito mínimo del SDK.',
      );
    }
    if (!platform.isSupported) {
      throw UnsupportedError('Esta plataforma no es compatible con ayni_sdk.');
    }
    final traceGeneration = _traceOutboxGeneration;
    final startedAt = DateTime.now().toUtc();
    final stopwatch = Stopwatch()..start();
    final captureTrace =
        traceContext != null &&
        await _captureEnabled() &&
        _traceClearsInProgress == 0 &&
        traceGeneration == _traceOutboxGeneration;
    if (captureTrace) {
      _traceUploadsPaused = false;
      unawaited(
        getDeviceProfile().catchError(
          (Object _) => const DeviceProfile(platform: 'unknown'),
        ),
      );
    }
    _Workflow? workflowForTrace;
    _Inventory? inventoryForTrace;
    final traceNodes = <TraceNodeExecution>[];
    final executionId = _newExecutionId();
    final execution = _ActiveExecution();
    _activeExecutions[executionId] = execution;
    try {
      onExecutionStarted?.call(executionId);
      _throwIfCancelled(execution);
      final inventoryFile = File(
        '${storageDirectory.path}${Platform.pathSeparator}sync-inventory.json',
      );
      final inventory = await _readInventory(inventoryFile);
      inventoryForTrace = inventory;
      final workflow = inventory.workflows[workflowId];
      if (workflow == null) {
        throw const WorkflowError(WorkflowErrorCategory.workflowNotAvailable);
      }
      workflowForTrace = workflow;
      final definitionFile = installedWorkflowDefinitionFile(
        storageDirectory,
        workflow.workflowVersionId,
      );
      if (!await definitionFile.exists()) {
        throw const WorkflowError(WorkflowErrorCategory.workflowNotAvailable);
      }
      final decoded = jsonDecode(await definitionFile.readAsString());
      if (_workflowDefinitionValidator.validate(
            definition: decoded,
            declaredModelVersionIds: workflow.modelVersionIds.toSet(),
          ) !=
          WorkflowValidationStatus.valid) {
        throw const WorkflowError(WorkflowErrorCategory.invalidWorkflow);
      }
      final executor = _createWorkflowExecutorForRun();
      await executor.validateInputAndContracts(
        decoded as Map<String, dynamic>,
        input,
      );
      _throwIfCancelled(execution);
      final requiredModelVersionIds = WorkflowExecutor.requiredModelVersionIds(
        decoded,
      );
      final installer = ModelArtifactInstaller(
        storageDirectory: storageDirectory,
      );
      for (final modelVersionId in workflow.modelVersionIds) {
        _throwIfCancelled(execution);
        if (requiredModelVersionIds.contains(modelVersionId) &&
            !await installer.isVersionAvailable(
              modelId: modelVersionId,
              modelVersionId: modelVersionId,
            )) {
          throw WorkflowError(
            WorkflowErrorCategory.modelNotAvailable,
            modelVersionId: modelVersionId,
          );
        }
      }
      onProgress?.call('Usando recursos guardados en este dispositivo.');
      final captures = <WorkflowCapture>[];
      final result = await executor.execute(
        executionId: executionId,
        workflowId: workflowId,
        workflowVersion: workflow.version,
        definition: decoded,
        imageBytes: input,
        isCancelled: () => execution.cancelled,
        onNodeFinished: captureTrace ? traceNodes.add : null,
        // Without consent the SDK does not even note a capture (US-066).
        onCapture: evidenceConsent ? captures.add : null,
      );
      _throwIfCancelled(execution);
      stopwatch.stop();
      final trace = await _traceForRun(
        context: traceContext,
        enabled: captureTrace,
        workflow: workflowForTrace,
        inventory: inventoryForTrace,
        timestamp: startedAt,
        durationMs: stopwatch.elapsedMilliseconds,
        nodes: traceNodes,
        outputs: result.outputs,
      );
      final persisted = await _persistTrace(trace, traceGeneration);
      if (captures.isNotEmpty) {
        _queueEvidence(
          captures,
          // A copy: the app may reuse its buffer once the result arrives.
          image: Uint8List.fromList(input),
          workflow: workflow,
          inventory: inventory,
          capturedAt: startedAt,
          onEvidence: onEvidence,
        );
      }
      return result.withTrace(
        trace,
        tracePersistenceFailed: trace != null && !persisted,
      );
    } on WorkflowError catch (error) {
      stopwatch.stop();
      throw await _errorWithExecutionTrace(
        error,
        context: traceContext,
        enabled: captureTrace,
        generation: traceGeneration,
        workflow: workflowForTrace,
        inventory: inventoryForTrace,
        timestamp: startedAt,
        durationMs: stopwatch.elapsedMilliseconds,
        nodes: traceNodes,
      );
    } on UnsupportedError {
      rethrow;
    } on FormatException {
      stopwatch.stop();
      final error = const WorkflowError(WorkflowErrorCategory.invalidWorkflow);
      throw await _errorWithExecutionTrace(
        error,
        context: traceContext,
        enabled: captureTrace,
        generation: traceGeneration,
        workflow: workflowForTrace,
        inventory: inventoryForTrace,
        timestamp: startedAt,
        durationMs: stopwatch.elapsedMilliseconds,
        nodes: traceNodes,
      );
    } on FileSystemException {
      stopwatch.stop();
      final error = const WorkflowError(
        WorkflowErrorCategory.workflowNotAvailable,
      );
      throw await _errorWithExecutionTrace(
        error,
        context: traceContext,
        enabled: captureTrace,
        generation: traceGeneration,
        workflow: workflowForTrace,
        inventory: inventoryForTrace,
        timestamp: startedAt,
        durationMs: stopwatch.elapsedMilliseconds,
        nodes: traceNodes,
      );
    } catch (_) {
      stopwatch.stop();
      final error = const WorkflowError(WorkflowErrorCategory.runtimeError);
      throw await _errorWithExecutionTrace(
        error,
        context: traceContext,
        enabled: captureTrace,
        generation: traceGeneration,
        workflow: workflowForTrace,
        inventory: inventoryForTrace,
        timestamp: startedAt,
        durationMs: stopwatch.elapsedMilliseconds,
        nodes: traceNodes,
      );
    } finally {
      _activeExecutions.remove(executionId);
    }
  }

  static String _newExecutionId() {
    final random = Random.secure();
    return List.generate(
      4,
      (_) => random.nextInt(1 << 32).toRadixString(16).padLeft(8, '0'),
    ).join();
  }

  static void _throwIfCancelled(_ActiveExecution execution) {
    if (execution.cancelled) {
      throw const WorkflowError(WorkflowErrorCategory.cancelled);
    }
  }

  WorkflowExecutor _createWorkflowExecutorForRun() => WorkflowExecutor(
    storageDirectory,
    inferenceRunner: _workflowInferenceRunner,
  );

  /// Downloads and installs the workflow versions published for the
  /// credential's application, with the models they need.
  ///
  /// The SDK sends the credential to [serverUrl], compares the published
  /// versions with the ones installed in [storageDirectory], and downloads,
  /// validates, and installs only what changed. A rejected update never
  /// replaces a valid installed version.
  ///
  /// Network, server, and storage failures do not throw: the returned
  /// [SyncResult] reports the overall [SyncStatus] and the outcome of each
  /// resource in [SyncResult.resources]. It returns [SyncStatus.error] when
  /// [syncTimeout] elapses, and [SyncStatus.offline] when the server cannot
  /// be reached.
  ///
  /// Calls never overlap: a call made while another sync is running starts
  /// when the previous one finishes.
  ///
  /// ```dart
  /// final result = await sdk.sync();
  /// switch (result.status) {
  ///   case SyncStatus.offline:
  ///     showMessage('Sin conexión. Se usarán los workflows instalados.');
  ///   case SyncStatus.error:
  ///     showMessage(
  ///       result.resources.isNotEmpty
  ///           ? 'La sincronización terminó con errores. Revisa cada recurso.'
  ///           : 'La sincronización terminó con errores.',
  ///     );
  ///   case SyncStatus.updated:
  ///   case SyncStatus.upToDate:
  ///     break;
  /// }
  /// for (final resource in result.resources) {
  ///   switch (resource.status) {
  ///     case SyncResourceStatus.updated:
  ///       showMessage('Recurso actualizado.');
  ///     case SyncResourceStatus.upToDate:
  ///       showMessage('El recurso ya está actualizado.');
  ///     case SyncResourceStatus.invalidRemoteResource:
  ///     case SyncResourceStatus.invalidWorkflow:
  ///     case SyncResourceStatus.unsupportedWorkflowVersion:
  ///     case SyncResourceStatus.installationFailed:
  ///     case SyncResourceStatus.dependencyFailed:
  ///     case SyncResourceStatus.workflowUnavailable:
  ///       showMessage(resource.message ?? 'No se pudo actualizar un recurso.');
  ///   }
  /// }
  /// ```
  Future<SyncResult> sync() {
    final previousSync = _syncQueue;
    final syncFinished = Completer<void>();
    _syncQueue = syncFinished.future;
    return _syncAfter(previousSync, syncFinished);
  }

  /// Records one user's explicit choice for one optional Ayni-owned purpose.
  ///
  /// The integrator creates and retains a random UUID v4 for each user within
  /// this application. Do not pass a name, e-mail, phone number, or a hash of
  /// direct identifiers. The receipt is saved locally before the SDK attempts
  /// to send it; offline receipts are sent before the next sync manifest.
  ///
  /// The host app must show the relevant notice and an off-by-default control
  /// before calling this method. Ayni does not provide the host app's switch.
  Future<ConsentResult> recordConsent({
    required String subjectId,
    required ConsentPurpose purpose,
    required ConsentDecision decision,
    required String noticeVersion,
  }) {
    if (!isUuidV4(subjectId)) {
      throw ArgumentError.value(
        subjectId,
        'subjectId',
        'Debe ser un UUID v4 opaco y aleatorio.',
      );
    }
    final version = noticeVersion.trim();
    if (version.isEmpty || version.length > 128) {
      throw ArgumentError.value(
        noticeVersion,
        'noticeVersion',
        'Debe identificar el aviso mostrado.',
      );
    }
    Future<void>? receiptWork;
    return _serializeConsentWork(() async {
      final receipt = ConsentReceipt(
        receiptId: _newConsentReceiptId(),
        subjectId: subjectId,
        purpose: purpose,
        decision: decision,
        noticeVersion: version,
        decidedAt: DateTime.now().toUtc(),
      );
      try {
        await _consentReceipts.enqueue(receipt);
      } on FileSystemException {
        return const ConsentResult(ConsentStatus.error);
      } on FormatException {
        return const ConsentResult(ConsentStatus.error);
      }

      final client = HttpClient()..connectionTimeout = syncTimeout;
      try {
        if (!_canSendCredentialTo(
          serverUrl,
          allowInsecureLoopback: allowInsecureLoopback,
        )) {
          return const ConsentResult(ConsentStatus.pending);
        }
        if (serverUrl.scheme == 'http') client.findProxy = (_) => 'DIRECT';
        final pendingWork = _syncConsentReceipts(client);
        receiptWork = pendingWork.then<void>(
          (_) {},
          onError: (Object _, StackTrace __) {},
        );
        final synced = await pendingWork.timeout(
          syncTimeout,
          onTimeout: () {
            client.close(force: true);
            return false;
          },
        );
        return synced
            ? const ConsentResult(ConsentStatus.synced)
            : const ConsentResult(ConsentStatus.pending);
      } on SocketException {
        return const ConsentResult(ConsentStatus.pending);
      } on IOException {
        return const ConsentResult(ConsentStatus.pending);
      } on TimeoutException {
        return const ConsentResult(ConsentStatus.pending);
      } on FormatException {
        return const ConsentResult(ConsentStatus.pending);
      } finally {
        client.close(force: true);
      }
    }, waitUntilComplete: () => receiptWork ?? Future<void>.value());
  }

  String _newConsentReceiptId() => createUuidV4();

  Future<T> _serializeConsentWork<T>(
    Future<T> Function() operation, {
    Future<void> Function()? waitUntilComplete,
  }) {
    final previous = _consentWork;
    final result = previous.then((_) => operation());
    Future<void> waitForUnderlyingWork() async {
      try {
        await waitUntilComplete?.call();
      } catch (_) {}
    }

    final held = result.then<void>(
      (_) => waitForUnderlyingWork(),
      onError: (Object _, StackTrace __) => waitForUnderlyingWork(),
    );
    _consentWork = held.then<void>(
      (_) {},
      onError: (Object _, StackTrace __) {},
    );
    return result;
  }

  Future<bool> _syncConsentReceipts(
    HttpClient client, {
    _SyncDeadline? deadline,
  }) async {
    for (final receipt in await _consentReceipts.pending()) {
      if (deadline?.expired ?? false) return false;
      final request = await client.postUrl(serverUrl.resolve('/sdk/consents'));
      request.followRedirects = false;
      request.headers
        ..set(HttpHeaders.authorizationHeader, 'Bearer $_credential')
        ..contentType = ContentType.json;
      request.write(jsonEncode(receipt.toJson()));
      final response = await request.close().timeout(
        _optionalRequestAttemptTimeout,
        onTimeout: () {
          request.abort();
          throw TimeoutException('Consent receipt request timed out');
        },
      );
      final body = await utf8.decoder
          .bind(response)
          .join()
          .timeout(
            _optionalRequestAttemptTimeout,
            onTimeout: () {
              request.abort();
              throw TimeoutException('Consent receipt response timed out');
            },
          );
      if (response.statusCode != HttpStatus.created) return false;
      final decoded = jsonDecode(body);
      if (decoded is! Map ||
          decoded['receiptId'] != receipt.receiptId ||
          decoded['receivedAt'] is! String ||
          DateTime.tryParse(decoded['receivedAt'] as String) == null) {
        return false;
      }
      await _consentReceipts.remove(receipt.receiptId);
    }
    return true;
  }

  Future<bool> _sendPendingTraces(
    HttpClient client, {
    _SyncDeadline? deadline,
  }) async {
    final budget =
        deadline?.traceUploadBudget ?? _optionalRequestAttemptTimeout;
    if (budget <= Duration.zero) return false;

    // ponytail: cap by this reserve; tune it for throughput while preserving required sync.
    final stopwatch = Stopwatch()..start();
    final generation = _traceOutboxGeneration;
    Duration remainingBudget() => budget - stopwatch.elapsed;
    await for (final trace in _traceOutbox.pendingStream()) {
      if (_traceUploadsPaused || generation != _traceOutboxGeneration) {
        return false;
      }
      if (remainingBudget() <= Duration.zero) return false;
      final payload = jsonEncode(trace);
      if (utf8.encode(payload).length > TraceOutboxStore.maxPayloadBytes) {
        continue;
      }
      final policy = await _refreshTelemetryPolicy(
        client,
        timeout: remainingBudget,
      );
      if (policy?.enabled != true ||
          _traceUploadsPaused ||
          generation != _traceOutboxGeneration) {
        return false;
      }

      final traceId = trace['traceId'];
      if (traceId is! String) continue;
      final request = await client.postUrl(serverUrl.resolve('/sdk/traces'));
      if (_traceUploadsPaused || generation != _traceOutboxGeneration) {
        request.abort();
        return false;
      }
      request.followRedirects = false;
      request.headers
        ..set(HttpHeaders.authorizationHeader, 'Bearer $_credential')
        ..contentType = ContentType.json;
      request.write(payload);
      final requestTimeout = remainingBudget();
      if (requestTimeout <= Duration.zero) {
        request.abort();
        return false;
      }
      final response = await request.close().timeout(
        requestTimeout,
        onTimeout: () {
          request.abort();
          throw TimeoutException('Workflow trace request timed out');
        },
      );
      final responseTimeout = remainingBudget();
      if (responseTimeout <= Duration.zero) return false;
      final body = await utf8.decoder
          .bind(response)
          .join()
          .timeout(
            responseTimeout,
            onTimeout: () {
              request.abort();
              throw TimeoutException('Workflow trace response timed out');
            },
          );

      if (response.statusCode == HttpStatus.created) {
        Object? decoded;
        try {
          decoded = jsonDecode(body);
        } on FormatException {
          return false;
        }
        if (decoded is Map &&
            decoded['traceId'] == traceId &&
            decoded['receivedAt'] is String &&
            DateTime.tryParse(decoded['receivedAt'] as String) != null) {
          await _traceOutbox.remove(traceId);
          continue;
        }
        return false;
      }
      if (![
        HttpStatus.badRequest,
        HttpStatus.conflict,
        HttpStatus.requestEntityTooLarge,
      ].contains(response.statusCode)) {
        return false;
      }
    }
    return true;
  }

  Future<TelemetryPolicy?> _refreshTelemetryPolicy(
    HttpClient client, {
    Duration Function()? timeout,
  }) async {
    final request = await client.getUrl(
      serverUrl.resolve('/sdk/telemetry-policy'),
    );
    request.followRedirects = false;
    request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $_credential');
    final requestTimeout = timeout?.call() ?? _optionalRequestAttemptTimeout;
    if (requestTimeout <= Duration.zero) {
      request.abort();
      return null;
    }
    final response = await request.close().timeout(
      requestTimeout,
      onTimeout: () {
        request.abort();
        throw TimeoutException('Telemetry policy request timed out');
      },
    );
    final responseTimeout = timeout?.call() ?? _optionalRequestAttemptTimeout;
    if (responseTimeout <= Duration.zero) return null;
    final body = await utf8.decoder
        .bind(response)
        .join()
        .timeout(
          responseTimeout,
          onTimeout: () {
            request.abort();
            throw TimeoutException('Telemetry policy response timed out');
          },
        );
    if (response.statusCode != HttpStatus.ok) return null;
    final policy = TelemetryPolicy.fromJson(jsonDecode(body));
    if (policy == null) return null;
    await _telemetryPolicy.write(policy);
    return policy;
  }

  Duration get _optionalRequestAttemptTimeout {
    final share = syncTimeout ~/ 3;
    if (share <= Duration.zero) return const Duration(microseconds: 1);
    return share > const Duration(seconds: 3)
        ? const Duration(seconds: 3)
        : share;
  }

  Future<SyncResult> _syncAfter(
    Future<void> previousSync,
    Completer<void> syncFinished,
  ) async {
    await previousSync;
    final client = HttpClient();
    final deadline = _SyncDeadline(syncTimeout);
    var timedOut = false;
    try {
      if (!_canSendCredentialTo(
        serverUrl,
        allowInsecureLoopback: allowInsecureLoopback,
      )) {
        return const SyncResult(SyncStatus.error);
      }
      if (serverUrl.scheme == 'http') client.findProxy = (_) => 'DIRECT';
      final operation = _serializeConsentWork(() => _sync(client, deadline));
      return await operation.timeout(
        syncTimeout,
        onTimeout: () {
          timedOut = true;
          deadline.expire();
          client.close(force: true);
          unawaited(
            operation
                .then<void>((_) {}, onError: (Object _, StackTrace __) {})
                .whenComplete(() {
                  if (!syncFinished.isCompleted) syncFinished.complete();
                }),
          );
          return const SyncResult(SyncStatus.error);
        },
      );
    } on TimeoutException {
      return const SyncResult(SyncStatus.error);
    } on SocketException {
      return const SyncResult(SyncStatus.offline);
    } on FileSystemException {
      return const SyncResult(SyncStatus.error);
    } on IOException {
      return const SyncResult(SyncStatus.error);
    } on FormatException {
      return const SyncResult(SyncStatus.error);
    } finally {
      client.close(force: true);
      if (!timedOut && !syncFinished.isCompleted) syncFinished.complete();
    }
  }

  Future<SyncResult> _sync(HttpClient client, _SyncDeadline deadline) async {
    try {
      await _refreshTelemetryPolicy(client);
    } on Exception {
      // Policy refresh is optional; a failed refresh keeps the last valid cache.
    }
    try {
      await _syncConsentReceipts(client, deadline: deadline);
    } on Exception {
      // A pending optional-use receipt must not block required resource sync.
      // Validation traces use a separate host-managed permission.
    }
    try {
      await _sendPendingTraces(client, deadline: deadline);
    } on Exception {
      // A failed optional upload keeps traces local.
    }
    if (deadline.expired) return const SyncResult(SyncStatus.error);
    final request = await client.postUrl(serverUrl.resolve('/sdk/sync'));
    request.followRedirects = false;
    request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $_credential');
    final response = await request.close();
    final body = await utf8.decoder.bind(response).join();
    if (response.statusCode < 200 || response.statusCode >= 300) {
      return const SyncResult(SyncStatus.error);
    }

    final decoded = jsonDecode(body);
    if (!_isInventory(decoded)) {
      return _isAuthenticationAcknowledgement(decoded)
          ? const SyncResult(SyncStatus.upToDate)
          : const SyncResult(SyncStatus.error);
    }
    if (deadline.expired) return const SyncResult(SyncStatus.error);

    final inventoryFile = File(
      '${storageDirectory.path}${Platform.pathSeparator}sync-inventory.json',
    );
    final local = await _readInventory(inventoryFile);
    final comparison = _compareInventories(local, decoded as Map);
    final installation = await _installDownloadedWorkflowVersions(
      local,
      comparison,
      inventoryFile,
      client,
      deadline,
    );
    if (installation == null) return const SyncResult(SyncStatus.error);
    // Validation may roll every update candidate back to the local state;
    // `updated` is reported only when something actually changed (US-042).
    final changed = installation.resources.any(
      (resource) => resource.status == SyncResourceStatus.updated,
    );
    final resourceFailed = installation.resources.any(
      (resource) =>
          resource.status == SyncResourceStatus.invalidRemoteResource ||
          resource.status == SyncResourceStatus.installationFailed ||
          resource.status == SyncResourceStatus.dependencyFailed ||
          resource.status == SyncResourceStatus.workflowUnavailable,
    );
    if (!changed) {
      return SyncResult(
        resourceFailed ? SyncStatus.error : SyncStatus.upToDate,
        installation.resources,
      );
    }
    final persisted = await _persistInventory(
      inventoryFile,
      installation.inventory,
      deadline,
    );
    if (!persisted) {
      // The inventory still names the previous versions, so no definition
      // promoted by this run may stay installed without one.
      for (final file in installation.promotedFiles) {
        await _deleteDownloadedDefinition(file);
      }
      for (final file in installation.installedModelFiles) {
        await _deleteDownloadedDefinition(file);
      }
    }
    return persisted
        ? SyncResult(
            resourceFailed ? SyncStatus.error : SyncStatus.updated,
            installation.resources,
          )
        : const SyncResult(SyncStatus.error);
  }

  Future<_Installation?> _installDownloadedWorkflowVersions(
    _Inventory local,
    _Comparison comparison,
    File inventoryFile,
    HttpClient client,
    _SyncDeadline deadline,
  ) async {
    final localVersionIds = await _localWorkflowVersionIds(inventoryFile);
    final workflows = Map<String, _Workflow>.of(comparison.inventory.workflows);
    final models = Map<String, _Model>.of(comparison.inventory.models);
    final rejections = <_WorkflowRejection>[];
    final promotedFiles = <File>[];
    final installedModelFiles = <File>[];
    final installedModelVersionIds = <String>[];
    final rolledBackModelVersionIds = <String>{};
    Future<_Installation?> abort([File? pendingFile]) async {
      if (pendingFile != null) await _deleteDownloadedDefinition(pendingFile);
      for (final file in [...promotedFiles, ...installedModelFiles]) {
        await _deleteDownloadedDefinition(file);
      }
      return null;
    }

    Future<void> rollbackModelsSince(
      int fileStart,
      int versionStart, {
      String? failedDependencyId,
    }) async {
      for (final file in installedModelFiles.skip(fileStart)) {
        await _deleteDownloadedDefinition(file);
      }
      installedModelFiles.removeRange(fileStart, installedModelFiles.length);
      final versionIdsToRollback = {
        ...installedModelVersionIds.skip(versionStart),
        if (failedDependencyId != null) failedDependencyId,
      };
      for (final versionId in versionIdsToRollback) {
        rolledBackModelVersionIds.add(versionId);
        final previous = local.models[versionId];
        if (previous == null) {
          models.remove(versionId);
        } else {
          models[versionId] = previous;
        }
      }
      installedModelVersionIds.removeRange(
        versionStart,
        installedModelVersionIds.length,
      );
    }

    for (final workflow in comparison.acceptedWorkflows) {
      if (deadline.expired) return abort();
      if (localVersionIds.contains(workflow.workflowVersionId)) continue;

      // Two phases per download: the downloader streams into an isolated
      // `<installed>.part` attempt file; only after validation the file is
      // renamed (promoted) to the installed path. A rejected definition is
      // deleted and never occupies the installed path.
      final installedFile = installedWorkflowDefinitionFile(
        storageDirectory,
        workflow.workflowVersionId,
      );
      final WorkflowVersionDownloadResult result;
      try {
        result = await _workflowVersionDownloader.download(
          serverUrl: serverUrl,
          credential: _credential,
          workflowVersionId: workflow.workflowVersionId,
          workflowName: workflow.name,
          temporaryDefinition: installedFile,
          allowInsecureLoopback: allowInsecureLoopback,
          onProgress: onProgress,
          httpClient: client,
        );
      } catch (_) {
        return abort();
      }
      try {
        _onWorkflowDownload?.call(result);
      } catch (_) {
        return abort(
          result.temporaryDefinition == null
              ? null
              : File(result.temporaryDefinition!),
        );
      }
      if (result.status != WorkflowVersionDownloadStatus.downloaded) {
        await _rejectWorkflow(
          workflow,
          result.temporaryDefinition == null
              ? null
              : File(result.temporaryDefinition!),
          local,
          workflows,
          rejections,
          unavailable: true,
        );
        continue;
      }
      final downloadedFile = File(result.temporaryDefinition!);
      if (deadline.expired) {
        return abort(downloadedFile);
      }
      final validation = await _validateDownloadedDefinition(
        downloadedFile,
        workflow.modelVersionIds,
      );
      if (validation == WorkflowValidationStatus.valid) {
        final installedModelFileCount = installedModelFiles.length;
        final installedModelVersionCount = installedModelVersionIds.length;
        var failedDependency = 'modelo desconocido';
        String? failedDependencyId;
        final depsOk = await _installModelDependencies(
          workflow,
          comparison.inventory.models,
          client,
          deadline,
          (name) {
            failedDependency = name;
            failedDependencyId = name;
          },
          installedModelFiles,
          installedModelVersionIds,
        );
        if (!depsOk) {
          await rollbackModelsSince(
            installedModelFileCount,
            installedModelVersionCount,
            failedDependencyId: failedDependencyId,
          );
          await _rejectWorkflow(
            workflow,
            downloadedFile,
            local,
            workflows,
            rejections,
            dependencyFailed: true,
            dependencyName: failedDependency,
          );
          continue;
        }
        for (final versionId in installedModelVersionIds.skip(
          installedModelVersionCount,
        )) {
          rolledBackModelVersionIds.remove(versionId);
          final remoteModel = comparison.inventory.models[versionId];
          if (remoteModel != null) models[versionId] = remoteModel;
        }
        if (deadline.expired) {
          return abort(downloadedFile);
        }
        try {
          await _promoteToInstalledDefinition(downloadedFile, installedFile);
          promotedFiles.add(installedFile);
        } on FileSystemException {
          await rollbackModelsSince(
            installedModelFileCount,
            installedModelVersionCount,
          );
          await _rejectWorkflow(
            workflow,
            downloadedFile,
            local,
            workflows,
            rejections,
            installationFailed: true,
          );
        }
      } else {
        await _rejectWorkflow(
          workflow,
          downloadedFile,
          local,
          workflows,
          rejections,
          unsupportedVersion:
              validation == WorkflowValidationStatus.unsupportedSchemaVersion,
        );
      }
    }
    if (deadline.expired) return abort();
    return _Installation(
      inventory: _Inventory(workflows, models),
      resources: _resourcesWithRejections(
        comparison.resources,
        rejections,
        rolledBackModelVersionIds,
        local.models,
      ),
      promotedFiles: promotedFiles,
      installedModelFiles: installedModelFiles,
    );
  }

  /// Records a workflow rejection: deletes the downloaded definition,
  /// restores the local inventory entry (if any), and adds a
  /// [_WorkflowRejection] with the appropriate status.
  Future<void> _rejectWorkflow(
    _Workflow workflow,
    File? downloadedFile,
    _Inventory local,
    Map<String, _Workflow> workflows,
    List<_WorkflowRejection> rejections, {
    bool installationFailed = false,
    bool dependencyFailed = false,
    String? dependencyName,
    bool unavailable = false,
    bool unsupportedVersion = false,
  }) async {
    if (downloadedFile != null)
      await _deleteDownloadedDefinition(downloadedFile);
    final previous = local.workflows[workflow.id];
    if (previous == null) {
      workflows.remove(workflow.id);
    } else {
      workflows[workflow.id] = previous;
    }
    rejections.add(
      _WorkflowRejection(
        workflow,
        previousVersionRetained: previous != null,
        installationFailed: installationFailed,
        dependencyFailed: dependencyFailed,
        dependencyName: dependencyName,
        unavailable: unavailable,
        unsupportedVersion: unsupportedVersion,
      ),
    );
  }

  /// Rebuilds the reported resources with each rejected workflow's optimistic
  /// `updated` entry replaced by `invalidWorkflow` (never a partial in-place
  /// edit of the comparison result).
  List<SyncResourceResult> _resourcesWithRejections(
    List<SyncResourceResult> resources,
    List<_WorkflowRejection> rejections,
    Set<String> rolledBackModelVersionIds,
    Map<String, _Model> localModels,
  ) {
    if (rejections.isEmpty && rolledBackModelVersionIds.isEmpty) {
      return resources;
    }
    final rejected = {
      for (final rejection in rejections)
        rejection.workflow.workflowVersionId: rejection,
    };
    final result = <SyncResourceResult>[];
    for (final resource in resources) {
      if (resource.type == SyncResourceType.model &&
          rolledBackModelVersionIds.contains(resource.resourceVersionId)) {
        final previous = localModels[resource.resourceVersionId];
        if (previous == null) continue;
        result.add(
          SyncResourceResult(
            type: resource.type,
            status: SyncResourceStatus.upToDate,
            resourceVersionId: resource.resourceVersionId,
            version: previous.version,
            name: resource.name,
          ),
        );
      } else if (resource.type == SyncResourceType.workflow &&
          rejected.containsKey(resource.resourceVersionId)) {
        result.add(rejected[resource.resourceVersionId]!.toResult());
      } else {
        result.add(resource);
      }
    }
    return result;
  }

  Future<void> _promoteToInstalledDefinition(
    File downloadedFile,
    File installedFile,
  ) async {
    try {
      await downloadedFile.rename(installedFile.path);
    } on FileSystemException {
      if (!await installedFile.exists()) rethrow;
      await installedFile.delete();
      await downloadedFile.rename(installedFile.path);
    }
  }

  Future<WorkflowValidationStatus> _validateDownloadedDefinition(
    File definition,
    List<String> declaredModelVersionIds,
  ) async {
    final Object? decoded;
    try {
      decoded = jsonDecode(await definition.readAsString());
    } on FormatException {
      return WorkflowValidationStatus.invalidSchema;
    }
    return _workflowDefinitionValidator.validate(
      definition: decoded,
      declaredModelVersionIds: declaredModelVersionIds.toSet(),
    );
  }

  /// Downloads and installs model versions required by a workflow that are
  /// not yet available locally (US-044). Each newly installed model file is
  /// added to the installed-file and version-id lists immediately so the
  /// caller can roll them back if a later dependency fails. Returns `false`
  /// when a dependency could not be installed.
  Future<bool> _installModelDependencies(
    _Workflow workflow,
    Map<String, _Model> models,
    HttpClient client,
    _SyncDeadline deadline,
    void Function(String name) setFailedDependency,
    List<File> installedModelFiles,
    List<String> installedModelVersionIds,
  ) async {
    final installer = ModelArtifactInstaller(
      storageDirectory: storageDirectory,
    );
    final downloader = ModelArtifactDownloader();
    final verifier = ModelArtifactIntegrityVerifier();

    for (final modelVersionId in workflow.modelVersionIds) {
      if (deadline.expired) return false;

      final available = await installer.isVersionAvailable(
        modelId: modelVersionId,
        modelVersionId: modelVersionId,
      );
      if (available) continue;

      final model = models[modelVersionId];
      if (model == null) {
        setFailedDependency(modelVersionId);
        return false;
      }

      onProgress?.call('Descargando modelos para ${workflow.name}…');

      final manifestResult = await _fetchModelManifest(modelVersionId, client);
      if (manifestResult == null) {
        setFailedDependency(modelVersionId);
        return false;
      }
      if (deadline.expired) return false;

      final temporaryArtifact = File(
        '${storageDirectory.path}${Platform.pathSeparator}'
        'model-downloads${Platform.pathSeparator}$modelVersionId.tflite',
      );
      final verifiedArtifact = File('${temporaryArtifact.path}.verified');

      final downloadResult = await downloader.download(
        manifest: manifestResult,
        temporaryArtifact: temporaryArtifact,
        httpClient: client,
        allowInsecureLoopback: allowInsecureLoopback,
      );
      if (downloadResult.status != ModelArtifactDownloadStatus.downloaded) {
        await _cleanupModelFiles(temporaryArtifact, verifiedArtifact);
        setFailedDependency(modelVersionId);
        return false;
      }
      if (deadline.expired) {
        await _cleanupModelFiles(temporaryArtifact, verifiedArtifact);
        return false;
      }

      final integrityResult = await verifier.verify(
        modelVersionId: modelVersionId,
        temporaryArtifact: File(downloadResult.temporaryArtifact!),
        verifiedArtifact: verifiedArtifact,
        expectedSha256: manifestResult.sha256,
        isDownloadComplete: true,
      );
      if (!integrityResult.isVerified) {
        await _cleanupModelFiles(temporaryArtifact, verifiedArtifact);
        setFailedDependency(modelVersionId);
        return false;
      }
      if (deadline.expired) {
        await _cleanupModelFiles(temporaryArtifact, verifiedArtifact);
        return false;
      }

      final modelDirectory = Directory(
        '${storageDirectory.path}${Platform.pathSeparator}$modelVersionId',
      );
      final artifactPath =
          '${modelDirectory.path}${Platform.pathSeparator}$modelVersionId.tflite';
      final metadataPath =
          '${modelDirectory.path}${Platform.pathSeparator}$modelVersionId.json';
      final availableBeforeInstall = await installer.isVersionAvailable(
        modelId: modelVersionId,
        modelVersionId: modelVersionId,
      );

      final installResult = await installer.install(
        modelId: modelVersionId,
        version: model.version,
        verifiedArtifact: verifiedArtifact,
        integrity: integrityResult,
      );
      if (installResult.status != ModelArtifactInstallStatus.availableOffline) {
        await _cleanupModelFiles(temporaryArtifact, verifiedArtifact);
        setFailedDependency(modelVersionId);
        return false;
      }

      if (!availableBeforeInstall) {
        installedModelFiles.add(File(artifactPath));
        installedModelFiles.add(File(metadataPath));
        installedModelVersionIds.add(modelVersionId);
      }
    }

    return true;
  }

  Future<ModelDownloadManifest?> _fetchModelManifest(
    String modelVersionId,
    HttpClient client,
  ) async {
    try {
      final request = await client.getUrl(
        serverUrl.resolve('/sdk/model-versions/$modelVersionId/manifest'),
      );
      request.followRedirects = false;
      request.headers.set(
        HttpHeaders.authorizationHeader,
        'Bearer $_credential',
      );
      final response = await request.close();
      final body = await utf8.decoder.bind(response).join();
      if (response.statusCode < 200 || response.statusCode >= 300) {
        return null;
      }
      // The server wraps the manifest: `{ "manifest": { ... } }`
      // (apps/server/src/sdk-model-versions.ts).
      final decoded = jsonDecode(body) as Map<String, dynamic>;
      return ModelDownloadManifest.fromJson(
        decoded['manifest'] as Map<String, dynamic>,
      );
    } on IOException {
      return null;
    } on FormatException {
      return null;
    } on TypeError {
      return null;
    }
  }

  Future<void> _cleanupModelFiles(
    File temporaryArtifact,
    File verifiedArtifact,
  ) async {
    try {
      if (await temporaryArtifact.exists()) await temporaryArtifact.delete();
    } on IOException {}
    try {
      if (await verifiedArtifact.exists()) await verifiedArtifact.delete();
    } on IOException {}
  }

  Future<void> _deleteDownloadedDefinition(File file) async {
    try {
      await file.delete();
    } on IOException {
      // The rejection stands even when the download cannot be removed.
    }
  }

  Future<Set<String>> _localWorkflowVersionIds(File inventoryFile) async {
    if (!await inventoryFile.exists()) return {};
    try {
      return _workflows(
        jsonDecode(await inventoryFile.readAsString()),
      ).map((workflow) => workflow.versionId).toSet();
    } on FormatException {
      return {};
    }
  }

  Iterable<_WorkflowManifestEntry> _workflows(Object inventory) {
    if (inventory is! Map || inventory['workflows'] is! List) return const [];
    return (inventory['workflows'] as List)
        .map(_Workflow.fromJson)
        .whereType<_Workflow>()
        .map(
          (workflow) =>
              _WorkflowManifestEntry(workflow.workflowVersionId, workflow.name),
        );
  }

  bool _isInventory(Object? value) =>
      value is Map &&
      value.keys.every((key) => key == 'workflows' || key == 'models') &&
      value['workflows'] is List &&
      value['models'] is List;

  bool _isAuthenticationAcknowledgement(Object? value) =>
      value is Map &&
      value['authenticated'] == true &&
      !value.containsKey('workflows') &&
      !value.containsKey('models');

  Future<_Inventory> _readInventory(File file) async {
    if (!await file.exists()) return const _Inventory.empty();
    try {
      final decoded = jsonDecode(await file.readAsString());
      return _isInventory(decoded)
          ? _Inventory.fromJson(decoded as Map)
          : const _Inventory.empty();
    } on FormatException {
      return const _Inventory.empty();
    }
  }

  _Comparison _compareInventories(_Inventory local, Map remote) {
    final workflows = {...local.workflows};
    final models = {...local.models};
    final resources = <SyncResourceResult>[];
    final acceptedWorkflows = <_Workflow>[];
    final invalidModelIds = <String>{};

    for (final item in remote['models'] as List) {
      final model = _Model.fromJson(item);
      if (model == null) {
        resources.add(_invalidResource(SyncResourceType.model, item));
        continue;
      }
      final previous = models[model.id];
      final sameVersion = previous?.version == model.version;
      final hashConflict =
          sameVersion &&
          previous!.sha256.toLowerCase() != model.sha256.toLowerCase();
      if (hashConflict) invalidModelIds.add(model.id);
      final status = hashConflict
          ? SyncResourceStatus.invalidRemoteResource
          : sameVersion
          ? SyncResourceStatus.upToDate
          : SyncResourceStatus.updated;
      if (status == SyncResourceStatus.updated) models[model.id] = model;
      resources.add(
        SyncResourceResult(
          type: SyncResourceType.model,
          status: status,
          resourceVersionId: model.id,
          version: model.version,
          remoteHashConflict: hashConflict,
        ),
      );
    }

    for (final item in remote['workflows'] as List) {
      final workflow = _Workflow.fromJson(item);
      final previous = workflow == null ? null : workflows[workflow.id];
      final sameInstalledWorkflow =
          workflow != null &&
          previous != null &&
          previous.workflowVersionId == workflow.workflowVersionId &&
          previous.version == workflow.version &&
          previous.name == workflow.name &&
          previous.modelVersionIds.length == workflow.modelVersionIds.length &&
          previous.modelVersionIds.asMap().entries.every(
            (entry) => entry.value == workflow.modelVersionIds[entry.key],
          );
      if (workflow == null ||
          !workflow.modelVersionIds.every(models.containsKey) ||
          (!sameInstalledWorkflow &&
              workflow.modelVersionIds.any(invalidModelIds.contains))) {
        resources.add(_invalidResource(SyncResourceType.workflow, item));
        continue;
      }
      acceptedWorkflows.add(workflow);
      final status = previous?.version == workflow.version
          ? SyncResourceStatus.upToDate
          : SyncResourceStatus.updated;
      if (status == SyncResourceStatus.updated)
        workflows[workflow.id] = workflow;
      resources.add(
        SyncResourceResult(
          type: SyncResourceType.workflow,
          status: status,
          resourceVersionId: workflow.workflowVersionId,
          version: workflow.version,
          name: workflow.name,
        ),
      );
    }

    final inventory = _Inventory(workflows, models);
    return _Comparison(inventory, resources, acceptedWorkflows);
  }

  SyncResourceResult _invalidResource(SyncResourceType type, Object? item) {
    final json = item is Map ? item : const <Object?, Object?>{};
    final resourceVersionId = type == SyncResourceType.workflow
        ? json['workflowVersionId']
        : json['modelVersionId'];
    return SyncResourceResult(
      type: type,
      status: SyncResourceStatus.invalidRemoteResource,
      resourceVersionId: resourceVersionId is String ? resourceVersionId : null,
      version: json['version'] is String ? json['version'] as String : null,
    );
  }

  Future<bool> _persistInventory(
    File inventoryFile,
    _Inventory inventory,
    _SyncDeadline deadline,
  ) async {
    if (deadline.expired) return false;
    try {
      await _onBeforeInventoryPersist?.call();
    } catch (_) {
      return false;
    }
    if (deadline.expired) return false;
    await storageDirectory.create(recursive: true);
    if (deadline.expired) return false;
    final temporaryFile = File(
      '${inventoryFile.path}.${DateTime.now().microsecondsSinceEpoch}.tmp',
    );
    try {
      await temporaryFile.writeAsString(
        jsonEncode(inventory.toJson()),
        flush: true,
      );
      if (deadline.expired) return false;
      await temporaryFile.rename(inventoryFile.path);
      return !deadline.expired;
    } on FileSystemException {
      return false;
    } finally {
      if (await temporaryFile.exists()) await temporaryFile.delete();
    }
  }
}

/// Creates an [AyniSdk] with the test-only hooks that US-090 keeps out of the
/// public contract.
///
/// `onWorkflowDownload` and `workflowVersionDownloader` mention internal
/// types, so neither the public [AyniSdk] constructor nor [AyniConfig] may
/// declare them: `package:ayni_sdk/ayni_sdk.dart` exports only nameable
/// types. `onBeforeInventoryPersist` has a nameable type but exists only for
/// the SDK's tests, so it stays out of the stable API for the same reason.
/// This factory stays in `lib/src/` and is deliberately not exported, so only
/// the SDK's own tests can reach it and integrating apps never see it.
AyniSdk createAyniSdkForTesting({
  required Uri serverUrl,
  required String credential,
  required Directory storageDirectory,
  Duration syncTimeout = const Duration(seconds: 30),
  bool allowInsecureLoopback = false,
  Future<void> Function()? onBeforeInventoryPersist,
  Future<void> Function()? onBeforeConsentReceiptRemoval,
  void Function(String message)? onProgress,
  void Function(WorkflowVersionDownloadResult result)? onWorkflowDownload,
  WorkflowVersionDownloader? workflowVersionDownloader,
  WorkflowInferenceRunner? workflowInferenceRunner,
}) {
  final sdk = AyniSdk(
    serverUrl: serverUrl,
    credential: credential,
    storageDirectory: storageDirectory,
    syncTimeout: syncTimeout,
    allowInsecureLoopback: allowInsecureLoopback,
    onProgress: onProgress,
  );
  sdk._onBeforeInventoryPersist = onBeforeInventoryPersist;
  ConsentReceiptStore.beforeRemoveForTesting = onBeforeConsentReceiptRemoval;
  sdk._onWorkflowDownload = onWorkflowDownload;
  if (workflowVersionDownloader != null) {
    sdk._workflowVersionDownloader = workflowVersionDownloader;
  }
  sdk._workflowInferenceRunner = workflowInferenceRunner;
  return sdk;
}

class _Inventory {
  const _Inventory(this.workflows, this.models);

  const _Inventory.empty() : workflows = const {}, models = const {};

  final Map<String, _Workflow> workflows;
  final Map<String, _Model> models;

  factory _Inventory.fromJson(Map json) {
    final workflows = <String, _Workflow>{};
    final models = <String, _Model>{};
    for (final item in json['workflows'] as List) {
      final workflow = _Workflow.fromJson(item);
      if (workflow != null) workflows[workflow.id] = workflow;
    }
    for (final item in json['models'] as List) {
      final model = _Model.fromJson(item);
      if (model != null) models[model.id] = model;
    }
    return _Inventory(workflows, models);
  }

  Map<String, Object> toJson() => {
    'workflows': workflows.values.map((workflow) => workflow.toJson()).toList(),
    'models': models.values.map((model) => model.toJson()).toList(),
  };
}

class _Workflow {
  const _Workflow({
    required this.id,
    required this.workflowVersionId,
    required this.name,
    required this.version,
    required this.modelVersionIds,
  });

  final String id;
  final String workflowVersionId;
  final String name;
  final String version;
  final List<String> modelVersionIds;

  static _Workflow? fromJson(Object? value) {
    if (value is! Map) return null;
    final id = value['workflowId'];
    final workflowVersionId = value['workflowVersionId'];
    final name = value['name'];
    final version = value['version'];
    final modelVersionIds = value['modelVersionIds'];
    if (!isNonEmptyString(id) ||
        !isNonEmptyString(workflowVersionId) ||
        !isNonEmptyString(name) ||
        !isNonEmptyString(version) ||
        modelVersionIds is! List ||
        !modelVersionIds.every(isNonEmptyString)) {
      return null;
    }
    return _Workflow(
      id: id,
      workflowVersionId: workflowVersionId,
      name: name,
      version: version,
      modelVersionIds: List<String>.from(modelVersionIds),
    );
  }

  Map<String, Object> toJson() => {
    'workflowId': id,
    'workflowVersionId': workflowVersionId,
    'name': name,
    'version': version,
    'modelVersionIds': modelVersionIds,
  };
}

class _Model {
  const _Model({required this.id, required this.version, required this.sha256});

  final String id;
  final String version;
  final String sha256;

  static _Model? fromJson(Object? value) {
    if (value is! Map) return null;
    final id = value['modelVersionId'];
    final version = value['version'];
    final sha256 = value['sha256'];
    if (!isNonEmptyString(id) ||
        !isNonEmptyString(version) ||
        sha256 is! String ||
        !RegExp(r'^[a-fA-F0-9]{64}$').hasMatch(sha256)) {
      return null;
    }
    return _Model(id: id, version: version, sha256: sha256);
  }

  Map<String, String> toJson() => {
    'modelVersionId': id,
    'version': version,
    'sha256': sha256,
  };
}

class _Comparison {
  const _Comparison(this.inventory, this.resources, this.acceptedWorkflows);

  final _Inventory inventory;
  final List<SyncResourceResult> resources;
  final List<_Workflow> acceptedWorkflows;
}

/// The outcome of installing the downloaded workflow definitions: the
/// inventory to persist (with rejected workflows rolled back to their local
/// state), the reported resources, where rejected workflows now carry
/// `invalidWorkflow`, and the definitions promoted this run, which are
/// removed again when the inventory cannot be persisted.
class _Installation {
  const _Installation({
    required this.inventory,
    required this.resources,
    required this.promotedFiles,
    this.installedModelFiles = const [],
  });

  final _Inventory inventory;
  final List<SyncResourceResult> resources;
  final List<File> promotedFiles;
  final List<File> installedModelFiles;
}

/// A workflow whose downloaded definition failed validation or whose
/// installation failed due to a storage error. It owns the user-facing
/// result because only the install step knows whether a previous valid
/// version was retained, which selects the appropriate message.
class _WorkflowRejection {
  const _WorkflowRejection(
    this.workflow, {
    required this.previousVersionRetained,
    this.installationFailed = false,
    this.dependencyFailed = false,
    this.dependencyName,
    this.unavailable = false,
    this.unsupportedVersion = false,
  });

  final _Workflow workflow;
  final bool previousVersionRetained;
  final bool installationFailed;
  final bool dependencyFailed;
  final String? dependencyName;
  final bool unavailable;
  final bool unsupportedVersion;

  SyncResourceResult toResult() => SyncResourceResult(
    type: SyncResourceType.workflow,
    status: unavailable
        ? SyncResourceStatus.workflowUnavailable
        : dependencyFailed
        ? SyncResourceStatus.dependencyFailed
        : installationFailed
        ? SyncResourceStatus.installationFailed
        : unsupportedVersion
        ? SyncResourceStatus.unsupportedWorkflowVersion
        : SyncResourceStatus.invalidWorkflow,
    resourceVersionId: workflow.workflowVersionId,
    version: workflow.version,
    name: workflow.name,
    previousVersionRetained: previousVersionRetained,
    dependencyName: dependencyName,
  );
}

class _SyncDeadline {
  _SyncDeadline(this.timeout) : _stopwatch = Stopwatch()..start();

  final Duration timeout;
  final Stopwatch _stopwatch;
  var expired = false;

  Duration get traceUploadBudget {
    final reserve = timeout ~/ 3;
    final available = timeout - _stopwatch.elapsed - reserve;
    if (available <= Duration.zero) return Duration.zero;
    final maximum = timeout ~/ 4;
    return available < maximum ? available : maximum;
  }

  void expire() => expired = true;
}

class _ActiveExecution {
  var cancelled = false;
}

class _WorkflowManifestEntry {
  const _WorkflowManifestEntry(this.versionId, this.name);

  final String versionId;
  final String name;
}
