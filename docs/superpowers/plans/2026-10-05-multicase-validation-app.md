# Multi-case Mobile Validation Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Extend the Android thesis app to run INT-01, S1, REU-01, and the complete S2 workflow from one start button using verified, paired direct/SDK runs.

**Architecture:** Replace the single-model active profile with plan-declared resource profiles, each tied to its dataset, immutable workflow, model nodes, hashes, and output contracts. Preflight the complete configured suite before appending results, then run the existing independent direct TFLite path and public ayni_sdk path over the same image bytes.

**Tech Stack:** Flutter/Dart, Android API 26+, ayni_sdk 0.3.0, tflite_flutter, existing archive/crypto/file-storage dependencies.

**Spec:** docs/superpowers/specs/2026-10-05-multicase-validation-detection-design.md. **Prerequisite:** complete docs/superpowers/plans/2026-10-05-detection-contract-sdk.md and publish ayni_sdk 0.3.0 after its review gate.

## Global Constraints

- One SDK Key and one Iniciar validación action remain the operator flow; no scenario, condition, or integration selector is added.
- INT-01 uses Coffee EfficientNetB0 and BRACOL; S1 uses Coffee MobileNetV2 and the same dataset; REU-01 uses the ten-label tomato classifier and PlantVillage; S2 executes both coffee EfficientNetB0 and SSD MobileNetV2, the sana >= 0.8 condition, and all declared typed outputs.
- Plan repetition and block counts remain data in the plan; do not change the thesis criteria or silently skip a case. Do not add F1–F6 fault injection or move external PERF-01 measurement into the ordinary button run.
- Before the first measured JSONL append, verify every configured suite dataset, model artifact, SHA-256, model contract, immutable workflow version, model-node set, and expected output set. A missing or invalid profile blocks the whole suite.
- Direct and SDK conditions use identical verified image bytes and CPU backend; inference runs offline, and all network work happens in preparation or authorized trace synchronization.
- JSONL results and image bytes stay on the device. Trace upload remains governed by the existing host permission and never uploads the app JSONL or images.
- Existing JSONL rows remain readable and are never rewritten; new rows identify every model version/hash in a multi-model workflow.
- Do not run DeepLabV3 as a positive case or bypass the production workflow validator. Keep S2 blocked until its dataset subset is authorized for private R2 use.
- Use real production IDs and hashes only. ZIP example IDs and secrets are never copied into the experiment plan.

## Review Focus

- A profile marked pending, a missing manifest, expired URL that cannot be refreshed, or bad dataset/model hash blocks the entire suite before the first result row; pin this in Tasks 1, 2, and 5.
- A workflow with a missing, extra, or wrong model node/version/contract/output never falls back to a different published version; pin this in Tasks 3–5.
- A multi-model workflow runs each required node exactly once in dependency order and evaluates conditions and outputs from the declared graph; pin this in Task 3.
- Old JSONL rows without a model list still load, while new rows retain all node-to-version/hash associations; pin this in Task 4.
- Cancellation during a model inference records the in-flight attempt as cancelled and schedules no later model node, case, or scenario; pin this in Tasks 3 and 5.

---

### Task 1: Define the multi-profile experiment plan

**Files:**
- Modify: apps/native/lib/validation/models/experiment_plan.dart
- Modify: apps/native/assets/validation/experiment_plan.json
- Test: apps/native/test/validation/models/experiment_plan_test.dart

**Interfaces:**
- Consumes: Existing dataset, scenario, phase, and output contract models.
- Produces: Experiment plan schemaVersion 2; ValidationResourceProfile with either status pending and only its id, or status ready plus dataset id/version/partition/SHA-256, workflow id/version id/SemVer, a nonempty list of model requirements {nodeId, modelVersionId, sha256, inputContract, modelOutputContract}, and final named output contracts. Each executable ValidationScenario declares its resourceProfileId. The asset has one scenario/profile row for each positive case; each row keeps the existing Plan repetition and block sizes, so counts and criteria per case do not change. External PERF-01 and separate F1–F6 definitions remain outside the ordinary one-button suite.

- [x] **Step 1: Write failing parser tests** for one-model INT-01 and S1 profiles, two-model S2 profile, pending MobileNet/Tomato/COCO profiles, duplicate IDs/node IDs, invalid hash/index contracts, unknown profile references, every positive case/profile mapping, and unchanged phase/block counts on each runnable row.
- [x] **Step 2: Run the focused parser tests**

Run: cd apps/native; flutter test test/validation/models/experiment_plan_test.dart

Expected: tests fail because the parser only accepts schemaVersion 1 and one active model profile.

- [x] **Step 3: Implement schemaVersion 2 models** with strict ready/pending variants. Add the four case profiles and the Plan's case/profile scenario rows; preserve the existing repetitions and block sizes on each case row. Keep unknown production IDs out of the asset and keep an unprovisioned profile visibly pending.
- [x] **Step 4: Rerun parser tests**

Run: cd apps/native; flutter test test/validation/models/experiment_plan_test.dart

