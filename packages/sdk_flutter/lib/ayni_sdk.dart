/// The public integration contract of `package:ayni_sdk` (US-090).
///
/// Create the client with [AyniSdk.initialize], install the application's
/// published workflows and their models with [AyniSdk.sync], and execute one
/// with [AyniSdk.run]. [SyncStatus], [SyncResourceStatus], and
/// [WorkflowErrorCategory] describe every outcome.
///
/// Import this library — never `package:ayni_sdk/src/...` — everything under
/// `lib/src/` is internal implementation and is deliberately not exported.
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
        CombinedWorkflowResult,
        ClassificationResult,
        Detection,
        DetectionResult,
        WorkflowError,
        WorkflowErrorCategory,
        WorkflowResult,
        WorkflowValue;
