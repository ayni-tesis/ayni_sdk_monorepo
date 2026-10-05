import 'package:better_fullstack_app/main.dart';
import 'package:better_fullstack_app/validation/models/experiment_plan.dart';
import 'package:better_fullstack_app/validation/screens/validation_home_page.dart';
import 'package:better_fullstack_app/validation/storage/validation_preferences.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';

void main() {
  testWidgets('renders the validation operator app', (tester) async {
    await tester.pumpWidget(BetterFullstackApp(runtime: _BootstrapRuntime()));
    await tester.pumpAndSettle();
    expect(find.text('Validación'), findsOneWidget);
    expect(find.byKey(const ValueKey('validation-error-card')), findsNothing);
  });
}

class _BootstrapRuntime implements ValidationHomeRuntime {
  @override
  Future<ExperimentPlan> loadPlan() => ExperimentPlan.load(rootBundle);

  @override
  Future<ValidationSdkCredentials?> readCredentials() async => null;

  @override
  Future<bool> readTracePermission() async => false;

  @override
  Future<bool> hasJsonl() async => false;

  @override
  Future<void> dispose() async {}

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
