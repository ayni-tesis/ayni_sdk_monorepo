// Example of the Dart API reference (US-143). The package README shows the
// same region, and test/doc_examples_test.dart keeps them in sync.
import 'package:ayni_sdk/ayni_sdk.dart';

Future<void> readDeviceProfile(AyniSdk sdk) async {
  // #region perfil-tecnico
  final DeviceProfile profile = await sdk.getDeviceProfile();
  final Map<String, Object> fields = profile.toJson();
  // #endregion perfil-tecnico
  print(fields);
}
