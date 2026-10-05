import 'dart:async';
import 'dart:convert';

import 'package:better_fullstack_app/validation/execution/validation_batch_controller.dart';
import 'package:better_fullstack_app/validation/models/experiment_plan.dart';
import 'package:better_fullstack_app/validation/models/validation_run_record.dart';
import 'package:better_fullstack_app/validation/screens/validation_home_page.dart';
import 'package:better_fullstack_app/validation/storage/validation_preferences.dart';
import 'package:better_fullstack_app/validation/validation_lab_launch.dart';
import 'package:better_fullstack_app/validation/validation_performance_trace.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late _FakeRuntime runtime;
  late String planSource;

  setUpAll(() async {
    planSource = await rootBundle.loadString(ExperimentPlan.assetPath);
  });

  setUp(() => runtime = _FakeRuntime(planSource));

  testWidgets('scroll helper finds lazy-list children in both directions', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: ListView.builder(
          key: const ValueKey('validation-home-scroll'),
          scrollCacheExtent: const ScrollCacheExtent.pixels(3000),
          itemCount: 100,
          itemBuilder: (context, index) => SizedBox(
            height: 100,
            child: Text('row $index', key: ValueKey('row-$index')),
          ),
        ),
      ),
    );

    final scrollable = find
        .descendant(
          of: find.byKey(const ValueKey('validation-home-scroll')),
          matching: find.byType(Scrollable),
        )
        .first;
    await _scrollToFinder(tester, find.byKey(const ValueKey('row-90')));
    final offsetAtRow90 = tester
        .state<ScrollableState>(scrollable)
        .position
        .pixels;
    await _scrollToFinder(tester, find.byKey(const ValueKey('row-70')));
    expect(
      tester.state<ScrollableState>(scrollable).position.pixels,
      lessThan(offsetAtRow90),
    );
    await _scrollToFinder(tester, find.byKey(const ValueKey('row-0')));
    expect(find.byKey(const ValueKey('row-0')), findsOneWidget);
  });

  testWidgets('asks only for the SDK Key and exposes one primary action', (
    tester,
  ) async {
    runtime.hasSavedCredentials = false;
    await _pumpHomePage(tester, runtime);

    expect(find.byKey(const ValueKey('sdk-credential')), findsOneWidget);
    expect(find.byKey(const ValueKey('server-url')), findsNothing);
    expect(find.byKey(const ValueKey('condition-selector')), findsNothing);
    expect(find.byKey(const ValueKey('scenario-selector')), findsNothing);
    expect(find.byKey(const ValueKey('prepare-resources')), findsNothing);
    expect(find.byKey(const ValueKey('sync-sdk')), findsNothing);
    expect(_button(tester, 'run-validation').onPressed, isNull);
    await _scrollToFinder(
      tester,
      find.byKey(const ValueKey('validation-events')),
    );
    expect(find.byKey(const ValueKey('validation-events')), findsOneWidget);
  });

  testWidgets('one action runs ready profiles while others stay pending', (
    tester,
  ) async {
    runtime.traceAllowed = true;
    await _pumpHomePage(tester, runtime);
    await tester.enterText(
      find.byKey(const ValueKey('sdk-credential')),
      'private-test-credential',
    );
    await tester.pump();

    expect(find.textContaining('S1, S2'), findsOneWidget);
    expect(_button(tester, 'run-validation').onPressed, isNotNull);
    await tester.tap(find.byKey(const ValueKey('run-validation')));
    await tester.pumpAndSettle();

    expect(runtime.preparedProfileConditions, [
      'INT-01:control',
      'INT-01:treatment',
      'REU-01:control',
      'REU-01:treatment',
    ]);
    expect(runtime.runSuiteCalls, 1);
    expect(runtime.runCalls.any((call) => call.contains(':S1-')), isFalse);
    expect(runtime.runCalls.any((call) => call.contains(':S2-')), isFalse);
    expect(runtime.runCalls.any((call) => call.contains(':REU-01-')), isTrue);
    await _scrollToFinder(tester, find.byKey(const ValueKey('status-text')));
    expect(find.textContaining('Validación parcial terminada'), findsWidgets);
  });

  testWidgets('quick test runs twenty percent and offers the JSONL share', (
    tester,
  ) async {
    runtime.traceAllowed = true;
    await _pumpHomePage(tester, runtime);
    await tester.enterText(
      find.byKey(const ValueKey('sdk-credential')),
      'private-test-credential',
    );
    await tester.pump();

    expect(_button(tester, 'quick-run-validation').onPressed, isNotNull);
    expect(find.textContaining('1.076'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('quick-run-validation')));
    await tester.pumpAndSettle();

    expect(runtime.lastQuickRun, isTrue);
    expect(runtime.pairRunIds.single, startsWith('quick-'));
    expect(runtime.lastSuiteRunCount, 1076);
    await _scrollToFinder(tester, find.byKey(const ValueKey('status-text')));
    expect(find.textContaining('Prueba rápida terminada'), findsWidgets);
    await _scrollToFinder(tester, find.byKey(const ValueKey('share-jsonl')));
    expect(find.byKey(const ValueKey('share-jsonl')), findsOneWidget);
    expect(find.textContaining('estado de captura de trazas'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('share-jsonl')));
    await tester.pumpAndSettle();
    expect(runtime.exportCalls, 1);
  });

  testWidgets('SDK sync error shows per-resource details when available', (
    tester,
  ) async {
    runtime.traceAllowed = true;
    runtime.syncState = const ValidationSyncState(
      status: 'error',
      ready: false,
      issues: ['No se pudo guardar la actualización de Coffee EfficientNetB0.'],
    );
    await _pumpHomePage(tester, runtime);
    await tester.enterText(
      find.byKey(const ValueKey('sdk-credential')),
      'private-test-credential',
    );
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('run-validation')));
    await tester.pumpAndSettle();

    await _scrollToFinder(
      tester,
      find.byKey(const ValueKey('validation-error-card')),
    );
    expect(
      find.textContaining('No se pudo guardar la actualización de Coffee'),
      findsOneWidget,
    );
    expect(runtime.runSuiteCalls, 0);
  });

  testWidgets('offline pre-run sync stops cleanly without stale progress', (
    tester,
  ) async {
    runtime.traceAllowed = true;
    runtime.syncState = const ValidationSyncState(
      status: 'offline',
      ready: false,
    );
    await _pumpHomePage(tester, runtime);
    await tester.enterText(
      find.byKey(const ValueKey('sdk-credential')),
      'private-test-credential',
    );
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('quick-run-validation')));
    await tester.pumpAndSettle();

    expect(runtime.runSuiteCalls, 0);
    await _scrollToFinder(
      tester,
      find.byKey(const ValueKey('validation-progress')),
    );
    expect(find.text('Procesando…'), findsNothing);
    expect(
      find.textContaining('Prueba rápida detenida antes de medir'),
      findsOneWidget,
    );
    expect(runtime.syncTraceUploadCalls, [false]);
    expect(find.textContaining('estado offline'), findsOneWidget);
  });

  testWidgets('a final profile preparation failure writes no suite rows', (
    tester,
  ) async {
    runtime.allProfilesReady = true;
    runtime.traceAllowed = true;
    runtime.failPreparationProfile = 'S2';
    runtime.failPreparationCondition = ValidationCondition.treatment;
    await _pumpHomePage(tester, runtime);
    await tester.enterText(
      find.byKey(const ValueKey('sdk-credential')),
      'private-test-credential',
    );
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('run-validation')));
    await tester.pumpAndSettle();

    expect(runtime.preparedProfileConditions.last, 'S2:treatment');
    expect(runtime.runSuiteCalls, 0);
    expect(runtime.runCalls, isEmpty);
    await _scrollToFinder(
      tester,
      find.byKey(const ValueKey('validation-error-card')),
    );
    expect(find.byKey(const ValueKey('validation-error-card')), findsOneWidget);
  });

  testWidgets('PERF-01 lab launch runs one direct cold-start attempt', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: ValidationHomePage(
          runtime: runtime,
          performanceTrace: const ValidationPerformanceTrace(enabled: false),
          labLaunch: const ValidationLabLaunch(
            condition: ValidationCondition.control,
            runLabel: 'PERF-01-007',
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(runtime.preparedConditions, [ValidationCondition.control]);
    expect(runtime.runCalls, ['control:PERF-01:false']);
    expect(runtime.coldStartRunLabels, ['PERF-01-007']);
    expect(runtime.syncVerificationCalls, isEmpty);
    await _scrollToFinder(
      tester,
      find.byKey(const ValueKey('validation-events')),
    );
    expect(find.textContaining('PERF-01-007'), findsOneWidget);
  });

  testWidgets('PERF-01 lab launch prepares only the SDK condition', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: ValidationHomePage(
          runtime: runtime,
          performanceTrace: const ValidationPerformanceTrace(enabled: false),
          labLaunch: const ValidationLabLaunch(
            condition: ValidationCondition.treatment,
            runLabel: 'PERF-01-030',
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(runtime.preparedConditions, [ValidationCondition.treatment]);
    expect(runtime.runCalls, ['treatment:PERF-01:false']);
    expect(runtime.coldStartRunLabels, ['PERF-01-030']);
    expect(runtime.syncVerificationCalls, [true]);
    await _scrollToFinder(
      tester,
      find.byKey(const ValueKey('validation-events')),
    );
    expect(find.textContaining('PERF-01-030'), findsOneWidget);
  });

  testWidgets(
    'one action prepares both conditions, runs phases, and syncs SDK',
    (tester) async {
      runtime.allProfilesReady = true;
      runtime.hasSavedCredentials = false;
      await _pumpHomePage(tester, runtime);
      await tester.enterText(
        find.byKey(const ValueKey('sdk-credential')),
        'private-test-credential',
      );
      await tester.pump();
      expect(find.byKey(const ValueKey('validation-error-card')), findsNothing);
      expect(find.textContaining('12 fases automáticas'), findsOneWidget);
      expect(_button(tester, 'run-validation').onPressed, isNotNull);
      await tester.tap(find.byKey(const ValueKey('run-validation')));
      await tester.pumpAndSettle();

      expect(find.byType(AlertDialog), findsOneWidget);
      expect(
        find.textContaining('salidas tipadas decodificadas'),
        findsOneWidget,
      );
      expect(runtime.prepareCalls, 0);
      await tester.tap(find.text('Ejecutar sin trazas'));
      await tester.pumpAndSettle();

      expect(runtime.savedCredentials, 1);
      expect(runtime.preparedProfileConditions, [
        'INT-01:control',
        'INT-01:treatment',
        'S1:control',
        'S1:treatment',
        'REU-01:control',
        'REU-01:treatment',
        'S2:control',
        'S2:treatment',
      ]);
      expect(runtime.syncVerificationCalls, [true, true, true, true, false]);
      expect(runtime.syncTraceUploadCalls, [false, false, false, false, true]);
      expect(runtime.runSuiteCalls, 1);
      expect(runtime.runCalls, hasLength(24));
      expect(runtime.runCalls.take(4), [
        'control:PERF-02-WARMUP:false',
        'treatment:PERF-02-WARMUP:false',
        'control:PERF-02:false',
        'treatment:PERF-02:false',
      ]);
      await _scrollToFinder(
        tester,
        find.byKey(const ValueKey('validation-progress-text')),
      );
      expect(find.textContaining('100%'), findsOneWidget);
      await _scrollToFinder(
        tester,
        find.byKey(const ValueKey('validation-events')),
      );
      expect(find.textContaining('Validación terminada'), findsWidgets);
      expect(
        find.textContaining('confirma la recepción de trazas'),
        findsOneWidget,
      );
    },
  );

  testWidgets('requires trace authorization and can run without it', (
    tester,
  ) async {
    runtime.allProfilesReady = true;
    runtime.hasSavedCredentials = false;
    await _pumpHomePage(tester, runtime);
    await tester.enterText(
      find.byKey(const ValueKey('sdk-credential')),
      'private-test-credential',
    );
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('run-validation')));
    await tester.pump(const Duration(milliseconds: 500));
    expect(runtime.prepareCalls, 0);

    await tester.tap(find.text('Autorizar y ejecutar'));
    await tester.pumpAndSettle();

    expect(runtime.tracePermissionChanges, [true]);
    expect(
      runtime.runCalls
          .where((call) => call.startsWith('treatment:'))
          .every((call) => call.endsWith(':true')),
      isTrue,
    );
    expect(
      runtime.runCalls
          .where((call) => call.startsWith('control:'))
          .every((call) => call.endsWith(':false')),
      isTrue,
    );
  });

  testWidgets('updates the one action to cancel a running validation', (
    tester,
  ) async {
    runtime.allProfilesReady = true;
    runtime.traceAllowed = true;
    runtime.holdRun = true;
    await _pumpHomePage(tester, runtime);
    await tester.tap(find.byKey(const ValueKey('run-validation')));
    await tester.pump();
    await tester.pump();

    expect(runtime.runStarted.isCompleted, isTrue);
    expect(find.text('Cancelar validación'), findsOneWidget);
    expect(
      find.byKey(const ValueKey('validation-progress-text')),
      findsOneWidget,
    );

    await tester.tap(find.byKey(const ValueKey('run-validation')));
    await tester.pump(const Duration(milliseconds: 500));

    expect(runtime.cancelCalls, 1);
    await _scrollToFinder(
      tester,
      find.byKey(const ValueKey('validation-events')),
    );
    expect(find.textContaining('Validación cancelada'), findsOneWidget);
  });

  testWidgets('trace permission can be revoked from the options menu', (
    tester,
  ) async {
    runtime.allProfilesReady = true;
    runtime.traceAllowed = true;
    await _pumpHomePage(tester, runtime);
    await tester.tap(find.byType(PopupMenuButton<String>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Revocar permiso de trazas'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Revocar permiso'));
    await tester.pumpAndSettle();

    expect(runtime.tracePermissionChanges, [false]);
    expect(runtime.traceAllowed, isFalse);
  });

  testWidgets('fits common phone and tablet widths without overflow', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    for (final width in [320.0, 375.0, 414.0, 768.0]) {
      tester.view.physicalSize = Size(width, 780);
      await _pumpHomePage(tester, runtime);
      await tester.ensureVisible(find.byKey(const ValueKey('run-validation')));

      expect(
        tester.getSize(find.byKey(const ValueKey('run-validation'))).width,
        lessThan(width),
      );
      expect(tester.takeException(), isNull);
    }
  });
}

