# Detection Tensor Roles and SDK 0.3.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Publish explicit detection tensor-role metadata from a model version through immutable workflows and decode it correctly in ayni_sdk 0.3.0.

**Architecture:** Extend the existing model-version contract with an optional tensorIndices map, copy it into new model nodes through the existing contract propagation path, and make the SDK use that map when present. Older contracts and workflows without the map keep the current legacy decoder.

**Tech Stack:** Bun, TypeScript, Zod, Drizzle JSONB contracts, Next.js dashboard, Flutter/Dart SDK, TensorFlow Lite.

**Spec:** docs/superpowers/specs/2026-10-05-multicase-validation-detection-design.md, sections “Contrato de detección y versión SDK” and “Pruebas de aceptación”.

## Global Constraints

- Detection contracts may include the exact roles boxes, classes, scores, and count; when present all four indexes are distinct integers from 0 through 3.
- Published workflow versions remain immutable; the model node copies the model-version contract at creation time.
- Existing detection contracts and workflow definitions without tensorIndices continue through the legacy SDK decoder.
- The SDK candidate version is 0.3.0; its public API remains nameable only through package:ayni_sdk/ayni_sdk.dart.
- Detection count limits decoded results; malformed role maps, tensor shapes, or count values fail with the existing typed model-output error.
- Publishing the package or creating a permanent release tag is outside this plan; prepare and verify the candidate, then request release authorization after review.

## Review Focus

- Missing, unknown, fractional, duplicate, negative, or out-of-range role indexes are rejected before a model contract is stored; pin this in Task 1.
- A role map against a model with fewer than four output tensors is rejected; pin this in Task 1.
- Permuting the detector outputs still returns correct boxes, labels, and scores; pin this in Task 3.
- Count zero and a count smaller than candidate capacity return only the first count detections, while invalid count shape/value fails; pin this in Task 3.
- A previously published detection workflow without tensorIndices still decodes through the old path; pin this in Task 3.

---

### Task 1: Validate and publish tensor-role maps in the model contract

**Files:**
- Modify: packages/db/src/schema/model-version.ts
- Modify: packages/api/src/sdk-openapi.ts and packages/api/src/openapi.json
- Modify: apps/server/src/model-versions.ts and apps/server/src/tflite-contract-validator.ts
- Test: packages/api/src/openapi.test.ts, apps/server/src/model-versions.test.ts, apps/server/src/sdk-openapi-contract.test.ts
- Create test: apps/server/src/tflite-contract-validator.test.ts

**Interfaces:**
- Consumes: Existing classification and detection model-version contracts.
- Produces: Detection output type with optional tensorIndices: { boxes: number; classes: number; scores: number; count: number }. If present, validation requires exactly those four keys, distinct indexes 0–3, exactly four model outputs, and compatible role shapes: boxes [1,N,4], classes/scores [1,N], count [1] or [1,1]. Contracts without the map remain valid for existing versions.

- [x] **Step 1: Write failing contract tests** for a valid reordered role map, omitted map compatibility, each missing/unknown role, non-integer and duplicate indexes, out-of-range indexes, and model output shape/count mismatch.
- [x] **Step 2: Run the focused API/server tests**

Run: bun run --filter @ayni/api test -- src/openapi.test.ts
Run: bun run --filter server test -- src/model-versions.test.ts src/sdk-openapi-contract.test.ts src/tflite-contract-validator.test.ts

Expected: the new map cases fail because the shared types and validators do not yet accept the field.

- [x] **Step 3: Implement the shared type and strict validators** in the listed files. Keep tensorIndices optional for legacy contracts; for mapped contracts verify all roles against the four published TFLite output tensors before saving.
- [x] **Step 4: Regenerate OpenAPI and rerun the focused tests**

Run: bun run --filter @ayni/api openapi:generate
Run: bun run --filter @ayni/api test -- src/openapi.test.ts
Run: bun run --filter server test -- src/model-versions.test.ts src/sdk-openapi-contract.test.ts src/tflite-contract-validator.test.ts

Expected: all focused tests pass and the generated OpenAPI snapshot includes the optional exact map.

- [x] **Step 5: Commit** the contract, validators, snapshot, and tests as feat: add explicit detection tensor roles.

### Task 2: Edit role maps in the dashboard and preserve them in workflows

**Files:**
- Modify: apps/web/src/app/dashboard/panels/application/model-version-contract-dialog.tsx
- Modify: apps/web/src/app/dashboard/panels/application/workflow-node-catalog.ts and workflow-canvas.tsx
- Test: apps/web/src/app/dashboard/panels/application/model-versions-dialog.test.tsx, workflow-node-catalog.test.ts
- Test: apps/server/src/workflows.test.ts or workflow-version-store.test.ts

