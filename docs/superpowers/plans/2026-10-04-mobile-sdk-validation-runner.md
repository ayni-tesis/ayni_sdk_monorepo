# Mobile SDK Validation Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `apps/native` into a small Android validation app that runs paired control/treatment batches from a versioned plan, keeps complete result JSONL on-device, and synchronizes only explicitly authorized `ayni_sdk` traces.

**Architecture:** Keep one Flutter app and one shared run ledger, dataset cache, plan parser, and operator screen. Isolate a direct `tflite_flutter` runner and an `ayni_sdk` 0.2.0 runner behind one condition interface; verify data/resources before running and never make network requests during a measured phase.

**Tech Stack:** Flutter 3.47.4 / Dart 3.13.3, Android API 26+, `ayni_sdk` 0.2.0, `tflite_flutter` 0.12.1, [`flutter_secure_storage` 11.2.0](https://pub.dev/packages/flutter_secure_storage/versions/11.2.0), [`share_plus` 13.3.1](https://pub.dev/packages/share_plus/versions/13.3.1), [`path_provider` 2.1.6](https://pub.dev/packages/path_provider/versions/2.1.6), `archive` 4.3.0, `crypto` 3.0.7, Flutter test.

**Spec:** `docs/superpowers/specs/2026-10-03-app-validacion-movil-sdk-design.md`; dataset delivery contract: `docs/superpowers/plans/2026-10-04-private-r2-validation-datasets.md`.

## Global Constraints

- `apps/native` is the thesis harness; `packages/sdk_flutter/example/app` stays an SDK example.
- The thesis app depends exactly on hosted `ayni_sdk` 0.2.0 and does not import internal SDK files or use `dataset.capture`/0.3.0 APIs.
- The app evaluates one selector-controlled app with two conditions: direct `tflite_flutter` control and `ayni_sdk` treatment.
- Both conditions use the same verified image bytes, model version, input contract, postprocessing contract, CPU backend, and JSONL result shape.
- Android API 26 or later is the validation platform; iOS is out of scope.
- Dataset ZIP and image SHA-256 values are verified before use; archive paths are checked before extraction; inference uses only the local verified copy.
- A measured `run` phase makes no network requests. Dataset/model/workflow download and `AyniSdk.sync()` happen in preparation.
- Results JSONL stays on the device and can be exported by the operator. No image bytes, tensors, or full JSONL are uploaded.
- Validation trace capture defaults off and requires a separate host-managed permission; its text explicitly says that typed decoded outputs are included. `sdkImprovement` consent remains separate.
- On trace permission revocation, stop further capture and call public `AyniSdk.instance.clearPendingTraces()`; do not call 0.3.0-only evidence APIs.
- The common selector APK has one common size. For SDK-size comparison, also build isolated control-only and treatment-only release variants from the same source and report their actual artifact sizes separately.
- Plan phases represent 20 warmups, 300 measured in 3 blocks of 100, 1,024 stress runs, and 30 repeats per fault scenario. Cold-start timing remains measured by the Plan's external Macrobenchmark/system procedure and is linked by `run_id`.

## Review Focus

- ZIP path traversal, absolute paths, duplicate image paths, malformed manifests, and oversized expanded content must reject the archive without writing outside the app directory; tests in Task 3 pin these failures.
- A truncated, hash-mismatched, or expired download must not replace a verified local dataset/model; tests in Tasks 3–4 assert the last valid cache remains usable.
- Missing/invalid workflow or model versions must block treatment measurements rather than silently run another version; tests in Task 4 assert the expected `WorkflowResult.workflowVersion` and output contract.
- Revoked trace permission must stop capture, purge queued traces through `clearPendingTraces()`, and preserve local JSONL; tests in Task 4 assert no subsequent trace context is sent.
- Cancellation during inference must finish at most the in-flight inference, record its attempt as cancelled, and schedule no later cases; tests in Task 5 assert this for both runner adapters.

## File Structure

- `apps/native/pubspec.yaml`, `pubspec.lock`, `android/`, and `README.md` own the hosted SDK pin, Android host configuration, dependencies, and operator setup.
- `lib/validation/models/` owns immutable plan, case, resource, phase, and ledger record models; `assets/validation/experiment_plan.json` declares batch phases and resource profile IDs without secrets.
- `lib/validation/data/` owns manifest parsing, private R2 download, safe ZIP extraction, hash validation, and verified local dataset installation.
- `lib/validation/execution/` owns the common runner contract, the direct TFLite adapter, the SDK 0.2.0 adapter, and normalized outputs.
- `lib/validation/storage/` owns append-only local JSONL, export, and encrypted connection/trace-permission preferences.
- `lib/validation/screens/validation_home_page.dart` owns the simple operator controls, progress, event list, and error state.
- `test/validation/` mirrors models, data, execution, storage, batch, and widget boundaries; no tests import `package:ayni_sdk/src/...`.

---

### Task 1: Pin the released SDK and establish the Android host

**Files:**
- Modify: `apps/native/pubspec.yaml`, `apps/native/pubspec.lock`
- Create if absent: `apps/native/android/` using Flutter Android scaffolding
- Modify: Android Gradle configuration to `minSdk = 26`, `compileSdk = 36`
- Modify: `apps/native/README.md`
- Create: `apps/native/test/validation/package_configuration_test.dart`

**Interfaces:**
- Consumes: Flutter 3.47.4 / Dart 3.13.3 and the already released pub.dev `ayni_sdk` 0.2.0.
- Produces: Android-buildable `apps/native` with a hosted `ayni_sdk: 0.2.0` dependency, direct `tflite_flutter: ^0.12.1`, and dependencies `archive: ^4.3.0`, `crypto: ^3.0.7`, `flutter_secure_storage: ^11.2.0`, `path_provider: ^2.1.6`, and `share_plus: ^13.3.1`.

- [x] **Step 1: Write failing package configuration tests** that assert the SDK dependency is hosted and exactly `0.2.0`, no path dependency/override points to `packages/sdk_flutter`, and Android min SDK is at least 26.
- [x] **Step 2: Run the focused test**

Run: `cd apps/native; flutter test test/validation/package_configuration_test.dart`

Expected: FAIL because the app still depends on the local SDK package and has no Android host.

- [x] **Step 3: Implement package/host configuration**. Remove the local path dependency, add the listed dependencies, commit the resolved lockfile, and generate only Android host files with `flutter create --platforms=android .` if `android/` is absent. Set `minSdk = 26` and `compileSdk = 36`; do not generate iOS.
- [x] **Step 4: Resolve and verify**

Run: `cd apps/native && flutter pub get && flutter test test/validation/package_configuration_test.dart && flutter analyze`

Expected: `ayni_sdk 0.2.0` resolves from the hosted package; tests PASS and analyzer reports no issues.

- [x] **Step 5: Commit**

```bash
git add apps/native/pubspec.yaml apps/native/pubspec.lock apps/native/android apps/native/README.md apps/native/test/validation/package_configuration_test.dart
git commit -m "build: pin validation app to ayni sdk 0.2.0"
```

### Task 2: Parse and validate the experiment plan

**Files:**
- Create: `apps/native/assets/validation/experiment_plan.json`
- Modify: `apps/native/pubspec.yaml` to bundle the asset
- Create: `apps/native/lib/validation/models/experiment_plan.dart`
- Create: `apps/native/lib/validation/models/validation_run_record.dart`
- Create: `apps/native/test/validation/models/experiment_plan_test.dart`

**Interfaces:**
- Consumes: Task 1 Flutter app configuration.
- Produces: `ExperimentPlan.fromJson(Map<String, Object?> json)`; `ExperimentPlan.load(AssetBundle bundle)`; `ValidationPhase` values `coldStart`, `warmup`, `measured`, `stress`, `fault`; immutable `ValidationScenario`, `ValidationResourceProfile`, and `ValidationRunRecord`.
- Each profile identifies one dataset version, the same model version/hash in control and treatment, treatment workflow ID/expected version, and a shared image/preprocess/output contract. The input contract mirrors the published `ayni_sdk 0.2.0` model contract (`width`, `height`, `channels`, `normalization`); inference uses NHWC float32 tensors and the SDK's image decoder, RGB/grayscale/alpha channel order, resize, and normalization behavior. The profile rejects different model version IDs or contracts between the direct adapter and the workflow definition. A `pairRunId` links control and treatment; repetitions are one-based.

- [x] **Step 1: Write failing parser tests** for a valid plan, unsupported schema version, missing resource profile, duplicate case IDs, invalid count/phase, 30 cold-start launch labels, exactly 20 warmups, three measured blocks of 100, 1,024 stress repetitions, and 30 repetitions per fault scenario.
- [x] **Step 2: Run the focused tests**

Run: `cd apps/native; flutter test test/validation/models/experiment_plan_test.dart`

Expected: FAIL because plan models and fixture do not exist.

- [x] **Step 3: Implement immutable models and the bundled plan**. Reject unknown/missing required fields, use `schemaVersion: "1"`, define profile resource identifiers without credentials, include both expected model-version IDs and require them to match, and keep all phase counts in the plan rather than hardcoding batch-loop behavior. The 30 cold-start labels are exported for the Plan's external Macrobenchmark procedure; the app does not measure process startup itself.
- [x] **Step 4: Rerun the focused tests**

Run: `cd apps/native; flutter test test/validation/models/experiment_plan_test.dart`

Expected: PASS, including the exact Plan v1.3 phase counts.

- [x] **Step 5: Commit**

```bash
git add apps/native/assets/validation/experiment_plan.json apps/native/pubspec.yaml apps/native/lib/validation/models apps/native/test/validation/models/experiment_plan_test.dart
git commit -m "feat: define thesis experiment plan models"
```

### Task 3: Download and install a verified private dataset ZIP

**Files:**
- Create: `apps/native/lib/validation/data/dataset_manifest.dart`
- Create: `apps/native/lib/validation/data/dataset_bundle_loader.dart`
- Create: `apps/native/lib/validation/data/dataset_repository.dart`
- Create: `apps/native/test/validation/data/dataset_manifest_test.dart`
- Create: `apps/native/test/validation/data/dataset_bundle_loader_test.dart`
- Create: `apps/native/test/validation/data/dataset_repository_test.dart`

**Interfaces:**
- Consumes: Task 2's dataset/version profile and the dataset manifest API from the linked R2 plan.
- Produces: `DatasetManifest.fromJson(Map<String, Object?> json)`; `DatasetBundleLoader.install({required File archiveFile, required Directory datasetsDirectory, required String expectedArchiveSha256, required String expectedDatasetId, required String expectedVersion, required String expectedPartition, required String expectedSource, required String expectedLicense}) -> Future<VerifiedDataset>`; `DatasetRepository.prepare(datasetVersionId, {onProgress}) -> Future<VerifiedDataset>`.
- `VerifiedDataset` exposes the parsed ordered cases, dataset version, partition, ZIP SHA-256, and private local image paths; it does not expose an unverified path.

- [x] **Step 1: Write failing tests** for valid manifest/ZIP, ZIP hash mismatch, per-image hash mismatch, absolute and `../` paths, Windows drive paths, duplicate paths/case IDs, missing image, malformed ZIP, expanded size over 1 GiB, signed URL expiry followed by manifest refresh, and failed install preserving a previously verified directory.
- [x] **Step 2: Run focused tests**

Run: `cd apps/native; flutter test test/validation/data`

Expected: FAIL because manifest, loader, and repository are absent.

- [x] **Step 3: Implement download and safe installation**. Use `HttpClient` with bearer auth only for the manifest request and no credential for the signed object URL; verify the signed URL is HTTPS (or explicitly allowed loopback in development), refresh the manifest and signed URL after an expired download, stream the ZIP to a temporary file, enforce the 128 MiB server ZIP cap, verify ZIP and image SHA-256 values, require a root `manifest.json` with `schemaVersion: "1"` and matching dataset/version/partition/source/license fields, reject archive entries escaping the destination, cap total extracted bytes at 1 GiB, and atomically promote only after every check succeeds.
- [x] **Step 4: Rerun focused tests**

Run: `cd apps/native; flutter test test/validation/data`

Expected: PASS; every rejection leaves the current verified dataset directory unchanged.

- [x] **Step 5: Commit**

```bash
git add apps/native/lib/validation/data apps/native/test/validation/data
git commit -m "feat: verify and cache private validation datasets"
```

### Task 4: Implement direct and SDK execution adapters

**Files:**
- Create: `apps/native/lib/validation/execution/validation_condition_runner.dart`
- Create: `apps/native/lib/validation/execution/direct_tflite_runner.dart`
- Create: `apps/native/lib/validation/execution/ayni_sdk_runner.dart`
- Create: `apps/native/lib/validation/execution/validation_output_normalizer.dart`
- Create: `apps/native/lib/validation/storage/validation_preferences.dart`
- Create: `apps/native/test/validation/execution/direct_tflite_runner_test.dart`
- Create: `apps/native/test/validation/execution/ayni_sdk_runner_test.dart`

**Interfaces:**
- Consumes: Task 2 profiles/records and Task 3 `VerifiedDataset`.
- Produces: `abstract interface class ValidationConditionRunner { ValidationCondition get condition; Future<ConditionRunResult> runCase(ValidationRunRequest request); Future<void> close(); }`; `ValidationRunRequest` carries `pairRunId`, one-based `repetition`, scenario/case IDs, verified input bytes/hash, dataset ID/partition/hash, phase, and `captureTrace`; `ConditionRunResult` carries normalized output, resource version/hash, duration, and typed outcome/error.
- The recorded duration covers preprocessing, local inference, and output normalization. Request integrity checks, secure trace-permission lookup, and preparation are completed outside that duration for both conditions.
- The SDK adapter uses only public `package:ayni_sdk/ayni_sdk.dart` APIs: static `AyniSdk.initialize(AyniConfig(...))`, then `AyniSdk.instance.sync()`, `.run(workflowId, bytes, traceContext: ...)`, and `.clearPendingTraces()`. It reads `WorkflowResult.workflowVersion` and `.outputs`; no SDK internal imports.

- [x] **Step 1: Write failing adapter tests** for same-byte input, CPU-only execution, direct model manifest/hash validation, SDK initialization/sync, workflow-version and referenced-model-version enforcement, matching normalized output shape, credential redaction, trace capture defaulting off, and permission revocation calling `clearPendingTraces()` while subsequent requests carry no trace context.
- [x] **Step 2: Run focused tests**

Run: `cd apps/native; flutter test test/validation/execution`

Expected: FAIL because runner interfaces/adapters are absent.

- [x] **Step 3: Implement the direct runner and normalizer**. Fetch the direct model via `GET /sdk/model-versions/:modelVersionId/manifest`, verify its SHA-256 before creating a CPU interpreter, and apply the same profile image contract and typed output schema as treatment. The signed artifact GET never carries the SDK bearer; the interpreter uses the default CPU runtime without delegates.
- [x] **Step 4: Implement the SDK runner and trace permission**. Initialize the hosted 0.2.0 SDK using server URL, credential, and app-private storage. During preparation, fetch the expected immutable definition from `GET /sdk/workflow-versions/:workflowVersionId`, verify the workflow's model node references the same `modelVersionId` and input/output contracts as the direct profile, and call `AyniSdk.instance.sync()` only from the explicit sync action. Require explicit host permission before passing `WorkflowTraceContext(runId: pairRunId, repetition: repetition, condition: ..., caseId: ..., scenario: ..., datasetId: ..., datasetPartition: ..., datasetSha256: ..., backend: "CPU", appVersion: ..., sdkVersion: ...)`. Render the permission copy: `Se enviará a Ayni la traza técnica del SDK, incluidas las salidas tipadas decodificadas. No se enviarán imágenes, tensores ni el JSONL completo.` Keep the preference false by default and separate from `sdkImprovement`; on revocation persist the disabled state first and call `AyniSdk.instance.clearPendingTraces()` before completing the UI action.
- [x] **Step 5: Add an unmeasured treatment preflight** after explicit SDK sync. Run the selected workflow once, check `WorkflowResult.workflowVersion`, output names/types, and the expected model version against the profile, and block the measured batch if any differ. This preflight is separate from the result record and never receives trace context.
- [x] **Step 6: Rerun focused tests**

Run: `cd apps/native && flutter test test/validation/execution && flutter analyze`

Expected: PASS; the adapters return the same public normalized result shape and no images/tensors/credentials enter logs or trace context.

- [x] **Step 7: Commit**

```bash
git add apps/native/lib/validation/execution apps/native/lib/validation/storage/validation_preferences.dart apps/native/test/validation/execution
git commit -m "feat: add direct and ayni sdk validation runners"
```

### Task 5: Run repeatable batches and preserve local JSONL

**Files:**
- Create: `apps/native/lib/validation/storage/validation_jsonl_store.dart`
- Create: `apps/native/lib/validation/storage/validation_jsonl_exporter.dart`
- Create: `apps/native/lib/validation/execution/validation_batch_controller.dart`
- Modify: `apps/native/lib/validation/execution/validation_condition_runner.dart`, `direct_tflite_runner.dart`, and `ayni_sdk_runner.dart` for cancellation
- Modify: `apps/native/lib/validation/models/validation_run_record.dart` to retain SDK trace-persistence status
- Create: `apps/native/test/validation/storage/validation_jsonl_store_test.dart`
- Create: `apps/native/test/validation/execution/validation_batch_controller_test.dart`

**Interfaces:**
- Consumes: Task 2's plan/record types and Task 4's `ValidationConditionRunner`.
- Produces: `ValidationJsonlStore.append(ValidationRunRecord)` and `.readAll()`; `ValidationJsonlExporter.export(File jsonlFile)`; `ValidationBatchController.runPhase({required ExperimentPlan plan, required String pairRunId, required ValidationConditionRunner runner, required VerifiedDataset dataset, required String scenarioId, required ValidationPhase phase, required Future<bool> Function() isCancelled, required void Function(ValidationRunRecord) onRecord, bool captureTrace = false}) -> Future<BatchRunSummary>`.
- Each attempted inference writes one append-only record with condition, run/repetition, phase, scenario/case, dataset/partition/hash, input hash, exact resource version/hash, CPU backend, duration, normalized output, and success/error/cancelled state. SDK traces are not copied to or uploaded from the JSONL by the SDK.

- [x] **Step 1: Write failing storage/batch tests** for JSONL round-trip, append after a fresh store instance, corrupt final line recovery without data loss, exact repetition/block counts, verified-image rehash, local export, cancellation during one inference, and no later case scheduled after cancellation.
- [x] **Step 2: Run focused tests**

Run: `cd apps/native; flutter test test/validation/storage/validation_jsonl_store_test.dart test/validation/execution/validation_batch_controller_test.dart`

RED confirmed: compilation fails because the JSONL store and batch controller do not exist.

- [x] **Step 3: Implement append-only local storage and batch execution**. Save under the application documents directory, flush each result record before advancing, retain warmup/fault/error/cancelled attempts, share the same verified input bytes across paired runs, and stop after the current inference finishes. Invoke SDK `cancelExecution` only when its active execution ID is available; cancellation never changes installed resources. A corrupt final line is truncated back to the last complete record; corruption before the tail stops reading without rewriting earlier data. Warmup cycles the verified PERF-02 case set, and PERF-01 remains an external measurement handoff.
- [x] **Step 4: Implement JSONL export** through `share_plus`; include no trace outbox, credential, signed URL, or image/tensor data in the exported record.
- [x] **Step 5: Rerun focused tests**

Run: `cd apps/native; flutter test test/validation/storage/validation_jsonl_store_test.dart test/validation/execution/validation_batch_controller_test.dart`

Expected: PASS; each attempt is durable and cancellation schedules no subsequent case. The full `flutter test` suite and `flutter analyze` must also pass.

- [x] **Step 6: Commit** (after full suite and analyzer pass)

```bash
git add apps/native/lib/validation/storage apps/native/lib/validation/execution/validation_batch_controller.dart apps/native/test/validation/storage apps/native/test/validation/execution/validation_batch_controller_test.dart
git commit -m "feat: record offline validation batches as jsonl"
```

### Task 6: Build the operator screen and explicit sync flow

**Files:**
- Modify: `apps/native/lib/main.dart`
- Create: `apps/native/lib/validation/screens/validation_home_page.dart` with injectable runtime wiring for widget verification
- Create: `apps/native/test/validation/screens/validation_home_page_test.dart`
- Modify: `apps/native/test/widget_test.dart`

**Interfaces:**
- Consumes: Tasks 2–5's plan, dataset repository, condition adapters, JSONL store/exporter, and secure preferences.
- Produces: one home screen with server/SDK state, dataset version/hash, `Integración directa` / `ayni_sdk` selector, scenario/phase and paired `run_id`, trace permission text/toggle, `Preparar recursos`, `Ejecutar lote`, `Cancelar`, `Sincronizar SDK`, and `Exportar JSONL` controls, progress, and compact events/errors.

- [x] **Step 1: Write failing widget tests** for disabled execution before all hashes/resources are verified, the trace disclosure/default-off state, run/cancel progress, explicit-only SDK sync, local JSONL export action, and permission revocation calling `clearPendingTraces()`.
- [x] **Step 2: Run the focused widget test**

Run: `cd apps/native; flutter test test/validation/screens/validation_home_page_test.dart`

RED confirmed: compilation failed because the operator screen and injected runtime contract were absent.

- [x] **Step 3: Implement the small screen** with no image/model/workflow editing features. Keep SDK sync out of measurement phases; show errors and manifest/resource hashes needed to decide whether to start. Mark client-reported profile values as declared metadata, not SDK-verified facts. After `Sincronizar SDK`, show the sync result and remind the operator to confirm trace receipt in the dashboard; the SDK 0.2.0 API has no separate per-trace acknowledgement. The screen explains that the ZIP is a compressed package with `manifest.json` and images, stores SDK credentials securely, keeps capture off by default, and leaves the bundled resource profile as a template until published IDs/hashes replace its sentinels.
- [x] **Step 4: Rerun widget tests and analyzer**

Run: `cd apps/native && flutter test test/validation/screens/validation_home_page_test.dart && flutter analyze`

The widget suite passes (97 tests total), and `flutter analyze` reports no issues. The earlier Application Control block was cleared for the Dart test runtime.

- [x] **Step 5: Commit** (implementation and focused widget verification committed)

```bash
git add apps/native/lib/main.dart apps/native/lib/validation/screens/validation_home_page.dart apps/native/test/validation/screens/validation_home_page_test.dart apps/native/test/widget_test.dart
git commit -m "feat: add validation operator screen"
```

### Task 7: Verify Android release variants and document the device pilot

**Files:**
- Modify: `apps/native/README.md`
- Modify: Android build configuration only if verification finds a concrete issue
- Add: focused Android integration tests if needed for startup/permission/cancel behavior
- Create: `apps/native/test/validation/build_configuration_test.dart`

**Interfaces:**
- Consumes: Complete app from Tasks 1–6 and the published `ayni_sdk` 0.2.0 package.
- Produces: one reproducible Android release APK with a condition selector; optional `control` or `treatment` defines can restrict operation to one condition, but are not separate thesis deliverables and do not claim to remove the other runner's package dependencies. README lists the selector APK's size and SHA-256, resolved SDK version, and environment/device prerequisites.

- [x] **Step 1: Add a build-configuration check** for SDK 0.2.0, `minSdk = 26`, CPU inference, and the selector/control/treatment runner-routing matrix.
- [x] **Step 2: Run the focused build-configuration check**

Run: `cd apps/native; flutter test test/validation/build_configuration_test.dart`

The build-configuration test passes as part of the Flutter suite.

- [ ] **Step 3: Build the approved selector app**. Keep the default `VALIDATION_CONDITION=selector` for the thesis pilot. The existing `control` and `treatment` values may restrict the operator flow for a run, but Flutter still packages the shared app dependencies, so do not describe those artifacts as dependency-isolated variants. Record the selector APK's actual byte size and SHA-256.
- [x] **Step 4: Run all Flutter, release, and device checks**

Run: `cd apps/native && flutter test && flutter analyze && flutter build apk --release && flutter devices`

The Flutter suite passes (97 tests) and `flutter analyze` reports no issues. The selector release build reaches Gradle, but Windows Application Control blocks the trusted Flutter SDK's `gen_snapshot.exe` and `font-subset.exe` during `compileFlutterBuildRelease`; no APK was produced, so its size and SHA-256 are not available. The physical Android pilot remains pending until the administrator permits those binaries and the APK is installed on a device.

- [x] **Step 5: Update environment/setup documentation and commit**. README instructs enabling Android `cmdline-tools`, accepting Android SDK licenses, setting SDK server URL/credential, preparing the private R2 dataset and published model/workflow resources, and keeping device network state changes external to the measured batch. It reports the release-build Application Control block and administrator handling without suggesting a policy bypass.

```bash
git add apps/native
git commit -m "test: verify android validation app release builds"
```

## Self-review

- Spec coverage: both conditions, paired IDs, batch phases, cold-start handoff, same inputs/contracts, private dataset download/hash/path checks, offline execution, model/workflow preparation, CPU, local JSONL, explicit trace disclosure and revocation, SDK sync, cancellation, export, Android API floor, and size variants each appear in Tasks 1–7.
- Type consistency: the `ValidationConditionRunner`, `ValidationRunRequest`, `ConditionRunResult`, `VerifiedDataset`, and `ValidationRunRecord` names introduced in Tasks 2–4 are consumed unchanged by Tasks 5–6.
- Scope: no training, image/model/workflow editing, result upload, image/tensor transfer, iOS target, `dataset.capture`, or Macrobenchmark replacement is introduced.
- Environment: the current host has Android Studio, Flutter/Dart, and Android SDK 36. The Flutter suite (97 tests) and analyzer pass. The release build reaches Gradle, but Windows Application Control blocks the official Flutter SDK's `gen_snapshot.exe` and `font-subset.exe`; an administrator must allow these trusted binaries before producing/installing the selector APK. Physical-device validation remains pending.