Future<void> _pumpHomePage(WidgetTester tester, _FakeRuntime runtime) async {
  await tester.pumpWidget(
    MaterialApp(home: ValidationHomePage(runtime: runtime)),
  );
  for (var frame = 0; frame < 100; frame++) {
    if (find.text('Conexión SDK').evaluate().isNotEmpty) return;
    await tester.pump(const Duration(milliseconds: 16));
  }
  fail('La pantalla de validación no terminó de iniciar.');
}

ButtonStyleButton _button(WidgetTester tester, String key) =>
    tester.widget<ButtonStyleButton>(find.byKey(ValueKey(key)));

Future<void> _scrollToFinder(WidgetTester tester, Finder finder) async {
  const scrollKey = ValueKey('validation-home-scroll');
  final scrollable = find
      .descendant(of: find.byKey(scrollKey), matching: find.byType(Scrollable))
      .first;
  var delta = 300.0;
  if (finder.evaluate().isEmpty) {
    final position = tester.state<ScrollableState>(scrollable).position;
    position.jumpTo(position.minScrollExtent);
    await tester.pump();
  } else {
    final viewport = tester.getRect(find.byKey(scrollKey));
    final target = tester.getRect(finder.first);
    if (target.bottom < viewport.top) delta = -300;
  }
  if (finder.evaluate().isEmpty) {
    await tester.scrollUntilVisible(finder, delta, scrollable: scrollable);
  } else {
    await tester.scrollUntilVisible(finder, delta, scrollable: scrollable);
  }
  await tester.ensureVisible(finder.first);
  await tester.pump();
}