**Interfaces:**
- Consumes: Task 1's shared detection contract.
- Produces: Contract editor state and workflow model-node types that retain all four tensorIndices. The existing addModelNode contract copy remains the source of workflow metadata; no second contract representation is introduced.

- [x] **Step 1: Write failing dashboard and workflow tests** that save a non-default index order, reload it from a model version, add that version to a workflow, and assert the immutable published node contains the same map.
- [x] **Step 2: Run the focused tests**

Run: bun run --filter web test -- src/app/dashboard/panels/application/model-versions-dialog.test.tsx src/app/dashboard/panels/application/workflow-node-catalog.test.ts
Run: bun run --filter server test -- src/workflows.test.ts

Expected: the editor or typed workflow node drops or rejects tensorIndices.

- [x] **Step 3: Implement the editor fields and end-to-end typing**. Accept four integer indexes, show validation errors for duplicate/out-of-range values, and preserve the saved map when creating the workflow node.
- [x] **Step 4: Rerun the focused tests**

Run: bun run --filter web test -- src/app/dashboard/panels/application/model-versions-dialog.test.tsx src/app/dashboard/panels/application/workflow-node-catalog.test.ts
Run: bun run --filter server test -- src/workflows.test.ts

Expected: the saved, returned, and published workflow map is identical.

- [x] **Step 5: Commit** the dashboard and propagation tests as feat(web): configure detection tensor roles.

### Task 3: Decode mapped detection tensors in the SDK

**Files:**
- Modify: packages/sdk_flutter/lib/src/workflow_definition_validator.dart and workflow_execution.dart
- Test: packages/sdk_flutter/test/workflow_definition_validator_test.dart and typed_results_test.dart

**Interfaces:**
- Consumes: Task 2's immutable model node output contract.
- Produces: The existing DetectionResult and Detection types from explicit role indexes when tensorIndices is present. Workflows without the map retain the current shape/value-based legacy decoder.

- [x] **Step 1: Write failing validator and decoder tests** for a valid map, missing/unknown/duplicate/out-of-range indexes, a non-permuted and a permuted output order, count zero, count truncation, malformed box/vector/count shapes, and a legacy definition with no map.
- [x] **Step 2: Run the focused SDK tests**

Run: cd packages/sdk_flutter; flutter test test/workflow_definition_validator_test.dart test/typed_results_test.dart

Expected: mapped workflow definitions are rejected or decode according to tensor order; the legacy no-map fixture passes.

- [x] **Step 3: Implement strict workflow map validation and index-based decoding**. Validate the exact map keys and index range at definition load; use count before iterating detections and keep existing threshold, label, and box checks. Use the current legacy decoder only when the field is absent.
- [x] **Step 4: Rerun the focused and full SDK checks**

Run: cd packages/sdk_flutter; flutter test; dart analyze

Expected: all SDK tests pass with no analyzer issues.

- [x] **Step 5: Commit** the SDK decoder and tests as feat(sdk): decode detection tensor roles.

### Task 4: Prepare the 0.3.0 package candidate

**Files:**
- Modify: packages/sdk_flutter/pubspec.yaml, packages/sdk_flutter/CHANGELOG.md, and packages/sdk_flutter/README.md
- Create test: packages/sdk_flutter/test/package_version_test.dart
- Verify: packages/sdk_flutter/test/public_api_surface_test.dart and package validator

**Interfaces:**
- Consumes: Tasks 1–3 and the unchanged public DetectionResult contract.
- Produces: A local 0.3.0 release candidate that documents mapped detection contracts and legacy workflow support.

- [x] **Step 1: Add a package test** asserting the package version is 0.3.0; retain the existing public export test and assert the README documents tensorIndices without importing internal SDK paths.
- [x] **Step 2: Run the new test to verify it fails**

Run: cd packages/sdk_flutter; flutter test test/package_version_test.dart

Expected: FAIL because pubspec.yaml still declares the previous SDK version and the README does not document mapped detection.

- [x] **Step 3: Update package metadata and documentation** to version 0.3.0 after all behavior tests pass. Do not publish or create a permanent registry tag in this task.
- [x] **Step 4: Rerun release checks**

Run: cd packages/sdk_flutter; flutter test; dart analyze; dart run bin/package.dart

Expected: all release checks pass for version 0.3.0.

- [x] **Step 5: Commit** the package metadata and docs as chore(sdk): prepare 0.3.0 detection release.

---

## Completion Gate

Run server/API and dashboard tests, the full SDK test suite, analyzer, and package validator; then require CI review before release. The companion mobile suite plan depends on this candidate and cannot be considered runnable for S2 until ayni_sdk 0.3.0 is published and the native app resolves that exact version.
