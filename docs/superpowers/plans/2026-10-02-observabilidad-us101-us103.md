# Observabilidad US-101–US-103 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement GitHub issues #111 (US-101), #113 (US-102), and #114 (US-103) in order as separate, reviewable PRs that provide a persistent installation identity, a privacy-safe device profile, and a policy-gated structured execution trace.

**Architecture:** The Flutter SDK owns installation identity, device profile, trace creation, and policy caching. A small SDK-authenticated server endpoint returns the existing application telemetry policy; the SDK defaults to no capture when policy has never been fetched. Each eligible `run()` attaches a typed trace to its success result or typed failure, while durable outbox and ingestion remain the later US-106/US-107 work.

**Tech Stack:** Dart/Flutter SDK, small Android/iOS device-profile plugin, Hono/Zod API, Drizzle/Postgres existing telemetry-policy table, Vitest, Flutter tests.

**Spec:** [Observability design](../specs/2026-10-01-observabilidad-validacion-tecnica-design.md)

## Global Constraints

- Keep Android API 26+ and iOS 11.0+ support.
- Telemetry defaults off; unknown policy means no trace capture.
- Never include input image bytes, credentials, hardware identifiers, or arbitrary runtime tensors in traces.
- Structured decoded outputs may include labels, confidences, detection boxes, and booleans.
- Client-supplied experiment fields remain explicitly unverified; server auth identifies only the application credential.
- The control and treatment path use one trace schema; the Android test app remains out of scope.
- Update `Recursos` → `Datos y privacidad` and its tests in the same PR as each story, describing captured/stored/sent fields, policy, consent distinction, retention, and deletion without documenting unshipped behavior as available.
- Do not implement the durable outbox, trace ingestion, dashboard, exports, artifacts, or retention worker in these three stories; those belong to later epic stories.
- Keep the public barrel pinned to explicit `show` exports and update its surface test when adding public types.

## Review Focus

- Corrupt installation-ID storage must rotate to a valid UUID v4 without sending the corrupt value; pin this in `installation_id_store_test.dart`.
- An installation-ID write failure must leave `AyniSdk.isInitialized == false`; pin this in `ayni_sdk_test.dart`.
- Device metadata must never serialize serial numbers, Android IDs, vendor IDs, device names, or other hardware/user identifiers; assert the serialized allowlist in `device_profile_test.dart`.
- A missing or failed telemetry-policy fetch must not block normal workflow/model sync and must leave capture disabled unless a previously cached enabled policy exists; pin both paths in SDK sync tests.
- Run failures after a workflow is selected must preserve the existing `WorkflowError` category and expose a sanitized trace without input bytes; pin success and failure trace behavior in `typed_results_test.dart`.

---

### Task 1: Persist a per-installation UUID (US-101, GitHub #111)

**Files:**
- Create: `packages/sdk_flutter/lib/src/uuid_v4.dart`
- Create: `packages/sdk_flutter/lib/src/installation_id_store.dart`
- Create: `packages/sdk_flutter/test/installation_id_store_test.dart`
- Modify: `packages/sdk_flutter/lib/src/ayni_sdk.dart`
- Modify: `packages/sdk_flutter/test/ayni_sdk_test.dart`
- Modify: `apps/docs/src/content/docs/recursos/datos-y-privacidad.mdx`
- Modify: `apps/docs/src/resources/privacy-page.test.ts`

**Interfaces:**
- Produces internal `String createUuidV4()` and `InstallationIdStore(Directory).loadOrCreate()`.
- The ID file is `<storageDirectory>/installation-id`; only the SDK reads it.
- `AyniSdk.initialize()` ensures the ID exists before returning `ready`; failure returns the existing generic initialization error and retains no singleton.

- [ ] **Step 1: Pin UUID and persistence behavior**

Add tests for a fresh v4 UUID, reload preserving the same UUID, corrupt content replacing it without returning the old value, and a file blocking creation of the storage directory producing a failure.

- [ ] **Step 2: Run the focused store test and confirm it fails**

Run from `packages/sdk_flutter`: `flutter test test/installation_id_store_test.dart`.
Expected: FAIL because the store and UUID generator do not exist.

- [ ] **Step 3: Implement the store with `dart:math Random.secure`**

Generate canonical RFC 4122 UUID v4 bytes, write the ID under app-private SDK storage, validate the complete v4 format on read, and replace invalid content. Do not log or expose the value from `toString()`.

- [ ] **Step 4: Ensure initialization creates the ID**

Add focused SDK tests proving successful initialization creates/reuses the file across SDK reinitialization and failed persistence leaves the singleton reset. Update the privacy page to list the local ID file and its deletion path without implying it is transmitted; pin the statement with the docs test.

- [ ] **Step 5: Run the focused tests and commit the story**

Run from `packages/sdk_flutter`: `flutter test test/installation_id_store_test.dart test/ayni_sdk_test.dart` and `flutter analyze`.
Run from repository root: `bun run --filter docs test`, `bun run --filter docs check-types`, and `bun run --filter docs build`.
Expected: PASS with no analyzer diagnostics.
Commit: `feat(sdk): persist installation diagnostic id`.

