import 'dart:async';
import 'dart:convert';

import 'package:better_fullstack_app/validation/execution/validation_batch_controller.dart';
import 'package:better_fullstack_app/validation/models/experiment_plan.dart';
import 'package:better_fullstack_app/validation/models/validation_run_record.dart';
import 'package:better_fullstack_app/validation/screens/validation_home_page.dart';
import 'package:better_fullstack_app/validation/storage/validation_preferences.dart';
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
    expect(find.byKey(const ValueKey('validation-events')), findsOneWidget);
  });

  testWidgets(
    'one action prepares both conditions, runs phases, and syncs SDK',
    (tester) async {
      runtime.hasSavedCredentials = false;
      await _pumpHomePage(tester, runtime);
      await tester.enterText(
        find.byKey(const ValueKey('sdk-credential')),
        'private-test-credential',
      );
      await tester.pump();
      expect(find.byKey(const ValueKey('validation-error-card')), findsNothing);
      expect(find.textContaining('3 fases automáticas'), findsOneWidget);
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
      expect(runtime.preparedConditions, [
        ValidationCondition.control,
        ValidationCondition.treatment,
      ]);
      expect(runtime.syncVerificationCalls, [true, false]);
      expect(runtime.runCalls, [
        'control:PERF-02-WARMUP:false',
        'control:PERF-02:false',
        'control:PERF-04:false',
        'treatment:PERF-02-WARMUP:false',
        'treatment:PERF-02:false',
        'treatment:PERF-04:false',
      ]);
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
  bool hasSavedCredentials = true;
  bool traceAllowed = false;
  bool holdRun = false;
  int prepareCalls = 0;
  int savedCredentials = 0;
  int cancelCalls = 0;
  final preparedConditions = <ValidationCondition>[];
  final syncVerificationCalls = <bool>[];
  final runCalls = <String>[];
  final tracePermissionChanges = <bool>[];
  final runStarted = Completer<void>();
  Completer<BatchRunSummary>? activeRun;

  ExperimentPlan get plan {
    final source = (jsonDecode(planSource) as Map).cast<String, Object?>();
    final profiles = (source['resourceProfiles'] as List).cast<Map>();
    final profile = profiles.single;
    profile['datasetVersionId'] = 'dataset-version-1';
    profile['datasetSha256'] = 'a' * 64;
    profile['controlModelVersionId'] = 'model-version-1';
    profile['controlModelSha256'] = 'b' * 64;
    profile['treatmentModelVersionId'] = 'model-version-1';
    profile['treatmentModelSha256'] = 'b' * 64;
    profile['treatmentWorkflowId'] = 'workflow-1';
    profile['treatmentWorkflowVersionId'] = 'workflow-version-1';
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
    if (failPreparation) throw StateError('preparation failed');
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
    bool verifyWorkflow = true,
  }) async {
    syncVerificationCalls.add(verifyWorkflow);
    return const ValidationSyncState(
      status: 'upToDate',
      ready: true,
      workflowVersion: '1.0.0',
    );
  }

  @override
  Future<BatchRunSummary> runPhase({
    required ValidationResourceProfile profile,
    required String pairRunId,
    required ValidationCondition condition,
    required String scenarioId,
    required ValidationPhase phase,
    required bool captureTrace,
    required Future<bool> Function() isCancelled,
    required void Function(ValidationRunRecord record) onRecord,
  }) {
    runCalls.add('${condition.name}:$scenarioId:$captureTrace');
    if (!runStarted.isCompleted) runStarted.complete();
    final scenario = plan.scenarios.singleWhere(
      (item) => item.id == scenarioId,
    );
    if (holdRun) {
      activeRun = Completer<BatchRunSummary>();
      return activeRun!.future;
    }
    return Future.value(
      BatchRunSummary(
        attempted: scenario.repetitions,
        successes: scenario.repetitions,
        errors: 0,
        cancelled: 0,
        completedBlockSizes: scenario.blockSizes,
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
  Future<void> exportJsonl() async {}

  @override
  Future<void> dispose() async {}
}
