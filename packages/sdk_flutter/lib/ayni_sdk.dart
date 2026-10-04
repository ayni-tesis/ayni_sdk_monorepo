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
export 'src/device_profile.dart' show DeviceProfile;
export 'src/evidence_event.dart' show EvidenceEvent;
export 'src/evidence_queue_status.dart' show EvidenceQueueStatus;
export 'src/evidence_status.dart' show EvidenceStatus;
export 'src/workflow_trace.dart'
    show
        TraceMeasurement,
        TraceModel,
        TraceNodeExecution,
        WorkflowTrace,
        WorkflowTraceContext;
export 'src/sdk_consent.dart'
    show ConsentDecision, ConsentPurpose, ConsentResult, ConsentStatus;