Expected: valid suite profiles parse, invalid mappings reject, and the Plan's repetition/block values remain unchanged.

- [x] **Step 5: Commit** the parser, plan asset, and tests as feat(native): define multi-case validation profiles.

### Task 2: Prepare all model resources in a profile

**Files:**
- Modify: apps/native/lib/validation/data/validation_model_repository.dart
- Test: apps/native/test/validation/data/validation_model_repository_test.dart

**Interfaces:**
- Consumes: Task 1's ready profiles and ayni_sdk 0.3.0 contract shape.
- Produces: ValidationModelRepository.prepare(ValidationModelRequirement requirement) -> Future<VerifiedModelArtifact> and preparation for every model in a profile. This task makes each profile's resources available for the suite preflight; the all-profile/no-row gate is implemented in Task 5.

- [x] **Step 1: Write failing repository tests** for every model manifest in one profile, refreshed signed URLs, hash/contract mismatch, and preservation of previously verified local artifacts after a later model download fails.
- [x] **Step 2: Run the focused repository tests**

Run: cd apps/native; flutter test test/validation/data/validation_model_repository_test.dart

Expected: repository preparation returns all verified model artifacts for a ready profile or fails without replacing a previous valid artifact.

- [x] **Step 3: Implement model preparation keyed by one ValidationModelRequirement**. Reuse the existing manifest/download/hash/install path for each required model; preserve prior valid cache on failure and keep credentials off signed artifact requests. Reuse the existing dataset and workflow repositories by their exact version IDs.
- [x] **Step 4: Rerun focused tests**

Run: cd apps/native; flutter test test/validation/data/validation_model_repository_test.dart

Expected: all model artifacts in one ready profile are verified and a failed download leaves previous valid artifacts intact.

- [ ] **Step 5: Commit** the model repository and tests as feat(native): prepare all profile models.

### Task 3: Execute the full workflow in the independent direct control

**Files:**
- Modify: apps/native/lib/validation/execution/direct_tflite_runner.dart
- Modify: apps/native/lib/validation/execution/validation_condition_runner.dart and validation_output_normalizer.dart as needed
- Test: apps/native/test/validation/execution/direct_tflite_runner_test.dart and apps/native/test/validation/execution/validation_output_normalizer_test.dart

**Interfaces:**
- Consumes: Task 2's verified model artifacts and immutable workflow definition.
- Produces: DirectTfliteRunner that executes only input.image, model.tflite, condition, and output nodes; returns the same named classification/detection/boolean output map as the SDK condition. It uses its own TFLite interpreter and graph evaluation and imports no ayni_sdk implementation.

- [ ] **Step 1: Write failing graph execution tests** for the single-model classifier, S2 classifier plus detector with different input contracts, one invocation per model node in dependency order, condition sana >= 0.8, every declared output, cancellation after the in-flight node, and invalid graph/model-reference rejection.
- [ ] **Step 2: Run the direct-runner tests**

Run: cd apps/native; flutter test test/validation/execution/direct_tflite_runner_test.dart test/validation/execution/validation_output_normalizer_test.dart

Expected: current runner fails because it accepts one artifact and one non-boolean direct output.

- [ ] **Step 3: Implement direct graph execution** using the fetched immutable DAG and one verified artifact per model node. Apply that node's input and output contracts, route model/condition values through graph dependencies, and produce all outputs without calling the SDK.
- [ ] **Step 4: Rerun direct-runner tests**

Run: cd apps/native; flutter test test/validation/execution/direct_tflite_runner_test.dart test/validation/execution/validation_output_normalizer_test.dart

Expected: S2's complete normalized output matches the expected fixture and invalid output shapes fail closed.

- [ ] **Step 5: Commit** the direct interpreter and tests as feat(native): execute multi-model workflows directly.

### Task 4: Verify SDK treatment and preserve multi-model result records

**Files:**
- Modify: apps/native/lib/validation/execution/ayni_sdk_runner.dart
- Modify: apps/native/lib/validation/execution/validation_condition_runner.dart
- Modify: apps/native/lib/validation/models/validation_run_record.dart and apps/native/pubspec.yaml
- Modify after 0.3.0 is published: apps/native/pubspec.lock and apps/native/test/validation/package_configuration_test.dart
- Modify: apps/native/lib/validation/storage/validation_jsonl_store.dart only if needed for backward reading
- Test: apps/native/test/validation/execution/ayni_sdk_runner_test.dart, apps/native/test/validation/execution/validation_output_normalizer_test.dart, and apps/native/test/validation/storage/validation_jsonl_store_test.dart

**Interfaces:**
- Consumes: Task 1 profiles, Task 2 verified model artifacts, Task 3's direct workflow and output contract, Task 5 suite preflight, and published ayni_sdk 0.3.0.
- Produces: SDK runner verification of the exact workflow/model-node set and all final output names/types; run records add modelArtifacts [{nodeId, modelVersionId, sha256}] while retaining legacy singleton fields for existing JSONL compatibility.

