import 'dart:async';
import 'dart:convert';

import 'package:better_fullstack_app/validation/execution/validation_batch_controller.dart';
import 'package:better_fullstack_app/validation/models/experiment_plan.dart';
import 'package:better_fullstack_app/validation/models/validation_run_record.dart';
import 'package:better_fullstack_app/validation/screens/validation_home_page.dart';
import 'package:better_fullstack_app/validation/storage/validation_preferences.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late _FakeRuntime runtime;
  late String planSource;

  setUpAll(() async {
    planSource = await rootBundle.loadString(ExperimentPlan.assetPath);
  });

  setUp(() => runtime = _FakeRuntime(planSource));

  testWidgets('scrolls to lazy-list children in either direction', (
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

  testWidgets('prefills the production server URL without a credential', (
    tester,
  ) async {
    runtime.hasSavedCredentials = false;
    await _pumpHomePage(tester, _app(runtime));

    final serverUrl = tester.widget<TextField>(
      find.byKey(const ValueKey('server-url')),
    );
    final credential = tester.widget<TextField>(
      find.byKey(const ValueKey('sdk-credential')),
    );

    expect(
      serverUrl.controller!.text,
      'https://ayni-sdk-monorepo-server.vercel.app/',
    );
    expect(credential.controller!.text, isEmpty);
  });

  testWidgets('disables execution until verified resources are prepared', (
    tester,
  ) async {
    await _pumpHomePage(tester, _app(runtime));

    expect(find.textContaining('ZIP'), findsOneWidget);
    await _scrollToFinder(
      tester,
      find.text(ValidationPreferences.tracePermissionDisclosure),
    );
    expect(
      find.text(ValidationPreferences.tracePermissionDisclosure),
      findsOneWidget,
    );
    await _scrollToKey(tester, 'run-batch');
    expect(_button(tester, 'run-batch').onPressed, isNull);

    await _scrollToKey(tester, 'prepare-resources');
    await tester.tap(find.byKey(const ValueKey('prepare-resources')));
    await tester.pumpAndSettle();
    expect(runtime.prepareCalls, 1);
    await _scrollToKey(tester, 'run-batch');
    expect(_button(tester, 'run-batch').onPressed, isNotNull);
  });

  testWidgets('disables old resources when re-preparation fails', (
    tester,
  ) async {
    await _pumpHomePage(tester, _app(runtime));
    await _scrollToKey(tester, 'prepare-resources');
    await tester.tap(find.byKey(const ValueKey('prepare-resources')));
    await tester.pumpAndSettle();
    await _scrollToKey(tester, 'run-batch');
    expect(_button(tester, 'run-batch').onPressed, isNotNull);

    runtime.failPreparation = true;
    await _scrollToKey(tester, 'prepare-resources');
    await tester.tap(find.byKey(const ValueKey('prepare-resources')));
    await tester.pumpAndSettle();
    await _scrollToKey(tester, 'run-batch');
    expect(_button(tester, 'run-batch').onPressed, isNull);
  });

  testWidgets('preparation never performs SDK sync; sync stays explicit', (
    tester,
  ) async {
    await _pumpHomePage(tester, _app(runtime));
    await _selectTreatment(tester);
    await _scrollToKey(tester, 'prepare-resources');
    await tester.tap(find.byKey(const ValueKey('prepare-resources')));
    await tester.pumpAndSettle();

    expect(runtime.syncCalls, 0);
    await _scrollToKey(tester, 'run-batch');
    expect(_button(tester, 'run-batch').onPressed, isNull);
    expect(_button(tester, 'sync-sdk').onPressed, isNotNull);
    await tester.tap(find.byKey(const ValueKey('sync-sdk')));
    await tester.pumpAndSettle();
    expect(runtime.syncCalls, 1);
    expect(_button(tester, 'run-batch').onPressed, isNotNull);
    await _scrollToFinder(tester, find.textContaining('dashboard'));
    expect(find.textContaining('dashboard'), findsOneWidget);
  });

  testWidgets('shows run progress and cancellation', (tester) async {
    await _pumpHomePage(tester, _app(runtime));
    await _scrollToKey(tester, 'prepare-resources');
    await tester.tap(find.byKey(const ValueKey('prepare-resources')));
    await tester.pumpAndSettle();
    await _scrollToKey(tester, 'run-batch');
    await tester.tap(find.byKey(const ValueKey('run-batch')));
    await tester.pump();
    expect(runtime.runStarted.isCompleted, isTrue);

    expect(find.text('Ejecutando lote…'), findsOneWidget);
    expect(_button(tester, 'cancel-batch').onPressed, isNotNull);
    await tester.tap(find.byKey(const ValueKey('cancel-batch')));
    await tester.pump();
    await tester.pump();

    expect(runtime.cancelCalls, 1);
    await _scrollToFinder(tester, find.textContaining('cancelad'));
    expect(find.textContaining('cancelad'), findsOneWidget);
  });

  testWidgets('exports local JSONL and revocation clears queued traces', (
    tester,
  ) async {
    runtime.jsonlPresent = true;
    runtime.traceAllowed = true;
    await _pumpHomePage(tester, _app(runtime));

    await _scrollToKey(tester, 'export-jsonl');
    await tester.tap(find.byKey(const ValueKey('export-jsonl')));
    await tester.pumpAndSettle();
    expect(runtime.exportCalls, 1);

    await _scrollToFinder(
      tester,
      find.byKey(const ValueKey('trace-permission-switch')),
    );
    await tester.tap(find.byKey(const ValueKey('trace-permission-switch')));
    await tester.pumpAndSettle();
    expect(runtime.tracePermissionChanges, [false]);
  });

  testWidgets('rolls back trace permission when enabling it fails', (
    tester,
  ) async {
    runtime.failTracePermission = true;
    await _pumpHomePage(tester, _app(runtime));
    await _scrollToKey(tester, 'trace-permission-switch');

    await tester.tap(find.byKey(const ValueKey('trace-permission-switch')));
    await tester.pumpAndSettle();

    final switchTile = tester.widget<SwitchListTile>(
      find.byKey(const ValueKey('trace-permission-switch')),
    );
    expect(switchTile.value, isFalse);
    expect(runtime.traceAllowed, isFalse);
    expect(runtime.tracePermissionChanges, [true]);
  });
}

MaterialApp _app(_FakeRuntime runtime) =>
    MaterialApp(home: ValidationHomePage(runtime: runtime));

Future<void> _pumpHomePage(WidgetTester tester, Widget app) async {
  await tester.pumpWidget(app);
  for (var frame = 0; frame < 100; frame++) {
    if (find.text('Perfil de recursos').evaluate().isNotEmpty) {
      return;
    }
    await tester.pump(const Duration(milliseconds: 16));
  }
  fail('La pantalla de validación no terminó de iniciar.');
}

Future<void> _scrollToKey(WidgetTester tester, String key) async {
  await _scrollToFinder(tester, find.byKey(ValueKey(key)));
}

Future<void> _scrollToFinder(WidgetTester tester, Finder finder) async {
  final scrollable = find
      .descendant(
        of: find.byKey(const ValueKey('validation-home-scroll')),
        matching: find.byType(Scrollable),
      )
      .first;

  if (finder.evaluate().isEmpty) {
    final position = tester.state<ScrollableState>(scrollable).position;
    position.jumpTo(position.minScrollExtent);
    await tester.pump();
  }
  if (finder.evaluate().isEmpty) {
    await tester.scrollUntilVisible(finder, 300, scrollable: scrollable);
  }
  await tester.ensureVisible(finder.first);
  await tester.pump();
}

ButtonStyleButton _button(WidgetTester tester, String key) =>
    tester.widget<ButtonStyleButton>(find.byKey(ValueKey(key)));

Future<void> _selectTreatment(WidgetTester tester) async {
  await _scrollToKey(tester, 'condition-selector');
  await tester.tap(find.byKey(const ValueKey('condition-selector')));
  await tester.pumpAndSettle();
  await tester.tap(find.text('ayni_sdk').last);
  await tester.pumpAndSettle();
}

class _FakeRuntime implements ValidationHomeRuntime {
  _FakeRuntime(this.planSource);

  final String planSource;
  int prepareCalls = 0;
  int syncCalls = 0;
  int cancelCalls = 0;
  int exportCalls = 0;
  bool failPreparation = false;
  bool failTracePermission = false;
  bool hasSavedCredentials = true;
  bool traceAllowed = false;
  bool jsonlPresent = false;
  final tracePermissionChanges = <bool>[];
  final Completer<void> runStarted = Completer<void>();
  Completer<BatchRunSummary>? activeRun;

  @override
  Future<ExperimentPlan> loadPlan() async {
    final plan = (jsonDecode(planSource) as Map).cast<String, Object?>();
    final profiles = (plan['resourceProfiles'] as List).cast<Map>();
    final profile = profiles.single;
    profile['datasetVersionId'] = 'dataset-version-1';
    profile['datasetSha256'] = 'a' * 64;
    profile['controlModelVersionId'] = 'model-version-1';
    profile['controlModelSha256'] = 'b' * 64;
    profile['treatmentModelVersionId'] = 'model-version-1';
    profile['treatmentModelSha256'] = 'b' * 64;
    profile['treatmentWorkflowId'] = 'workflow-1';
    profile['treatmentWorkflowVersionId'] = 'workflow-version-1';
    return ExperimentPlan.fromJson(plan);
  }

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
  Future<bool> hasJsonl() async => jsonlPresent;

  @override
  Future<void> saveCredentials(ValidationSdkCredentials credentials) async {}

  @override
  Future<ValidationPreparationState> prepareResources({
    required ValidationResourceProfile profile,
    required ValidationSdkCredentials credentials,
    required ValidationCondition condition,
    void Function(int receivedBytes, int totalBytes)? onDownloadProgress,
  }) async {
    prepareCalls++;
    if (failPreparation) throw StateError('re-preparation failed');
    onDownloadProgress?.call(10, 10);
    return ValidationPreparationState(
      datasetVersion: '1.0.0',
      datasetSha256: 'a' * 64,
      caseCount: 2,
      resourcesSummary: condition == ValidationCondition.control
          ? 'Modelo directo verificado'
          : 'Workflow definido; sincronización explícita pendiente',
    );
  }

  @override
  Future<ValidationSyncState> synchronizeSdk() async {
    syncCalls++;
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
    if (!runStarted.isCompleted) runStarted.complete();
    activeRun = Completer<BatchRunSummary>();
    return activeRun!.future;
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
    if (failTracePermission) throw StateError('trace purge failed');
    traceAllowed = allowed;
  }

  @override
  Future<void> exportJsonl() async => exportCalls++;

  @override
  Future<void> dispose() async {}
}
