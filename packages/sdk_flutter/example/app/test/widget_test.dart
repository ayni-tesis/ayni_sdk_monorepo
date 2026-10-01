import 'package:ayni_sdk_example/main.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('resolves and imports the public SDK API', (tester) async {
    await tester.pumpWidget(const AyniExampleApp());

    expect(find.text('Dependencias resueltas.'), findsOneWidget);
    expect(find.text('API pública disponible: ready'), findsOneWidget);
  });
}
