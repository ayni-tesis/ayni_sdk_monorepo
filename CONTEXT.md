# Ayni Domain Context

Ayni is an offline-first platform for orchestrating and deploying on-device AI model workflows to Flutter mobile applications.

## Language

**Workspace**:
The tenant boundary that isolates applications, members, SDK credentials, workflows, and datasets. Implemented directly as a Better Auth Organization without a duplicate entity.
_Avoid_: Team, tenant, project, account

**Organization**:
The Better Auth entity backing a Workspace, holding members and permissions.
_Avoid_: Org, tenant

**Application**:
An isolated project owned by a Workspace that defines and deploys DAG workflows, models, and telemetry and collection policies.
_Avoid_: App project, client app

**Administrator**:
A Workspace member holding the owner or admin role with full management permissions over applications and workspace resources.
_Avoid_: Manager, superuser

**SDK Credential**:
An application-scoped secret that lets an SDK installation authenticate to synchronize that application's resources. The server never stores the reusable secret itself: it persists only the secret's SHA-256 hash and its display prefix, and shows the secret once at creation. Afterwards administrators may list only the prefix and operational metadata (status and dates), never the secret. Revoking a credential marks it `revoked`, after which it can never authenticate or synchronize new resources (`credentialRevoked`); revocation never deletes existing workflows, models, or versions, nor removes resources already stored offline on devices.
_Avoid_: API key, token

**Model**:
An on-device AI model registered within an Application that manages its supported runtime (such as TensorFlow Lite) and versions for use in workflows.
_Avoid_: ML file, weights, algorithm

**Model Version**:
An immutable artifact representing a specific version of a Model, identified by a unique SemVer tag within that Model, backed by an on-device inference binary file (such as TensorFlow Lite `.tflite`), and verified for format integrity and cryptographic checksum (SHA-256) upon upload. A published version cannot be overwritten or replaced.
_Avoid_: Checkpoint, build, snapshot, weights file, release

**Workflow**:
A directed acyclic graph (DAG) of inference steps owned by exactly one Application. A Workflow is created by a workspace administrator as an empty `draft` with no nodes and no published version; creating one in an archived Application is rejected with `applicationArchived`.
_Avoid_: Pipeline, flow, chain

**Draft Revision**:
A counter on a Workflow's draft that grows by one with every accepted draft change. Each change from the canvas names the revision it was based on; a change based on an older revision is rejected with `draftConflict` and changes nothing, so nobody overwrites another administrator's work with a stale view. Published versions never carry it.
_Avoid_: Draft version (a published Workflow version is a different thing), ETag

**Workflow Version**:
An immutable snapshot of a Workflow's draft, published by an administrator under a SemVer tag unique within that Workflow. Only a draft that passes validation can be published (`workflowInvalid` otherwise); publishing in an archived Application is rejected with `applicationArchived` and reusing a tag with `versionExists`. Later draft changes never alter a published version. The SDK receives only the most recently published version of each non-archived Workflow; drafts never leave the server.
_Avoid_: Release, deployment, draft version

**Offline Sync**:
The SDK process that authenticates with an SDK Credential, compares the Workflow Versions and Model Versions the server offers with those already on the device, and downloads only what changed. Before installing, it validates each Workflow Version's definition and verifies each Model Version's SHA-256 checksum. A Workflow Version is installed together with all of its Model Versions or not at all: when an update fails, the device keeps the last valid combination of Workflow Version and Model Versions, which the app can keep using without a network.
_Avoid_: Download, deploy, update, OTA

**Telemetry Policy**:
The per-Application setting that says whether the SDK may send technical telemetry and how many days its traces are kept. Only administrators change it. Without a saved policy, telemetry is disabled. It never authorizes collecting images or raw inputs.
_Avoid_: Tracking settings, analytics consent

**Collection Policy**:
The per-Application setting that says whether the SDK may capture images as evidence for datasets, over which network it may upload them, and the maximum size and quality it compresses them to. Only administrators change it. Without a saved policy, collection is disabled. Collection can only be enabled together with an explicit consent configuration, and images are only captured by workflows that include `dataset.capture`.
_Avoid_: Capture settings, upload settings

**Evidence**:
An image the SDK keeps on the device when an execution of a Workflow Version reaches a `dataset.capture` node and completes successfully (a failed or cancelled execution creates none), together with the inference result the node received, the Workflow Version and the Model Version that produced the result, to send it later to its Application's datasets. The SDK creates it only while the app says the person consents to evidence collection, and never delays or changes the result it returns. It keeps a copy of the image reduced and compressed with the Collection Policy's maximum size and quality, never the image the workflow used, and discards an evidence it cannot prepare or has no space to save. A saved evidence stays pending in a local queue on the device, without a connection and across restarts, and is never counted as sent before the server confirms it received it. An upload that fails is retried in later syncs with the same ID, waiting longer after each failure, up to a configured number of attempts; after that the evidence stays on the device as failed (`Fallida`) and is no longer sent automatically. It only leaves the device while the Collection Policy is enabled and over the network it allows: with only Wi-Fi allowed, evidence waits for Wi-Fi (`Pendiente de Wi-Fi`) instead of using mobile data. The server accepts it only for the Application of the SDK credential, from a `dataset.capture` node of one of that Application's Workflow Versions, and keeps it, image and data, associated with that Application, Workflow, Workflow Version and Model Version.
_Avoid_: Sample, upload, telemetry

**Slug**:
A unique URL-safe identifier generated for each Workspace upon creation to satisfy organization constraints.
_Avoid_: Workspace handle, organization code
