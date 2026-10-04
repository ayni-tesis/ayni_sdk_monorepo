import 'package:better_fullstack_app/main.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('renders the validation operator app', (tester) async {
    await tester.pumpWidget(const BetterFullstackApp());
    expect(find.text('Validación ayni_sdk'), findsOneWidget);
  });
}
