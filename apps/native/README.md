# Ayni thesis validation app

This Android app is the operator harness for the thesis validation runs. It uses the published `ayni_sdk` 0.2.0 package and supports Android API 26 or later. The app uses a hosted SDK dependency; it does not build against the SDK repository's local package path.

```bash
flutter create --platforms=android .
flutter pub get
flutter run
```

Android builds use compile SDK 36 and minimum SDK 26. Do not generate an iOS host for this validation app.