---

### Task 2: Capture a privacy-safe device profile (US-102, GitHub #113)

**Files:**
- Modify: `packages/sdk_flutter/pubspec.yaml`
- Modify: `packages/sdk_flutter/pubspec.lock`
- Create: `packages/sdk_flutter/lib/src/device_profile.dart`
- Create: `packages/sdk_flutter/test/device_profile_test.dart`
- Modify: `packages/sdk_flutter/lib/src/ayni_sdk.dart`
- Modify: `packages/sdk_flutter/test/ayni_sdk_test.dart`
- Modify: `packages/sdk_flutter/lib/ayni_sdk.dart`
- Modify: `packages/sdk_flutter/test/public_api_surface_test.dart`
- Modify: `packages/sdk_flutter/README.md`
- Modify: `apps/docs/src/content/docs/recursos/datos-y-privacidad.mdx`
- Modify: `apps/docs/src/resources/privacy-page.test.ts`

**Interfaces:**
- Produces public `Future<DeviceProfile> AyniSdk.getDeviceProfile()` and `DeviceProfile.toJson()` with an explicit allowlist. The method performs no network request or persistence; US-103 reuses the same profile when constructing a trace.
- The profile carries platform, OS/API, model, a coarse RAM range, and SoC when the platform exposes it. RAM unavailable to the SDK is supplied later through typed run context or remains unknown.
- The SDK uses one small native channel to read only the allowlisted model/platform/OS/RAM and available Android SoC fields; no device-info dependency or plugin-wide map is needed.

- [ ] **Step 1: Pin allowlisted profile fields and fallbacks**

Add tests for Android and iOS profile mapping, RAM range bucketing, optional SoC, unknown/failed platform fields, exclusion of serial/device/vendor identifiers from JSON, and `getDeviceProfile()` performing no HTTP requests or writes to `storageDirectory`.

- [ ] **Step 2: Run the focused profile test and confirm it fails**

Run from `packages/sdk_flutter`: `flutter test --no-test-assets flutter_test/device_profile_test.dart`.
Expected: FAIL because the profile type/reader do not exist.

- [ ] **Step 3: Add the native device profile fields**

Implement one native channel for the allowlisted Android/iOS fields. Do not request permissions or capture device name, serial, advertising ID, vendor ID, or plugin-wide data.

- [ ] **Step 4: Attach the profile to trace construction**

Implement `AyniSdk.getDeviceProfile()` as an explicit local read and cache one profile read per SDK instance. On unavailable platform metadata, return an unknown/partial profile without failing app execution. Update the public barrel and API surface test; document the explicit read and the fact that it is not transmitted by this story. Explain how host context supplies or omits fields unavailable from the platform in the privacy page.

- [ ] **Step 5: Run focused Flutter checks and commit the story**

Run from `packages/sdk_flutter`: `dart analyze`, `dart test`, and `flutter test --no-test-assets flutter_test/device_profile_test.dart`.
Run from `apps/docs`: `bun run verify`.
Expected: PASS with no analyzer diagnostics.
Commit: `feat(sdk): capture safe device profile`.

---

### Task 3: Produce policy-gated execution traces (US-103, GitHub #114)

**Files:**
- Create: `packages/api/src/sdk-telemetry-policy.ts`
- Modify: `packages/api/src/sdk-openapi.ts`
- Modify: `packages/api/src/sdk-openapi-contract.test.ts`
- Create: `apps/server/src/sdk-telemetry-policy.ts`
- Create: `apps/server/src/sdk-telemetry-policy.test.ts`
- Modify: `apps/server/src/hono-app.ts`
- Create: `packages/sdk_flutter/lib/src/telemetry_policy_client.dart`
- Create: `packages/sdk_flutter/lib/src/workflow_trace.dart`
- Modify: `packages/sdk_flutter/lib/src/ayni_sdk.dart`
- Modify: `packages/sdk_flutter/lib/src/workflow_execution.dart`
- Modify: `packages/sdk_flutter/lib/ayni_sdk.dart`
- Modify: `packages/sdk_flutter/test/ayni_sdk_test.dart`
- Modify: `packages/sdk_flutter/test/typed_results_test.dart`
- Modify: `packages/sdk_flutter/test/public_api_surface_test.dart`
- Modify: `packages/sdk_flutter/README.md`
- Modify: `apps/docs/src/content/docs/recursos/datos-y-privacidad.mdx`
- Modify: `apps/docs/src/resources/privacy-page.test.ts`

