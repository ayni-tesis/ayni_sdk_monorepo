/// Runs Ayni workflows on the device, even without a network connection.
///
/// Create the client with [AyniSdk.initialize], install the application's
/// published workflows and their models with [AyniSdk.sync], and execute one
/// with [AyniSdk.run]. [SyncStatus], [SyncResourceStatus], and
/// [WorkflowErrorCategory] describe every outcome.
///
/// Import only this library: the files under `src/` are internal.
library;

export 'src/model_artifact_integrity_verifier.dart';
export 'src/model_artifact_installer.dart';
export 'src/ayni_sdk.dart';
export 'src/workflow_version_downloader.dart';
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