class _FakeRuntime implements ValidationHomeRuntime {
  _FakeRuntime(this.planSource);

  final String planSource;
  bool failPreparation = false;
  String? failPreparationProfile;
  ValidationCondition? failPreparationCondition;
  bool allProfilesReady = false;
  bool hasSavedCredentials = true;
  bool traceAllowed = false;
  bool holdRun = false;
  int prepareCalls = 0;
  int savedCredentials = 0;
  int cancelCalls = 0;
  final preparedConditions = <ValidationCondition>[];
  final preparedProfileConditions = <String>[];
  final coldStartRunLabels = <String?>[];
  final syncVerificationCalls = <bool>[];
  final syncTraceUploadCalls = <bool>[];
  final syncProfileIds = <String>[];
  final runCalls = <String>[];
  final tracePermissionChanges = <bool>[];
  int runSuiteCalls = 0;
  bool? lastQuickRun;
  int lastSuiteRunCount = 0;
  int exportCalls = 0;
  final pairRunIds = <String>[];
  ValidationSyncState syncState = const ValidationSyncState(
    status: 'upToDate',
    ready: true,
    workflowVersion: '1.0.0',
  );
  final runStarted = Completer<void>();
  Completer<BatchRunSummary>? activeRun;

  ExperimentPlan get plan {
    final source = (jsonDecode(planSource) as Map).cast<String, Object?>();
    final profiles = (source['resourceProfiles'] as List).cast<Map>();
    if (allProfilesReady) {
      final template = jsonDecode(jsonEncode(profiles.first)) as Map;
      for (var index = 0; index < profiles.length; index++) {
        final id = profiles[index]['id'] as String;
        if (profiles[index]['status'] == 'ready') continue;
        final profile = jsonDecode(jsonEncode(template)) as Map;
        profile['id'] = id;
        profile['workflowId'] = 'workflow-$id';
        profile['workflowVersionId'] = 'workflow-version-$id';
        final requirement =
            (profile['modelRequirements'] as List).single as Map;
        requirement['nodeId'] = 'model-node-$id';
        requirement['modelVersionId'] = 'model-version-$id';
        profiles[index] = profile;
      }
    }
    return ExperimentPlan.fromJson(source);
  }

