# Ayni SDK integration example

This app uses only the public `package:ayni_sdk/ayni_sdk.dart` API. It does not
include a credential or save the test credential entered at runtime.

The SDK supports iOS 11+, but this example's `image_picker` dependency requires
iOS 13+. The Android example requires API 26+.

The repository keeps only the platform-neutral example sources. From this
directory, create the native runners once, then resolve and run on a compatible
Android or iOS device:

```sh
flutter create --platforms=android,ios --project-name ayni_sdk_example .
flutter pub get
flutter run
```

For Android, set `minSdk` to 26 and `compileSdk` to 36 in
`android/app/build.gradle.kts`, then apply the `tflite_flutter` Java/Kotlin
target alignment documented in the package README. For iOS, set the Podfile
platform to `13.0` and add `NSPhotoLibraryUsageDescription` to
`ios/Runner/Info.plist` (for example: `Select an image for the test workflow.`).

Enter a test credential, the HTTPS test endpoint, and a published workflow ID.
For local development, HTTP is accepted only for `localhost` or a loopback IP.
Initialize the SDK, sync the published workflows and models, select an image,
and run the workflow. Results are shown on screen; credentials and exception
details are never displayed. Use test credentials only.

The app stores SDK resources in a temporary directory. Its contents may be
removed by the operating system.
