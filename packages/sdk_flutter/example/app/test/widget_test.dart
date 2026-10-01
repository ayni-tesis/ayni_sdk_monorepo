import 'package:ayni_sdk_example/main.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('asks for test configuration before enabling SDK actions', (
    tester,
  ) async {
    await tester.pumpWidget(const AyniExampleApp());

    expect(
      find.text(
        'Configura tu credencial y endpoint de prueba antes de ejecutar.',
      ),
      findsOneWidget,
    );
    expect(find.text('SDK inicializado'), findsNothing);
    expect(find.text('Sincronización completada'), findsNothing);
    expect(find.text('Resultado del workflow'), findsNothing);
    expect(
      tester
          .widget<TextField>(find.byKey(const Key('credential-field')))
          .obscureText,
      isTrue,
    );
    expect(
      tester
          .widget<FilledButton>(
            find.widgetWithText(FilledButton, 'Ejecutar workflow'),
          )
          .onPressed,
      isNull,
    );
  });

  testWidgets('never renders a typed test credential', (tester) async {
    await tester.pumpWidget(const AyniExampleApp());
    const testCredential = 'ayni_sk_test_not_a_real_secret';
    await tester.enterText(
      find.byKey(const Key('credential-field')),
      testCredential,
    );
    await tester.pump();

    expect(
      find.byWidgetPredicate(
        (widget) => widget is Text && widget.data == testCredential,
      ),
      findsNothing,
    );
    expect(
      tester
          .widget<TextField>(find.byKey(const Key('credential-field')))
          .obscureText,
      isTrue,
    );
  });
}