  @override
  Future<ExperimentPlan> loadPlan() async => plan;

  @override
  Future<ValidationSdkCredentials?> readCredentials() async =>
      hasSavedCredentials
      ? const ValidationSdkCredentials(
          serverUrl: 'https://validation.example.test',
          credential: 'private-test-credential',
        )
      : null;

  @override
  Future<bool> readTracePermission() async => traceAllowed;

  @override
  Future<bool> hasJsonl() async => false;

  @override
  Future<void> saveCredentials(ValidationSdkCredentials credentials) async {
    savedCredentials++;
  }

  @override
  Future<ValidationPreparationState> prepareResources({
    required ValidationResourceProfile profile,
    required ValidationSdkCredentials credentials,
    required ValidationCondition condition,
    void Function(int receivedBytes, int totalBytes)? onDownloadProgress,
  }) async {
    prepareCalls++;
    preparedConditions.add(condition);
    preparedProfileConditions.add('${profile.id}:${condition.name}');
    if (failPreparation ||
        (failPreparationProfile == profile.id &&
            (failPreparationCondition == null ||
                failPreparationCondition == condition))) {
      throw StateError('preparation failed');
    }
    onDownloadProgress?.call(10, 10);
    return ValidationPreparationState(
      datasetVersion: '1.0.0',
      datasetSha256: 'a' * 64,
      caseCount: 2,
      resourcesSummary: '${condition.name} preparado',
    );
  }

