# App móvil de validación de Ayni

`apps/native` es el arnés Android de la tesis. Usa `ayni_sdk` **0.4.0**, publicado en pub.dev, Android API 26 o posterior y CPU. En el APK selector, el operador ingresa la SDK Key y pulsa **Iniciar validación**. La app prepara los recursos de todos los perfiles, sincroniza cada workflow, verifica la suite completa y ejecuta las fases automáticas para integración directa y `ayni_sdk`.

## Antes de crear el APK

El plan contiene cinco perfiles positivos: `INT-01` (Coffee EfficientNetB0 y BRACOL), `S1` (Coffee MobileNetV2 sobre el mismo BRACOL), `REU-01` (clasificador de tomate de diez etiquetas y PlantVillage), `S2` (workflow completo de café con clasificador, detector, condición `sana >= 0.8` y salidas tipadas) y `SEG-01` (segmentación semántica, ver abajo). Hoy `INT-01` y `REU-01` tienen recursos publicados; `S1`, `S2` y `SEG-01` siguen `pending`. El botón **Iniciar validación** se habilita con que haya al menos un perfil listo: la suite ejecuta solo los perfiles listos y omite los `pending`. Un recurso ausente o inválido de un perfil listo bloquea la suite completa.

Provisiona los perfiles en este orden:

1. Confirma fuente, licencia y contrato de cada modelo; registra las versiones de los modelos y completa sus contratos de entrada y salida en el dashboard.
2. Crea y publica cada workflow inmutable. Para S2, conserva el grafo completo de clasificador, detector, condición y todas las salidas declaradas; debe referenciar las mismas versiones de modelo que el modo directo.
3. Registra una versión privada de cada dataset de prueba en **Datasets de validación**. El ZIP contiene `manifest.json` e imágenes; el manifiesto declara casos, escenario, rutas relativas y SHA-256 de cada imagen. Usa el partition `test` y declara la fuente y licencia que permiten distribuir las imágenes a los dispositivos.
4. Para S2, filtra COCO a la muestra necesaria o consigue autorización explícita para redistribuir las imágenes en el bucket privado de R2. No incluyas imágenes de entrenamiento ni uses DeepLabV3 como caso positivo.
5. Solo después de publicar y verificar los recursos, reemplaza el perfil correspondiente en `assets/validation/experiment_plan.json` con los IDs reales y SHA-256 del dataset y de cada modelo, el ID/versión del workflow y sus contratos. No copies IDs de ejemplo del ZIP ni incluyas una SDK Key.
6. Ejecuta `flutter test test/validation/models/experiment_plan_test.dart`, `flutter test`, `flutter analyze` y `flutter build apk --debug`; luego genera el APK selector siguiendo las instrucciones de abajo.

La app conserva el dataset en almacenamiento privado. Lo descarga mediante el manifiesto autenticado y una URL temporal de R2; verifica el hash del ZIP, las rutas y los hashes de las imágenes antes de instalarlas. También verifica todos los modelos y la definición publicada de cada workflow. Antes de escribir JSONL, comprueba todos los perfiles, ambas condiciones y todas las imágenes seleccionadas; un recurso ausente o inválido bloquea la suite completa. El lote automático incluye 15 filas de fase/escenario, 6 720 intentos por condición y 13 440 intentos en total cuando los cinco perfiles están listos (cada perfil listo aporta 3 filas y 1 344 intentos por condición). Tras medir, vuelve a sincronizar el SDK para intentar despachar las trazas autorizadas.

La URL de producción (`https://ayni-sdk-monorepo-server.vercel.app/`) está fijada en la app. La SDK Key se guarda con `flutter_secure_storage`; debe estar activa y corresponder a la aplicación. El APK no contiene la credencial.

## Perfil SEG-01: segmentación semántica

`SEG-01` mide si `ayni_sdk` 0.4.0 conserva la máscara de un modelo de segmentación y cuánto tarda, frente a la integración directa con TFLite sobre los mismos bytes. Usa las mismas fases (`SEG-01-PERF-02-WARMUP` de 20 intentos, `SEG-01-PERF-02` de 300 y `SEG-01-PERF-04` de 1 024) y el mismo botón. Sigue `pending`: no se activa hasta que existan el modelo registrado, el workflow publicado con esquema `4` y un dataset con licencia que permita guardarlo en el almacenamiento privado.

