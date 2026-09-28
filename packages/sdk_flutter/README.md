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

## Configuración genérica e inicialización

El paquete mantiene una configuración completamente genérica e independiente. No contiene secretos, tokens ni configuración de una aplicación concreta.

El SDK recibe su configuración dinámicamente en tiempo de ejecución mediante `AyniSdk.initialize(AyniConfig(...))` (US-049). La aplicación host obtiene la credencial y la configuración desde almacenamiento seguro o su entorno de ejecución en runtime, manteniendo el paquete desacoplado y libre de secretos hardcodeados:

```dart
// Obtén la credencial dinámicamente en runtime (p. ej. desde almacenamiento seguro)
final credential = await secureStorage.read(key: 'ayni_credential');

final config = AyniConfig(
  serverUrl: Uri.parse('https://api.ayni.dev'),
  credential: credential ?? '',
  storageDirectory: storageDirectory,
);

final result = AyniSdk.initialize(config);

if (result.isReady) {
  final sdk = AyniSdk.instance;
  // Sincroniza workflows o ejecuta modelos locales
  final syncResult = await sdk.sync();
} else {
  // Manejo de configuración incompleta o errores: result.message
  print('Error al inicializar el SDK: ${result.message}');
}
```

Una vez completada la inicialización de forma exitosa (`result.isReady`), se accede a la instancia compartida a través de `AyniSdk.instance`. Si la configuración es incompleta o inválida, el SDK no queda en un estado parcialmente operativo.

## Estructura del paquete

- `pubspec.yaml`: Especificación del paquete y dependencias genéricas.
- `lib/ayni_sdk.dart`: Librería pública oficial.
- `lib/src/`: Implementaciones internas del SDK.
- `test/`: Pruebas automatizadas.
- `bin/package.dart`: Herramienta de empaquetado y verificación de reglas de distribución.

## Plataformas compatibles

- Android
- iOS
