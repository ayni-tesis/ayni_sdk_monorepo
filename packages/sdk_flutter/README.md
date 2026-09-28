# ayni_sdk

Offline-first SDK primitives for Ayni Flutter integrations.

El paquete `ayni_sdk` permite integrar modelos de IA en aplicaciones Flutter con arquitectura offline-first. Los workflows versionados se sincronizan desde la plataforma y se ejecutan localmente en el dispositivo sin conexión obligatoria a internet ni dependencias en tiempo de compilación con el dashboard.

## Instalación

Android 8.0 (API 26) o posterior es obligatorio; configura `minSdkVersion 26` en la app Flutter.

Agrega `ayni_sdk` a las dependencias de tu proyecto Flutter en `pubspec.yaml`:

```yaml
dependencies:
  ayni_sdk: ^0.1.0-beta.1
```

Esta versión es para pruebas piloto y puede cambiar.

## API Pública

Importa la librería pública oficial:

```dart
import 'package:ayni_sdk/ayni_sdk.dart';
```

> **Nota:** No importes archivos src internos. La interfaz pública se expone a través de `package:ayni_sdk/ayni_sdk.dart`.

La API pública estable que consume tu aplicación se compone de `AyniSdk.initialize` para configurar el SDK, `sync()` para actualizar workflows y modelos, `run()` para ejecutarlos localmente, y los tipos `WorkflowResult` y `WorkflowError` para leer el resultado de la ejecución. Las clases internas de `lib/src/` no forman parte del contrato de integración y pueden cambiar sin previo aviso.

## Configuración genérica e inicialización

El paquete mantiene una configuración completamente genérica e independiente. No contiene secretos, tokens ni configuración de una aplicación concreta.

El SDK recibe su configuración dinámicamente en tiempo de ejecución mediante `AyniSdk.initialize(AyniConfig(...))` (US-049). La aplicación host obtiene la credencial y la configuración desde almacenamiento seguro o su entorno de ejecución en runtime, manteniendo el paquete desacoplado y libre de secretos hardcodeados:

```dart
final result = AyniSdk.initialize(
  AyniConfig(
    serverUrl: Uri.parse('https://tu-servidor-ayni.example'),
    credential: credential,
    storageDirectory: storageDirectory,
  ),
);
if (!result.isReady) {
  showMessage(result.message);
  return null;
}
return AyniSdk.instance;
```

El ejemplo completo, que `dart analyze` comprueba, está en `example/reference/initialize.dart`.

Una vez completada la inicialización de forma exitosa (`result.isReady`), se accede a la instancia compartida a través de `AyniSdk.instance`. Si la configuración es incompleta o inválida, el SDK no queda en un estado parcialmente operativo.

## Ejecución local de workflows

Con el SDK inicializado y sincronizado, ejecuta un workflow instalado con `run()`. La ejecución es local: no hace peticiones de red y la aplicación nunca interpreta el JSON del DAG.

```dart
final sdk = AyniSdk.instance;

try {
  // Devuelve la última versión instalada del workflow, sin conexión
  final WorkflowResult result = await sdk.run(workflowId, imageBytes);

  // Salidas publicadas: Map<String, WorkflowValue>
  print(result.outputs);
} on WorkflowError catch (error) {
  // error.category (WorkflowErrorCategory), error.nodeId, error.modelVersionId
  print('Error de ejecución: ${error.category}');
}
```

El ejemplo completo, que `dart analyze` comprueba, está en `example/reference/run_workflow.dart`.

`WorkflowResult` expone `workflowId`, `workflowVersion`, `outputs` y `usingOfflineCache`. Cada valor de `outputs` es un `WorkflowValue` (`ClassificationResult`, `DetectionResult` o `BooleanResult`) bajo el nombre de salida publicado. Si la ejecución falla, `run()` lanza `WorkflowError` con su `category`, `nodeId` y `modelVersionId`; no devuelve el error como valor.

## Estructura del paquete

- `pubspec.yaml`: Especificación del paquete y dependencias genéricas.
- `lib/ayni_sdk.dart`: Librería pública oficial.
- `lib/src/`: Implementaciones internas del SDK.
- `test/`: Pruebas automatizadas.
- `bin/package.dart`: Herramienta de empaquetado y verificación de reglas de distribución.

## Plataformas compatibles

Plataformas compatibles con ayni_sdk 0.1.0-beta.1: Android e iOS.

- Android 8.0 (API 26) o posterior.
- iOS 11.0 o posterior.

Estos mínimos corresponden al runtime de TensorFlow Lite usado por el SDK. Consulta también los requisitos de [tflite_flutter](https://pub.dev/packages/tflite_flutter) al actualizar esa dependencia.

`AyniSdk.initialize` rechaza otras plataformas con `InitializationStatus.unsupportedPlatform` y el mensaje `Esta plataforma no es compatible con ayni_sdk.`. El SDK no carga un modelo en esa situación.
