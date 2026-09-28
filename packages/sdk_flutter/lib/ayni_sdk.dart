/// The public integration contract of `package:ayni_sdk` (US-090).
///
/// Import this library — never `package:ayni_sdk/src/...` — to initialize the
/// SDK (`AyniSdk.initialize`), synchronize its resources (`AyniSdk.sync`) and
/// execute workflows (`AyniSdk.run`) together with the result and error types
/// those operations return. Everything under `lib/src/` is internal
/// implementation and is deliberately not exported.
library;

export 'src/ayni_sdk.dart'
    show
        AyniConfig,
        AyniInitializationResult,
        AyniSdk,
        AyniSdkConfig,
        InitializationResult,
        InitializationStatus,
        SyncResult,
        SyncResourceResult,
        SyncResourceStatus,
        SyncResourceType,
        SyncStatus;
export 'src/workflow_execution.dart'
    show
        BooleanResult,
        ClassificationResult,
        Detection,
        DetectionResult,
        WorkflowError,
        WorkflowErrorCategory,
        WorkflowResult,
        WorkflowValue;
