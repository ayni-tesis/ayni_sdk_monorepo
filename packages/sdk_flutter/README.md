# ayni_sdk

Offline-first SDK primitives for Ayni Flutter integrations.

El paquete `ayni_sdk` permite integrar modelos de IA en aplicaciones Flutter con arquitectura offline-first. Los workflows versionados se sincronizan desde la plataforma y se ejecutan localmente en el dispositivo sin conexión obligatoria a internet ni dependencias en tiempo de compilación con el dashboard.

## Instalación

Android 8.0 (API 26) o posterior es obligatorio; configura `minSdkVersion 26` en la app Flutter.

Agrega `ayni_sdk` a las dependencias de tu proyecto Flutter en `pubspec.yaml`:

```yaml
dependencies:
  ayni_sdk: ^0.1.0
```

Resuelve las dependencias desde la carpeta de tu aplicación:

```sh
flutter pub get
```

Si pub.dev no puede resolver la versión solicitada, corrige la restricción antes
de compilar: `No se pudo resolver la versión solicitada de ayni_sdk.` La app
de ejemplo está en `example/app`: solicita una credencial de prueba, inicializa
el SDK, sincroniza un workflow publicado y ejecuta la imagen seleccionada. Sus
instrucciones están en [`example/app/README.md`](example/app/README.md) y fija
la versión resuelta en su `pubspec.lock`.