- **Modelo previsto:** DeepLabV3 genérico de MediaPipe (float32), entrada `[1, 257, 257, 3]` con `minus_one_to_one`, 21 etiquetas VOC y `scoreType` `logits`.
- **Workflow:** una salida de segmentación y la condición `person gte 0.1`, con una salida booleana cuyas `sources` son los puertos `true` y `false`. La integración directa evalúa la condición con su propio código sobre `areaFractions[label]` (operadores `gte`, `gt`, `lte`, `lt`, umbral en [0, 1]).
- **Versión del SDK:** la app compara la versión con SemVer, no con una igualdad fija: detección exige al menos 0.3.1 y segmentación al menos 0.4.0. Si el SDK es anterior, la preparación se detiene con `sdkSegmentationUnsupported` («La segmentación requiere ayni_sdk 0.4.0 o posterior.») antes de inicializarlo. Una versión `-dev` vale menos que la estable.
- **Registro:** cada fila exitosa de segmentación guarda `width`, `height`, `areaFractions`, `confidence`, `maskSha256` y la máscara en RLE fila por fila (`maskRle`: una lista de pares `[índice de etiqueta, longitud]` por fila, cuyas longitudes suman el ancho). La fila `treatment` exitosa agrega `segmentationAgreement` (`pixelAgreement`, `meanIou`, `maxAbsAreaFractionDelta`, `absConfidenceDelta`, `dimensionsMatch`), calculado en el dispositivo al emparejarla con la fila `control` de la misma repetición, caso y SHA-256 de entrada. Si una fila `treatment` exitosa con segmentación no recibe acuerdo, lleva `segmentationAgreementUnavailable` con el motivo: `controlMissing` (no hay fila `control` exitosa de la misma repetición y caso) o `invalid` (no se pudieron comparar las segmentaciones). Los registros de clasificación y detección no cambian y no llevan ninguno de los dos campos.
- **`maskSha256`:** es el SHA-256 del contenido de la máscara, es decir los bytes de los índices de etiqueta fila por fila. No incluye las dimensiones, que van aparte en `width` y `height`: dos máscaras de otro tamaño pueden compartir el hash.
- **Latencia de SEG-01:** el cronómetro de ambas condiciones incluye la inferencia y la decodificación de la salida (argmax y softmax en el control; la del SDK ocurre dentro de `run()`), y excluye por igual el RLE y el SHA-256 de la máscara, que se calculan después de detener el cronómetro. Para clasificación y detección el cronómetro no cambió.

Plantilla para reemplazar el perfil pendiente cuando existan los recursos (los valores entre `<>` son los reales de cada publicación; no se inventan):

```json
{
  "id": "SEG-01",
  "status": "ready",
  "datasetId": "<id>",
  "datasetVersionId": "<id>",
  "datasetPartition": "test",
  "datasetSha256": "<sha256 del ZIP>",
  "workflowId": "<id>",
  "workflowVersionId": "<id>",
  "workflowVersion": "1.0.0",
  "modelRequirements": [
    {
      "nodeId": "<id del nodo model.tflite>",
      "modelVersionId": "<id>",
      "sha256": "<sha256 del modelo>",
      "inputContract": {
        "width": 257,
        "height": 257,
        "channels": 3,
        "normalization": "minus_one_to_one"
      },
      "modelOutputContract": {
        "type": "segmentation",
        "labels": ["background", "aeroplane", "bicycle", "bird", "boat", "bottle", "bus", "car", "cat", "chair", "cow", "dining table", "dog", "horse", "motorbike", "person", "potted plant", "sheep", "sofa", "train", "tv"],
        "scoreType": "logits"
      }
    }
  ],
  "outputContract": [
    {
      "name": "<nombre de la salida de segmentación>",
      "resultType": "segmentation",
      "labels": ["background", "aeroplane", "bicycle", "bird", "boat", "bottle", "bus", "car", "cat", "chair", "cow", "dining table", "dog", "horse", "motorbike", "person", "potted plant", "sheep", "sofa", "train", "tv"],
      "scoreType": "logits"
    },
    { "name": "<nombre de la salida booleana>", "resultType": "boolean", "labels": [] }
  ]
}
```

Agrega también los tres escenarios que ya tiene el plan. La exactitud frente a máscaras de referencia (mIoU frente a PASCAL VOC) es opcional, se calcula fuera del teléfono y depende de la licencia de las imágenes.

## Ejecutar en desarrollo

Desde `apps/native`:

```powershell
flutter pub get
flutter devices
flutter emulators
flutter emulators --launch <id-del-emulador>
flutter devices
flutter run -d <id-android>
```

El emulador sirve para una prueba funcional; para resultados de medición de la tesis usa los dispositivos físicos definidos en el Plan.

La ejecución de desarrollo usa por defecto `VALIDATION_CONDITION=selector`. Ingresa la SDK Key y pulsa **Iniciar validación**. Cuando los cinco perfiles estén listos, la app ejecuta `PERF-02-WARMUP`, `PERF-02` y `PERF-04` para cada perfil y ambas condiciones: 6 720 intentos por condición, 13 440 en total. El porcentaje y la actividad muestran el avance del lote completo. Los perfiles `pending` (hoy `S1`, `S2` y `SEG-01`) se omiten. La inferencia corre localmente; la preparación y las sincronizaciones requieren conexión.

