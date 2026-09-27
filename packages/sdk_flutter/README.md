# ayni_sdk

Offline-first SDK primitives for Ayni Flutter integrations.

El paquete `ayni_sdk` permite integrar modelos de IA en aplicaciones Flutter con arquitectura offline-first. Los workflows versionados se sincronizan desde la plataforma y se ejecutan localmente en el dispositivo sin conexión obligatoria a internet ni dependencias en tiempo de compilación con el dashboard.

## Instalación

Agrega `ayni_sdk` a las dependencias de tu proyecto Flutter en `pubspec.yaml`:

```yaml
dependencies:
  ayni_sdk:
    path: ../../packages/sdk_flutter
```

## API Pública

Importa la librería pública oficial:

```dart
import 'package:ayni_sdk/ayni_sdk.dart';
```

> **Nota:** No importes archivos internos de `package:ayni_sdk/src/...`. La interfaz pública se expone a través de `package:ayni_sdk/ayni_sdk.dart`.

## Configuración genérica

El paquete mantiene una configuración completamente genérica e independiente. No contiene secretos, tokens ni configuración de una aplicación concreta.

Cada aplicación suministra su configuración y credencial en tiempo de ejecución:

```dart
final sdk = AyniSdk(
  serverUrl: Uri.parse('https://tu-servidor-ayni.example'),
  credential: String.fromEnvironment('AYNI_CREDENTIAL'),
  storageDirectory: storageDirectory,
);
```

## Estructura del paquete

- `pubspec.yaml`: Especificación del paquete y dependencias genéricas.
- `lib/ayni_sdk.dart`: Librería pública oficial.
- `lib/src/`: Implementaciones internas del SDK.
- `test/`: Pruebas automatizadas.
- `bin/package.dart`: Herramienta de empaquetado y verificación de reglas de distribución.

## Plataformas compatibles

- Android
- iOS