  @override
  Future<ValidationSyncState> synchronizeSdk({
    required ValidationResourceProfile profile,
    bool verifyWorkflow = true,
    bool uploadPendingTraces = true,
  }) async {
    syncVerificationCalls.add(verifyWorkflow);
    syncTraceUploadCalls.add(uploadPendingTraces);
    syncProfileIds.add(profile.id);
    return syncState;
  }

  @override
  Future<BatchRunSummary> runSuite({
    required String pairRunId,
    required List<ValidationCondition> conditions,
    bool quickRun = false,
    required bool captureTrace,
    required Future<bool> Function() isCancelled,
    required void Function(ValidationRunRecord record) onRecord,
    required void Function(ValidationSuiteProgress progress) onProgress,
  }) async {
    runSuiteCalls++;
    lastQuickRun = quickRun;
    pairRunIds.add(pairRunId);
    final readyProfileIds = plan.resourceProfiles
        .where((profile) => profile.isConfigured)
        .map((profile) => profile.id)
        .toSet();
    final scenarios = plan.scenarios
        .where(
          (scenario) =>
              {
                ValidationPhase.warmup,
                ValidationPhase.measured,
                ValidationPhase.stress,
              }.contains(scenario.phase) &&
              readyProfileIds.contains(scenario.resourceProfileId),
        )
        .toList();
    for (final scenario in scenarios) {
      for (final condition in conditions) {
        runCalls.add(
          '${condition.name}:${scenario.id}:${condition == ValidationCondition.treatment && captureTrace}',
        );
      }
    }
    if (!runStarted.isCompleted) runStarted.complete();
    final total = scenarios.fold<int>(0, (sum, scenario) {
      final repetitions = quickRun
          ? (scenario.repetitions * 20 + 99) ~/ 100
          : scenario.repetitions;
      return sum + repetitions * conditions.length;
    });
    lastSuiteRunCount = total;
    final summary = holdRun
        ? await (activeRun = Completer<BatchRunSummary>()).future
        : BatchRunSummary(
            attempted: total,
            successes: total,
            errors: 0,
            cancelled: 0,
            completedBlockSizes: const [],
            stoppedByCancellation: false,
          );
    final last = scenarios.last;
    onProgress(
      ValidationSuiteProgress(
        completedAttempts: summary.attempted,
        totalAttempts: total,
        profileId: last.resourceProfileId!,
        scenarioId: last.id,
        phase: last.phase,
        condition: conditions.last,
      ),
    );
    return summary;
  }