- [ ] **Step 1: Write failing SDK-runner and JSONL tests** for exact two-model S2 verification, a changed/missing/extra model node, explicit tensor roles, all typed outputs, old singleton-row readback, and new multi-model round-trip. Update the package configuration test to expect hosted ayni_sdk 0.3.0 after that release is available.
- [ ] **Step 2: Run the focused tests**

Run: cd apps/native; flutter test test/validation/execution/ayni_sdk_runner_test.dart test/validation/execution/validation_output_normalizer_test.dart test/validation/storage/validation_jsonl_store_test.dart

Expected: current SDK runner rejects detection and only records one model version/hash.

- [ ] **Step 3: Implement exact SDK verification and record compatibility**. Remove the detection rejection only when the prepared contract carries all explicit roles; require exact published workflow/model versions and output set; parse old rows without rewriting the JSONL file.
- [ ] **Step 4: Resolve ayni_sdk 0.3.0 and verify the focused tests**

Run: cd apps/native; flutter pub get; flutter test test/validation/execution/ayni_sdk_runner_test.dart test/validation/execution/validation_output_normalizer_test.dart test/validation/storage/validation_jsonl_store_test.dart

Expected: the hosted 0.3.0 decoder is used and old and new JSONL records both load.

- [ ] **Step 5: Commit** runner, record, dependency pin, and tests as feat(native): validate multi-model SDK runs.

### Task 5: Run the suite from one action and report progress

**Files:**
- Modify: apps/native/lib/validation/execution/validation_batch_controller.dart
- Modify: apps/native/lib/validation/screens/validation_home_page.dart
- Test: apps/native/test/validation/execution/validation_batch_controller_test.dart and apps/native/test/validation/screens/validation_home_page_test.dart

**Interfaces:**
- Consumes: fully preflighted profiles, direct and SDK runners, existing JSONL store, and trace-permission setting.
- Produces: one start action that runs the Plan-declared suite in order, reports overall percent plus current case/phase and recent trace status, pairs each direct/SDK attempt by pairRunId and case/image hash, and stops future attempts on cancellation.

- [ ] **Step 1: Write failing orchestration/UI tests** for one action running every positive case/profile row, overall progress across profiles and ordinary phases, no case/integration selector, a pending or invalid last profile blocking all JSONL writes, authorized SDK trace synchronization, and cancellation during an in-flight S2 node.
- [ ] **Step 2: Run the focused controller and screen tests**

Run: cd apps/native; flutter test test/validation/execution/validation_batch_controller_test.dart test/validation/screens/validation_home_page_test.dart

Expected: the controller runs only the active profile and progress is not suite-wide.

- [ ] **Step 3: Implement suite sequencing**. Preflight every case/profile row and both conditions before the first append; run automatic SDK synchronization during preparation only, retain the current separate trace permission, keep measured inference offline, append each attempt locally, and stop after the in-flight inference when cancelled.
- [ ] **Step 4: Rerun screen/controller tests**

Run: cd apps/native; flutter test test/validation/execution/validation_batch_controller_test.dart test/validation/screens/validation_home_page_test.dart

Expected: the operator can start the complete configured suite with one action and see accurate suite progress and recent trace status.

- [ ] **Step 5: Commit** the one-action suite flow and tests as feat(native): run the complete validation suite.

### Task 6: Document provisioning and verify the Android build

**Files:**
- Modify: apps/native/README.md and apps/native/assets/validation/experiment_plan.json
- Test: apps/native/test/validation/models/experiment_plan_test.dart and full native suite

**Interfaces:**
- Consumes: Completed Tasks 1–5 and the teammate's model/dataset bundle.
- Produces: Operator instructions for provisioning the missing real IDs, hashes, workflow versions, and case manifests without embedding assets in Git or the APK.

- [ ] **Step 1: Add a plan-asset test** that rejects ZIP example IDs and secrets and keeps profiles pending until real resource IDs and hashes are entered.
- [ ] **Step 2: Run the new asset test to verify it fails**

Run: cd apps/native; flutter test test/validation/models/experiment_plan_test.dart

Expected: FAIL because the current bundled plan has no multi-case pending profiles or ZIP-ID guard.

- [ ] **Step 3: Document the provisioning order**: register model versions and contracts; create/publish the complete S2 workflow; register private dataset versions and manifests; filter or obtain authorization for the COCO images; then replace pending profile fields with production IDs and hashes.
- [ ] **Step 4: Run all native checks**

Run: cd apps/native; flutter pub get; flutter test; flutter analyze; flutter build apk --debug

Expected: tests/analyzer/build pass for Android API 26+ and the plan keeps S2 blocked unless its complete authorized dataset and workflow are provisioned.

- [ ] **Step 5: Commit** the provisioning instructions and plan test as docs(native): document multi-case suite setup.

## Completion Gate

Install the debug APK on a supported Android device and run every provisioned case. Compare direct and SDK normalized outputs for INT-01, S1, REU-01, and all authorized S2 images; verify progress, cancellation, local JSONL compatibility, and trace delivery with and without permission. The app cannot pass this gate while S2 is pending or the COCO subset lacks usage authorization.