**Interfaces:**
- `GET /sdk/telemetry-policy` accepts only a Bearer SDK credential and returns `{ enabled, retentionDays }`; `applicationId` comes from the verified credential. Missing policy uses the existing disabled default.
- `AyniSdk.sync()` refreshes and persists policy at `<storageDirectory>/diagnostics/telemetry-policy.json` without changing the existing sync result or failing resource synchronization when the policy request is unavailable. A failed refresh preserves the last valid cache; with no valid cache, policy is disabled.
- `AyniSdk.run(workflowId, input, {onExecutionStarted, traceContext})` may attach `WorkflowTrace` to `WorkflowResult.trace` or `WorkflowError.trace`. `WorkflowTraceContext` requires caller-declared `runId` and `repetition`; its other fields are `condition`, `caseId`, `scenario`, `commit`, `datasetId`, `datasetPartition`, `datasetSha256`, `backend`, `network`, `batteryPercent`, `temperatureC`, `ramRange`, `appVersion`, `sdkVersion`, `measurements`, `incidents`, and `validity`. The SDK never fabricates validation context. `TraceMeasurement` has `name`, finite numeric `value`, `unit`, `method`, `source`, and optional `phase`.
- `WorkflowTrace` includes schema version, a generated UUID v4 `traceId`, caller-declared `runId` and `repetition`, installation ID, UTC timestamp, workflow/model versions and hashes, device-only profile, app/SDK version provenance, typed decoded outputs, duration/status, and typed sanitized error. Keep trace types on the public API only through the explicit export list.
- Credentialed policy requests and trace uploads reject cross-origin redirects; signed R2 artifact URLs are never forwarded to another origin (US-107/114).
- A public typed `WorkflowTrace.fromClientExecution(...)` factory creates that same local schema for a control execution performed outside `AyniSdk.run`; it runs no inference, makes no network request, and creates no durable queue. Upload/outbox behavior remains US-106/107.
- Traces are returned locally only. Delivery, durable retry, and server persistence remain US-106/US-107.

- [ ] **Step 1: Add API schema/OpenAPI tests for the SDK telemetry-policy route**

Assert the strict `{ enabled: boolean, retentionDays: 7 | 30 | 90 }` response, no application ID in the body, and the documented `GET /sdk/telemetry-policy` operation.

- [ ] **Step 2: Run focused API tests and confirm they fail**

Run: `bun run --filter @ayni/api test`.
Expected: FAIL because the route schema/OpenAPI operation is missing.

- [ ] **Step 3: Implement the SDK-authenticated policy route**

Use existing credential verification and `getTelemetryPolicy`; return the disabled default for applications with no policy row. Add server tests for missing/invalid/revoked credential, disabled default, enabled policy, and retention values.

- [ ] **Step 4: Refresh and cache policy in SDK sync**

Add a policy request through the existing server URL/credential handling and persist only a schema-valid response. Test that an enabled policy survives SDK reinitialization/offline sync, a successful disabled response replaces it, corrupt cache is treated as unknown/off, and a policy request failure does not change a successful workflow/model sync status. No previously cached value means capture remains disabled.

- [ ] **Step 5: Add typed trace context and serialization tests**

Test control/treatment sharing one schema; exact trace/workflow/model IDs and hashes; classification, detection boxes, boolean and combined outputs; finite measurement values/units; client-reported provenance; and exclusion of image bytes and arbitrary tensor data.

- [ ] **Step 6: Attach traces to success and typed failure outcomes**

Create traces only when policy is enabled. Preserve existing exception categories and sanitized fields while attaching a trace to the `WorkflowError`; attach successful traces to `WorkflowResult`. A trace creation problem must not replace the workflow's original result/error.

- [ ] **Step 7: Pin and verify the public contract**

Export only the trace and context types required by callers, update the exact export-surface test, document the context and local-only delivery boundary in the SDK README, and update the privacy page's network/storage tables for policy GET, cached policy, and in-memory trace data. Keep the page explicit that this story does not upload traces.

- [ ] **Step 8: Run every affected project check and commit the story**

Run from `packages/sdk_flutter`: `flutter test`, `flutter analyze`.
Run from repository root: `bun run --filter @ayni/api test`, `bun run --filter @ayni/api check-types`, `bun run --filter @ayni/api openapi:verify`, `bun run --filter server test`, `bun run --filter server check-types`, `bun run --filter docs test`, `bun run --filter docs check-types`, and `bun run --filter docs build`.
Expected: all commands pass. Commit: `feat(sdk): capture policy-gated workflow traces`.

---

## PR and stack sequence

1. Land the requirements-documentation branch as a documentation-only change before implementation so the three story branches share the approved criteria.
2. Create the #111 branch from the merged requirements PR and open its PR to `main` with `Closes #111`.
3. Create the #113 branch on the #111 branch and open its PR with #111 as base and `Closes #113`. Wait for #111 checks/review, merge it, then rebase #113 onto the updated `main` and retarget its PR base to `main`; wait for its own checks/review before merging.
4. Create the #114 branch on the #113 branch and open its PR with #113 as base and `Closes #114`. Wait for #113 checks/review, merge it, then rebase #114 onto the updated `main` and retarget its PR base to `main`; wait for its own checks/review before merging.
5. Confirm #111, #113, and #114 are closed by their merged PRs and each merged PR has green required checks. US-114 GitHub #327 is a later epic story and is not in this implementation stack.