### Diagnóstico: “No se completó la acción”

Si aparece `No se completó la acción. Revisa la conexión y la configuración del perfil.`, revisa el log `Validation run failed (<tipo>)` y su stack `Validation run failure`. En el incidente del 2026-10-05, la sincronización con el backend configurado respondió correctamente; el `FormatException` ocurrió después, al construir `ValidationRunRecord`. `DirectTfliteRunner` (condición `control`) copiaba la versión del workflow del perfil de tratamiento. Los registros de control no admiten metadatos de workflow, así que se eliminó esa versión de sus resultados; `ayni_sdk` conserva la versión exacta en los registros de tratamiento. La validación rápida al 20 % solo reduce las repeticiones y no causa este error. Si vuelve a ocurrir, adjunta esas líneas de log y no compartas la SDK Key.

La autorización de trazas comienza apagada. En el primer inicio puedes autorizarlas o ejecutar sin ellas; el menú superior permite revocar el permiso. Con autorización, la traza SDK puede incluir salidas tipadas decodificadas; imágenes, tensores y el JSONL completo no se envían. El envío también depende de que la política de telemetría de la aplicación esté habilitada en el dashboard. El lote no sincroniza durante la inferencia. Al terminar, revisa en el dashboard si el backend recibió las trazas. El JSONL permanece en el dispositivo; **Exportar JSONL**, en el menú superior, abre la hoja de compartir del sistema.

`PERF-01` se mide con el módulo AndroidX Macrobenchmark descrito abajo; no forma parte del lote del botón. `F1–F6` siguen pendientes porque requieren fallos controlados de red, servidor o almacenamiento. El lote automático no cuenta esos resultados como ejecutados.

## APK de medición

El host Android debe tener Flutter 3.47.4 / Dart 3.13.3, Android SDK 36, `cmdline-tools` y licencias Android aceptadas. En Android Studio abre **Tools > SDK Manager**; en **SDK Platforms** instala Android 16 / API 36 y en **SDK Tools** marca **Android SDK Command-line Tools (latest)**. Luego acepta las licencias y verifica el host:

```powershell
flutter doctor --android-licenses
flutter doctor -v
```

Conecta el teléfono con opciones de desarrollador y depuración USB activadas; `flutter devices` debe mostrarlo antes de instalar el APK. En este host, las pruebas y `flutter analyze` pasan, pero Windows Application Control bloquea `gen_snapshot.exe` y `font-subset.exe` al compilar en modo release. Solicita al administrador que permita los binarios oficiales de Flutter desde el SDK de confianza; no desactives ni eludas la política. Hasta entonces no hay APK release local para instalar.

Construye el APK selector una vez que el host permita los binarios de Flutter. Flutter reutiliza la misma ruta de salida:

```powershell
New-Item -ItemType Directory -Force artifacts | Out-Null
flutter build apk --release --dart-define=VALIDATION_CONDITION=selector
New-Item -ItemType Directory -Force artifacts | Out-Null
Copy-Item build/app/outputs/flutter-apk/app-release.apk artifacts/ayni-validation-selector.apk
Get-Item artifacts/ayni-validation-selector.apk | Select-Object Name, Length
Get-FileHash artifacts/ayni-validation-selector.apk -Algorithm SHA256
```

El APK selector incluye ambas condiciones; los valores de tamaño y SHA-256 se registran después de una compilación exitosa. No se entregan APK distintos para `control` y `treatment`: esos modos solo restringen el flujo y comparten las dependencias del selector. El APK se firma con la clave debug para el piloto y no está configurado para Google Play.

