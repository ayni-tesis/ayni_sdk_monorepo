# Native PERF-01 Macrobenchmark Implementation Plan

> **For agentic workers:** Implement this plan inline, task by task. Keep the standard validation APK's one-button flow unchanged.

**Goal:** Measure 30 cold app starts and first inferences for each validation condition on physical Android devices, with raw Macrobenchmark JSON and Perfetto traces.

**Architecture:** Add a separate AndroidX Macrobenchmark test module and a benchmark-only app build variant. The benchmark launches one isolated PERF-01 case per cold process; app data and verified artifacts persist between iterations. The normal APK does not expose lab controls.

**Tech Stack:** Flutter, Kotlin, Android Gradle Plugin 9.1, AndroidX Macrobenchmark 1.5.0, UI Automator, Perfetto.

**Spec:** `apps/native/assets/validation/experiment_plan.json` and the thesis Plan PERF-01 procedure.

## Global Constraints

- Keep the normal selector APK on `ayni_sdk 0.2.0` and the existing one-button flow.
- Support Android API 26+, but only report Macrobenchmark measurements from the physical devices named in the frozen thesis protocol.
- Run 30 labeled cold starts per device and condition; preserve the app data directory and downloaded hashes between process restarts.
- Keep the SDK credential out of the benchmark source, intent arguments, and generated artifacts.
- Do not mark physical measurements complete until the benchmark runs on the thesis devices.

## Review Focus

- Each iteration kills only the process and retains model/dataset/SDK files; test that launch mode does not clear app data.
- Each iteration runs exactly one `PERF-01` inference and stores a row labeled `PERF-01-001` through `PERF-01-030`.
- The control and treatment variants execute only their intended condition; assert their run records.
- Trace markers bracket app launch-to-first-inference and first inference without enabling markers in normal builds.
- Benchmark output contains per-iteration JSON and system traces and never includes credentials, image bytes, or model tensors.

---

### Task 1: AndroidX cold-start and first-inference harness

**Files:**
- Modify: `apps/native/android/settings.gradle.kts`
- Modify: `apps/native/android/app/build.gradle.kts`
- Create: `apps/native/android/app/src/benchmark/AndroidManifest.xml`
- Create: `apps/native/android/macrobenchmark/build.gradle.kts`
- Create: `apps/native/android/macrobenchmark/src/main/AndroidManifest.xml`
- Create: `apps/native/android/macrobenchmark/src/main/kotlin/com/ayni/validation/Perf01ColdStartBenchmark.kt`
- Modify: `apps/native/lib/validation/execution/validation_batch_controller.dart`
- Modify: `apps/native/lib/validation/screens/validation_home_page.dart`
- Modify: `apps/native/android/app/src/main/kotlin/com/example/better_fullstack_app/MainActivity.kt`
- Test: `apps/native/test/validation/execution/validation_batch_controller_test.dart`
- Modify: `apps/native/README.md`

**Interfaces:** Macrobenchmark launches the benchmark-only app flavor with a PERF-01 repetition label and condition. The Dart app executes one case, appends the existing `ValidationRunRecord`, then returns to idle. AndroidX reports startup timing and captures the first-inference section; app-private records remain exportable from the normal JSONL store.

- [x] Add a regression test proving the PERF-01 test path records one requested label and does not enter the regular warmup/measured/stress batch.
- [x] Run the focused Flutter test and observe it fail before implementation.
- [x] Add the benchmark app variant and AndroidX Macrobenchmark module with `StartupTimingMetric`, cold process starts, 30 iterations, and one PERF-01 case per iteration.
- [x] Add a benchmark-only launch contract for condition and repetition; reject malformed labels and keep the regular app launch unchanged.
- [ ] Run the full Android assemble and connected benchmark; Kotlin benchmark sources compile, but Flutter AOT is blocked by Windows Application Control on this host.
- [x] Document device setup, commands, and evidence in the native README.

Verification: all 107 Flutter tests pass; `flutter analyze` reports no issues; `:macrobenchmark:compileBenchmarkKotlin` passes. A physical Samsung SM-A556E is connected over ADB, but `:app:assembleBenchmark` cannot finish until the administrator allows the official Flutter AOT compiler under the existing Windows Application Control policy. No benchmark result is claimed yet.