  @override
  Future<BatchRunSummary> runPhase({
    required ValidationResourceProfile profile,
    required String pairRunId,
    required ValidationCondition condition,
    required String scenarioId,
    required ValidationPhase phase,
    String? coldStartRunLabel,
    required bool captureTrace,
    required Future<bool> Function() isCancelled,
    required void Function(ValidationRunRecord record) onRecord,
  }) {
    runCalls.add('${condition.name}:$scenarioId:$captureTrace');
    coldStartRunLabels.add(coldStartRunLabel);
    if (!runStarted.isCompleted) runStarted.complete();
    final scenario = plan.scenarios.singleWhere(
      (item) => item.id == scenarioId,
    );
    if (holdRun) {
      activeRun = Completer<BatchRunSummary>();
      return activeRun!.future;
    }
    final repetitions = coldStartRunLabel == null ? scenario.repetitions : 1;
    return Future.value(
      BatchRunSummary(
        attempted: repetitions,
        successes: repetitions,
        errors: 0,
        cancelled: 0,
        completedBlockSizes: coldStartRunLabel == null
            ? scenario.blockSizes
            : const [],
        stoppedByCancellation: false,
      ),
    );
  }

  @override
  Future<void> cancel() async {
    cancelCalls++;
    activeRun?.complete(
      BatchRunSummary(
        attempted: 1,
        successes: 0,
        errors: 0,
        cancelled: 1,
        completedBlockSizes: const [],
        stoppedByCancellation: true,
      ),
    );
  }

  @override
  Future<void> setTracePermission(bool allowed) async {
    tracePermissionChanges.add(allowed);
    traceAllowed = allowed;
  }

  @override
  Future<void> exportJsonl() async {
    exportCalls++;
  }

  @override
  Future<void> dispose() async {}
}