La primera distribución del selector es [Ayni Validation App 1.0.0](https://github.com/ayni-tesis/ayni_sdk_monorepo/releases/tag/ayni-validation-app-v1.0.0): `ayni-validation-app-v1.0.0.apk`, versión Android `1.0.0+1`, tamaño 75 981 319 bytes, SHA-256 `059E8A7A0E97FFC0618D4ACEBA06EF651987DAA0817CF4A1822ACD98C679C2DD`.

## Medir PERF-01 en el dispositivo físico

Primero instala y abre el APK selector. Configura la SDK Key y deja que descargue y verifique los recursos del perfil que se mida. Para el perfil actual `INT-01`, la Macrobenchmark conserva los datos privados entre arranques, pero el dispositivo debe estar conectado y en las mismas condiciones de red durante las mediciones.

El módulo lanza 30 arranques en frío para `control` y 30 para `treatment`. Guarda una fila `PERF-01-001` a `PERF-01-030` por condición en `validation/runs.jsonl`; un identificador pareado nuevo distingue ejecuciones repetidas del benchmark. AndroidX registra `StartupTimingMetric`, el intervalo desde el inicio del proceso hasta terminar la primera inferencia y la sección `runCase` por separado. El intervalo completo incluye la preparación de recursos y la sincronización SDK; `runCase` excluye esa preparación y la escritura JSONL. Mantén la misma red durante las corridas. Conserva los JSON y archivos Perfetto generados por el test junto con el JSONL exportado desde la app.

Desde `apps/native/android` en PowerShell, con el JDK de Android Studio disponible y el teléfono visible en `adb devices`, ejecuta:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
.\gradlew.bat :app:assembleBenchmark :macrobenchmark:assembleBenchmark
.\gradlew.bat :macrobenchmark:connectedBenchmarkAndroidTest
```

No declares la medición completa hasta revisar las 60 filas, las salidas JSON de ambas condiciones y sus trazas Perfetto. Este host detecta un Samsung SM-A556E por ADB; la ejecución aún depende de que Application Control permita los binarios AOT oficiales de Flutter.

## Cómo se validarán F1–F6

Estas pruebas deben correr en un dispositivo de laboratorio o emulador y contra servicios de prueba; no se deben inyectar fallos en el backend de producción.

| Escenario | Fallo que se induce | Evidencia para aprobar |
| --- | --- | --- |
| F1 | Activar modo avión después de preparar los recursos y ejecutar inferencia offline; reiniciar el proceso y reconectar una vez. | Resultado y traza quedan persistidos; la reconexión entrega el evento pendiente sin pérdida ni duplicado. |
| F2 | Interrumpir la conectividad al iniciar una sincronización y restaurarla después. | Reintentos acotados, evento pendiente hasta ACK y convergencia tras reconectar. |
| F3 | Reenviar el mismo evento y terminar el proceso antes/después del commit local, envío, commit del servidor y ACK. | El backend conserva exactamente un evento lógico por ID en cada punto de corte. |
| F4 | Retrasar o perder respuestas de sincronización y cortar la red a mitad del intercambio. | El cliente conserva la cola, aplica reintentos acotados y converge sin duplicados. |
| F5 | Agotar los reintentos con un fallo transitorio y probar un rechazo permanente. | No hay bucle infinito; el evento permanente termina en dead-letter y los demás eventos siguen procesándose. |
| F6 | Agotar la cuota de almacenamiento del contenedor de la app en una instancia aislada. | Error tipado, JSONL previo intacto y ningún registro parcial presentado como válido. |

La app aún no expone un ejecutor automático para F1–F6. F2–F5 necesitan un servidor de prueba o proxy con puntos de fallo reproducibles; F6 debe usar almacenamiento aislado, nunca llenar el teléfono de uso diario. Hasta añadir esos controles y repetir 30 veces cada escenario, mantén esos resultados como pendientes.

## Evidencia local

Cada intento se agrega y sincroniza a disco en `validation/runs.jsonl` dentro del directorio privado de documentos de la app. El registro incluye fase, escenario, pareja/repetición, caso, hashes, perfil de dispositivo (modelo, plataforma, versión de SO y API), versiones de la app y del SDK, backend CPU, duración, resultado normalizado, estado y si la captura de trazas estaba habilitada. Android excluye el almacenamiento privado de la app de copias en la nube y transferencias entre dispositivos. No incluye credenciales, imágenes, tensores, URL firmadas ni la traza SDK. Una fila de segmentación sí lleva la máscara en RLE (y su SHA-256): es un dato derivado de la imagen que solo vive en este JSONL local, nunca se envía al servidor y solo sale del teléfono con **Exportar JSONL**. La traza del SDK no incluye la máscara, solo `width`, `height`, `confidence` y `areaFractions`.

Todas las filas nuevas, también las de `S1`, `S2`, `INT-01` y `REU-01`, llevan `sdkVersion` `0.4.0` en sus metadatos, porque la app ahora se compila con `ayni_sdk` 0.4.0. La campaña medida con 0.3.1 se distingue por ese campo: sus filas dicen `0.3.1`.

## Requisitos de validación

- La app no importa APIs internas del SDK; depende del paquete hospedado `ayni_sdk: 0.4.0`.
- El SDK 0.4.0 y el arnés admiten workflows de detección S2 con `tensorIndices` (desde 0.3.1) y de segmentación SEG-01 (desde 0.4.0). El perfil S2 sigue pendiente hasta registrar y verificar sus versiones de dataset, modelos y workflow en `experiment_plan.json`.
- La inferencia de cada lote no accede a la red. La preparación y las sincronizaciones se realizan automáticamente antes y después de las corridas.
- La app no implementa la medición de arranque en frío, la desconexión de red del dispositivo ni la inyección de fallos del Plan; no sube el JSONL.
- El piloto físico queda pendiente hasta instalar el APK en los dispositivos y completar las corridas de conectividad, cancelación, revocación de trazas y exportación.