Consulta las notas de cada versión en el
[changelog del repositorio](https://github.com/ayni-tesis/ayni_sdk_monorepo/blob/main/packages/sdk_flutter/CHANGELOG.md).

## API Pública

Importa la librería pública oficial:

```dart
import 'package:ayni_sdk/ayni_sdk.dart';
```

> **Nota:** No importes archivos src internos. La interfaz pública se expone a través de `package:ayni_sdk/ayni_sdk.dart`.

La API pública estable que consume tu aplicación se compone de `AyniSdk.initialize` para configurar el SDK, `sync()` para actualizar workflows y modelos, `run()` para ejecutarlos localmente, `SyncResult` para consultar la sincronización y `WorkflowResult` y `WorkflowError` para la ejecución. Las clases internas de `lib/src/` no forman parte del contrato de integración y pueden cambiar sin previo aviso.

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

Una vez completada la inicialización de forma exitosa (`result.isReady`), se accede a la instancia compartida a través de `AyniSdk.instance`. Revisa `result.status` si necesitas distinguir `ready`, `incompleteConfiguration`, `error` o `unsupportedPlatform`; en cualquier estado distinto de `ready`, muestra `result.message` y no uses la instancia. Si la configuración es incompleta o inválida, el SDK no queda en un estado parcialmente operativo.

## Sincronización

Después de inicializar, sincroniza para instalar nuevas versiones publicadas. `SyncResult.status` indica el resultado general: `updated`, `upToDate`, `offline` o `error`. Ante `offline`, conserva y usa los workflows ya instalados. Ante `error`, no des por descartados todos los cambios: puede haber recursos actualizados junto con recursos fallidos. Recorre `result.resources` y maneja el `status` de cada recurso; la lista puede estar vacía si el fallo ocurrió antes de compararlos con el servidor.

```dart
final result = await sdk.sync();
switch (result.status) {
  case SyncStatus.offline:
    showMessage('Sin conexión. Se usarán los workflows instalados.');
  case SyncStatus.error:
    showMessage(
      result.resources.isNotEmpty
          ? 'La sincronización terminó con errores. Revisa cada recurso.'
          : 'La sincronización terminó con errores.',
    );
  case SyncStatus.updated:
  case SyncStatus.upToDate:
    break;
}
for (final resource in result.resources) {
  switch (resource.status) {
    case SyncResourceStatus.updated:
      showMessage('Recurso actualizado.');
    case SyncResourceStatus.upToDate:
      showMessage('El recurso ya está actualizado.');
    case SyncResourceStatus.invalidRemoteResource:
    case SyncResourceStatus.invalidWorkflow:
    case SyncResourceStatus.unsupportedWorkflowVersion:
    case SyncResourceStatus.installationFailed:
    case SyncResourceStatus.dependencyFailed:
    case SyncResourceStatus.workflowUnavailable:
      showMessage(resource.message ?? 'No se pudo actualizar un recurso.');
  }
}
```

`result.resources` contiene los resultados por recurso cuando la sincronización alcanza la comparación con el servidor. El ejemplo completo, que `dart analyze` comprueba, está en `example/reference/sync.dart`.

## Preferencias de privacidad

La app integradora debe mostrar el aviso a sus usuarios y construir dos
switches independientes, apagados por defecto: contribuir imágenes y etiquetas
para mejorar modelos, y contribuir trazas técnicas para mejorar el SDK. La
aceptación de los términos no los activa. La recolección necesaria para prestar
el servicio se informa y se basa por separado.

Genera un UUID v4 opaco y aleatorio para cada persona dentro de esta aplicación;
guarda la relación en la app cliente y no envíes nombre, correo, teléfono ni
hashes de esos datos. Al cambiar un switch, registra la acción:

```dart
final result = await sdk.recordConsent(
  subjectId: opaqueUserId,
  purpose: ConsentPurpose.modelImprovement,
  decision: enabled ? ConsentDecision.accepted : ConsentDecision.declined,
  noticeVersion: displayedNoticeVersion,
);
showMessage(result.message);
```

El ejemplo comprobado está en `example/reference/consent.dart`.

Usa `ConsentPurpose.sdkImprovement` para el switch de trazas. `synced` confirma
que Ayni recibió el recibo; `pending` significa que quedó guardado localmente y
se enviará antes del próximo manifiesto de sync; ante `error`, deja esa finalidad
desactivada. Para revocar, cambia primero el estado local a desactivado y llama
a `recordConsent` con `ConsentDecision.declined` y la misma versión del aviso
guardada al otorgarlo; conserva la preferencia aunque el recibo quede pendiente.
No envíes datos asociados a una finalidad hasta que el recibo esté sincronizado.
La app debe ofrecer revocación por finalidad y el canal de derechos publicado
en su aviso.

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

`WorkflowResult` expone `executionId`, `workflowId`, `workflowVersion`, `outputs` y `usingOfflineCache`. Cada valor de `outputs` es un `WorkflowValue` (`ClassificationResult`, `DetectionResult`, `BooleanResult` o `CombinedWorkflowResult`) bajo el nombre de salida publicado. Una salida con varias fuentes expone los valores disponibles en el orden declarado; los valores conservan sus IDs de nodo. Si la ejecución falla, `run()` lanza `WorkflowError` con su `category`, `nodeId` y `modelVersionId`; no devuelve el error como valor.

`run()` llama a `onExecutionStarted` con un ID antes de comenzar. Guárdalo para cancelar el análisis en curso:

```dart
late String executionId;
final pending = sdk.run(
  workflowId,
  imageBytes,
  onExecutionStarted: (id) => executionId = id,
);
// Mientras `pending` sigue en curso:
sdk.cancelExecution(executionId);
```

La cancelación detiene los nodos pendientes después de que termine una inferencia que ya estaba en curso. `run()` completa con `WorkflowErrorCategory.cancelled`; un ID que ya no está activo produce `executionNotFound`.

## Estructura del paquete

- `pubspec.yaml`: Especificación del paquete y dependencias genéricas.
- `lib/ayni_sdk.dart`: Librería pública oficial.
- `lib/src/`: Implementaciones internas del SDK.
- `test/`: Pruebas automatizadas.
- `bin/package.dart`: Herramienta de empaquetado y verificación de reglas de distribución.

## Plataformas compatibles

Plataformas compatibles con ayni_sdk 0.1.0: Android e iOS.

- Android 8.0 (API 26) o posterior.
- iOS 11.0 o posterior.

Estos mínimos corresponden al runtime de TensorFlow Lite usado por el SDK. Consulta también los requisitos de [tflite_flutter](https://pub.dev/packages/tflite_flutter) al actualizar esa dependencia.

### Configuración Android

El paquete declara las dependencias requeridas por el runtime de TensorFlow Lite en Android a través de `tflite_flutter`.

- Configura `minSdkVersion 26` (Android 8.0) y `compileSdkVersion 36` en `android/app/build.gradle`.
- Con Flutter 3.44 y `tflite_flutter` 0.12.1, alinea el target Java del subproyecto Android de `tflite_flutter` con Kotlin 17 en `android/build.gradle.kts`:

  ```kotlin
  gradle.projectsEvaluated {
      rootProject.subprojects
          .filter { it.name == "tflite_flutter" }
          .forEach { plugin ->
              plugin.tasks.withType<JavaCompile>().configureEach {
                  sourceCompatibility = JavaVersion.VERSION_17.toString()
                  targetCompatibility = JavaVersion.VERSION_17.toString()
              }
          }
  }
  ```

  Este ajuste deja de ser necesario cuando `tflite_flutter` alinee ambos targets.
- La compilación correcta indica `Runtime Android listo.`.
- Si la app se ejecuta en un dispositivo Android con una versión inferior al mínimo admitido (API < 26), `AyniSdk.initialize` devuelve `InitializationStatus.unsupportedPlatform` con el mensaje `Este dispositivo Android no cumple el requisito mínimo del SDK.` antes de intentar cargar cualquier modelo.
- La configuración no requiere modificar el código del workflow.

### Configuración iOS

El paquete declara las dependencias requeridas por el runtime de TensorFlow Lite en iOS a través de `tflite_flutter` y CocoaPods (`TensorFlowLiteSwift`).

- Configura iOS 11.0 o posterior (`platform :ios, '11.0'`) en `ios/Podfile`.
- La compilación correcta indica `Runtime iOS listo.`.
- Si la app se ejecuta en un dispositivo iOS con una versión inferior al mínimo admitido (< 11.0), `AyniSdk.initialize` devuelve `InitializationStatus.unsupportedPlatform` con el mensaje `Este dispositivo iOS no cumple el requisito mínimo del SDK.` antes de intentar cargar cualquier modelo.
- Si se invoca la ejecución directa (`AyniSdk.run`) en un dispositivo iOS no soportado (< 11.0), se rechaza con `UnsupportedError` con el mensaje `Este dispositivo iOS no cumple el requisito mínimo del SDK.` antes de iniciar la ejecución o inferencia.
- La configuración no requiere modificar el código del workflow (los workflows no requieren modificaciones).

`AyniSdk.initialize` rechaza otras plataformas con `InitializationStatus.unsupportedPlatform` y el mensaje `Esta plataforma no es compatible con ayni_sdk.`. El SDK no carga un modelo en esa situación.
