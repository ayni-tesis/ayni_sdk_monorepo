# ayni_sdk

Offline-first SDK primitives for Ayni Flutter integrations.

El paquete `ayni_sdk` permite integrar modelos de IA en aplicaciones Flutter con arquitectura offline-first. Los workflows versionados se sincronizan desde la plataforma y se ejecutan localmente en el dispositivo sin conexión obligatoria a internet ni dependencias en tiempo de compilación con el dashboard.

## Instalación

Usa Flutter 3.32.0 o posterior. Android 8.0 (API 26) o posterior es obligatorio;
configura `minSdkVersion 26` en la app Flutter.

Agrega `ayni_sdk` a las dependencias de tu proyecto Flutter en `pubspec.yaml`:

```yaml
dependencies:
  ayni_sdk: ^0.3.0
```

Resuelve las dependencias desde la carpeta de tu aplicación:

```sh
flutter pub get
```

Si pub.dev no puede resolver la versión solicitada, corrige la restricción antes
de compilar: `No se pudo resolver la versión solicitada de ayni_sdk.` La app
de ejemplo está en `example/app`: solicita una credencial de prueba, inicializa
el SDK, sincroniza un workflow publicado y ejecuta la imagen seleccionada. Sus
instrucciones están en el
[README del ejemplo](https://github.com/ayni-tesis/ayni_sdk_monorepo/blob/main/packages/sdk_flutter/example/app/README.md)
y usa una dependencia local `path: ../..` para verificar este checkout antes
de publicar. Una aplicación consumidora debe resolver `^0.3.0` desde pub.dev.

Consulta las notas de cada versión en el
[changelog del repositorio](https://github.com/ayni-tesis/ayni_sdk_monorepo/blob/main/packages/sdk_flutter/CHANGELOG.md).

## API Pública

Importa la librería pública oficial:

```dart
import 'package:ayni_sdk/ayni_sdk.dart';
```

> **Nota:** No importes archivos src internos. La interfaz pública se expone a través de `package:ayni_sdk/ayni_sdk.dart`.

La API pública estable que consume tu aplicación se compone de `AyniSdk.initialize` para configurar el SDK, `sync()` para actualizar workflows y modelos y enviar trazas técnicas pendientes cuando la política vigente lo permite, `run()` para ejecutar localmente, `SyncResult` para consultar la sincronización y `WorkflowResult` y `WorkflowError` para la ejecución. Las clases internas de `lib/src/` no forman parte del contrato de integración y pueden cambiar sin previo aviso.

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

## Perfil técnico del dispositivo

La app puede consultar el perfil técnico disponible para describir el dispositivo
en sus propios reportes de prueba o en una traza:

```dart
final DeviceProfile profile = await sdk.getDeviceProfile();
final Map<String, Object> fields = profile.toJson();
```

El perfil versionado solo incluye plataforma, SO/API, modelo, rango de RAM y
SoC cuando la plataforma los expone. No incluye el nombre asignado al
dispositivo, seriales, identificadores de proveedor ni otros datos del plugin.
La respuesta de `getDeviceProfile()` no se persiste ni se envía; si esos campos
se incluyen en una traza habilitada de `run()`, quedan guardados dentro de la
outbox local y no se transmiten. Los campos ausentes se omiten. La consulta se
resuelve localmente y queda cacheada en esa instancia.

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

## Trazas técnicas locales y envío

Cada `sync()` intenta actualizar la política de captura técnica de la
aplicación. Una respuesta válida se guarda en
`storageDirectory/diagnostics/telemetry-policy.json`; una falla mantiene la
última política válida. Sin una política válida habilitada, el SDK no crea
trazas. La política de telemetría y el consentimiento opcional `sdkImprovement`
son controles separados: la app debe mantener su switch apagado por defecto y
pasar `traceContext` solo cuando la política y el permiso o consentimiento que
aplique al uso de esa traza permitan capturar datos. `sdkImprovement` no autoriza
usar trazas para validar modelos.

Cuando está habilitada la captura, `run()` adjunta una traza tipada a
`WorkflowResult.trace` o `WorkflowError.trace`:

```dart
final result = await sdk.run(
  workflowId,
  imageBytes,
  traceContext: WorkflowTraceContext(
    runId: experimentRunId,
    repetition: repetition,
    condition: 'tratamiento',
    caseId: 'caso-01',
    measurements: [
      TraceMeasurement(
        name: 'latency',
        value: elapsedMs,
        unit: 'ms',
        method: 'stopwatch',
        source: 'host-app',
        phase: 'workflow',
      ),
    ],
  ),
);
final Map<String, Object?>? trace = result.trace?.toJson();
```

`runId` y `repetition` los declara la app. Las mediciones y el contexto que
aporta la app quedan marcados como `clientReported`; el SDK no inventa datos
experimentales. La traza solo incluye resultados públicos ya decodificados
(clasificaciones, detecciones y booleanos), metadatos de versiones, perfil
allowlisted y errores tipados sanitizados. Nunca serializa bytes de imagen ni
tensores arbitrarios. `run()` guarda la traza, antes de devolver el resultado o
lanzar el error, en una outbox local durable dentro de
`storageDirectory/diagnostics/trace-outbox/`. Cada `traceId` queda pendiente una
sola vez y sobrevive a reinicios. En `sync()`, el SDK consulta la política vigente
antes de cada `POST /sdk/traces` y elimina la traza local solo tras validar el
acuse del servidor. Si la política no se obtiene, está deshabilitada, la red
falla o el servidor rechaza el contenido, queda pendiente para otro intento. Si
la escritura falla, la ejecución conserva su resultado o error original y
`WorkflowResult.tracePersistenceFailed` o
`WorkflowError.tracePersistenceFailed` indica que la evidencia no quedó
encolada; la traza sigue disponible en `trace` mientras vive el resultado o
error. Deshabilitar la política impide crear nuevas trazas, pero conserva las
pendientes. `retentionDays` no vence los archivos locales de la outbox; la app
puede descartarlos al borrar `storageDirectory`. En el servidor, cada traza vence
según `retentionDays` (7, 30 o 90 días); los datos reportados por el cliente se
guardan como `clientReported` y no se verifican de forma independiente. El
servidor acepta cuerpos de hasta 2 MiB. `sync()` procesa la outbox dentro de
un presupuesto opcional que reserva tiempo para actualizar workflows y modelos;
si una traza individual se rechaza, conserva esa entrada y continúa con las
siguientes mientras quede presupuesto.

La outbox contiene trazas de validación autorizadas por la app, no resultados
ni capturas de la aplicación; no son datos de
la finalidad `sdkImprovement`. Al retirar el permiso o consentimiento de
validación, desactiva primero la captura, espera a que terminen los `run()` en
curso y llama a `await sdk.clearPendingTraces()`. El SDK pausa los envíos y
elimina la outbox inmediatamente; la llamada termina cuando acaba un `sync()`
activo. Una ejecución posterior con `traceContext` reanuda la captura cuando la
app vuelva a autorizarla.

Para una ejecución de control hecha fuera de `AyniSdk.run()`, la misma instancia
puede construir el mismo tipo de registro con
`sdk.createClientExecutionTrace(...)`. Pasa el contexto, workflow, versiones,
duración y resultados tipados. Devuelve `null` si no hay una política válida
habilitada y no hace inferencia ni red; estas trazas de control siguen en
memoria y no se añaden a la outbox de `run()`.

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

Usa `ConsentPurpose.sdkImprovement` solo para la finalidad de mejora del SDK;
no representa el permiso de validación ni controla sus trazas.
`synced` confirma que Ayni recibió el recibo; `pending` significa que quedó
guardado localmente y se enviará antes del próximo manifiesto de sync; ante
`error`, deja esa finalidad desactivada. Para revocar, cambia primero el estado
local a desactivado y llama a `recordConsent` con
`ConsentDecision.declined` y la misma versión del aviso guardada al otorgarlo;
conserva la preferencia aunque el recibo quede pendiente. Una traza de
validación requiere el permiso o consentimiento separado que corresponda. Su
envío no espera el recibo `sdkImprovement`, y `recordConsent()` no purga ni
controla esa outbox; usa `clearPendingTraces()` al revocar la autorización de
validación.

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

Los contratos de modelo para detección pueden declarar `tensorIndices`, un mapa con los roles `boxes`, `classes`, `scores` y `count`. Cada valor indica el índice del tensor de salida correspondiente; los cuatro índices deben ser distintos y estar entre 0 y 3. Los tensores deben tener formas `[1, N, 4]` para `boxes`, `[1, N]` para `classes` y `scores`, y `[1]` o `[1, 1]` para `count`. El SDK decodifica los primeros `count` resultados y entrega el mismo `DetectionResult` de la API pública. Los workflows publicados sin `tensorIndices` siguen usando el decodificador anterior.

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

## Evidencia para datasets

Un workflow puede incluir el nodo `dataset.capture`, que recibe la imagen de
entrada y el resultado de un modelo de clasificación o detección. Cuando `run()`
lo alcanza, el SDK crea una evidencia local solo si la app pasa
`evidenceConsent: true`. Pásalo únicamente mientras la persona mantiene el
consentimiento de recolección que tu app le pide:

```dart
final result = await sdk.run(
  workflowId,
  image,
  evidenceConsent: evidenceAccepted,
  onEvidence: (event) => log(event.message),
);
```

El ejemplo comprobado está en `example/privacy.dart`.

Si el nodo cuelga de una rama de una condición, por ejemplo para guardar solo
las predicciones de baja confianza, `run()` lo alcanza solo cuando la condición
toma esa rama; si toma la otra, no crea evidencia y el resultado es el mismo.

`run()` devuelve el resultado sin esperar la evidencia y una evidencia que no se
puede preparar no lo cambia. Después, el SDK reduce y comprime una copia de la
imagen a un JPEG con el tamaño máximo y la calidad de la política de recolección
de la aplicación, que `sync()` consulta, y la guarda en
`storageDirectory/evidence/<evidenceId>/` con `evidence.json`, con el resultado
que recibió el nodo, el workflow, su versión y el modelo. La imagen que recibió
`run()` no cambia. `onEvidence` recibe `EvidenceEvent.evidenceOptimizing`,
`evidencePrepared` cuando la imagen está lista y `evidenceQueued` cuando la
evidencia queda pendiente en la cola local, y `onProgress`, sus mensajes:
`Optimizando`, `Evidencia preparada para envío.` y
`Evidencia guardada para envío posterior.` Si el dispositivo no tiene espacio,
descarta esa evidencia sin dejar archivos a medias y avisa
`evidenceStorageFull`:
`No se pudo guardar una imagen para el dataset; el análisis se completó normalmente.`
Si no puede preparar una evidencia por otro motivo, por ejemplo porque ningún
`sync()` guardó aún la política, también la descarta y avisa
`evidenceDiscarded`:
`No se pudo preparar una evidencia. El resultado del análisis no se vio afectado.`
Sin consentimiento, el SDK omite la captura y no conserva la imagen.

La evidencia guardada queda pendiente de envío en una cola local que se
conserva sin conexión y aunque la app se reinicie, y que no bloquea `run()`.
`pendingEvidenceCount()` devuelve cuántas evidencias esperan, sin solicitudes de
red, para que la app muestre `Evidencia pendiente de envío`:

```dart
final pending = await sdk.pendingEvidenceCount();
if (pending > 0) {
  showStatus('Evidencia pendiente de envío ($pending)');
}
```

Si la persona retira su consentimiento, deja de pasar `evidenceConsent: true` y
elimina la evidencia guardada; un `run()` que ya estaba en curso tampoco guarda
la suya:

```dart
await sdk.clearPendingEvidence();
```

La «Red permitida» de la política de recolección dice por qué conexión puede
salir la evidencia: `Solo Wi-Fi` o `Wi-Fi y datos móviles`. `sync()` guarda esa
red y si la recolección está habilitada junto con el tamaño y la calidad.
`evidenceQueueStatus()` devuelve el estado de la cola, sin solicitudes de red:
`EvidenceQueueStatus.waitingForWifi` (`Pendiente de Wi-Fi`) mientras haya
evidencia pendiente, la política esté habilitada y solo permita Wi-Fi, y el
dispositivo use datos móviles, otra conexión o ninguna; la evidencia sigue
pendiente, sin cargas ni consumo de datos móviles. Si no, es `pending` con
evidencia pendiente o `empty` sin ella:

```dart
final status = await sdk.evidenceQueueStatus();
if (status != EvidenceQueueStatus.empty) {
  showStatus(status.message);
}
```

Para saberlo, el SDK lee el tipo de conexión del momento con su plugin nativo
(`ConnectivityManager` en Android, `NWPathMonitor` en iOS 12 o posterior) y no
lo guarda ni lo envía.

`sync()` sube la evidencia pendiente a la aplicación de la credencial solo
mientras la política de recolección, consultada antes de cada una, esté
habilitada y permita la conexión actual. `onEvidence` de `sync()` recibe
`evidenceUploading` (`Subiendo evidencia…`) y después `evidenceReceived`
(`Evidencia recibida.`), `evidenceUploadFailed`
(`No se pudo enviar la evidencia; se reintentará cuando sea posible.`) o
`evidenceCredentialRevoked`
(`No se puede enviar evidencia porque la credencial fue revocada.`):

```dart
final result = await sdk.sync(
  onEvidence: (event) => showStatus(event.message),
);
```

El SDK solo cuenta una evidencia como enviada cuando el servidor confirma que
la recibió, y entonces elimina su copia local antes de avisar
`evidenceReceived`, sin tocar workflows ni modelos instalados. Sin esa
confirmación la conserva, sin eliminar nada, y un `sync()` posterior la vuelve
a intentar sin duplicarla hasta el límite de intentos.

Cada carga sin confirmación cuenta como un intento, salvo con la credencial
revocada, y la evidencia queda `Reintentando`: un `sync()` posterior la
reintenta tras una espera de 15 minutos que se duplica en cada fallo, hasta 6
horas. `maxEvidenceUploadAttempts` (5 por defecto) limita los intentos; en el
último, `onEvidence` recibe `evidenceRetriesExhausted`
(`No se pudo enviar la evidencia después de varios intentos.`) y la evidencia
queda `Fallida`: el SDK la conserva, pero no la vuelve a enviar
automáticamente. `evidenceStatusCounts()` devuelve cuántas hay en cada estado
(`Pendiente`, `Enviando`, `Reintentando`, `Enviada` o `Fallida`); la
evidencia confirmada ya no se cuenta, porque el SDK la eliminó:

```dart
final counts = await sdk.evidenceStatusCounts();
final failed = counts[EvidenceStatus.failed]!;
if (failed > 0) {
  showStatus('${EvidenceStatus.failed.message}: $failed');
}
```

## Estructura del paquete

- `pubspec.yaml`: Especificación del paquete y dependencias genéricas.
- `lib/ayni_sdk.dart`: Librería pública oficial.
- `lib/src/`: Implementaciones internas del SDK.
- `test/`: Pruebas automatizadas.
- `bin/package.dart`: Herramienta de empaquetado y verificación de reglas de distribución.

## Plataformas compatibles

Plataformas compatibles con ayni_sdk 0.3.0: Android e iOS.

- Android 8.0 (API 26) o posterior.
- iOS 11.0 o posterior.

Estos mínimos corresponden al runtime de TensorFlow Lite usado por el SDK. Consulta también los requisitos de [tflite_flutter](https://pub.dev/packages/tflite_flutter) al actualizar esa dependencia.

### Configuración Android

El paquete declara las dependencias requeridas por el runtime de TensorFlow Lite en Android a través de `tflite_flutter`.

- Configura `minSdkVersion 26` (Android 8.0) y `compileSdkVersion 36` en `android/app/build.gradle`.
- El SDK declara el permiso `ACCESS_NETWORK_STATE` en su manifiesto para saber si el dispositivo usa Wi-Fi antes de enviar evidencia. Android lo concede al instalar la app, sin preguntar, y lo agrega al manifiesto de tu app al compilarla.
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
