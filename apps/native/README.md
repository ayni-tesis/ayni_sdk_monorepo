# App móvil de validación de Ayni

`apps/native` es el arnés Android de la tesis. Usa el SDK local `ayni_sdk` **0.3.1**, Android API 26 o posterior y CPU. En el APK selector, el operador ingresa la SDK Key y pulsa **Iniciar validación**. La app prepara los recursos de todos los perfiles, sincroniza cada workflow, verifica la suite completa y ejecuta las fases automáticas para integración directa y `ayni_sdk`.

## Antes de crear el APK

El plan contiene cuatro perfiles positivos: `INT-01` (Coffee EfficientNetB0 y BRACOL), `S1` (Coffee MobileNetV2 sobre el mismo BRACOL), `REU-01` (clasificador de tomate de diez etiquetas y PlantVillage) y `S2` (workflow completo de café con clasificador, detector, condición `sana >= 0.8` y salidas tipadas). Hoy `INT-01` tiene recursos publicados; `S1`, `REU-01` y `S2` siguen `pending`. El botón queda deshabilitado mientras falte cualquiera de esos perfiles, así que no produce una corrida parcial.

Provisiona los perfiles en este orden:

1. Confirma fuente, licencia y contrato de cada modelo; registra las versiones de los modelos y completa sus contratos de entrada y salida en el dashboard.
2. Crea y publica cada workflow inmutable. Para S2, conserva el grafo completo de clasificador, detector, condición y todas las salidas declaradas; debe referenciar las mismas versiones de modelo que el modo directo.
3. Registra una versión privada de cada dataset de prueba en **Datasets de validación**. El ZIP contiene `manifest.json` e imágenes; el manifiesto declara casos, escenario, rutas relativas y SHA-256 de cada imagen. Usa el partition `test` y declara la fuente y licencia que permiten distribuir las imágenes a los dispositivos.
4. Para S2, filtra COCO a la muestra necesaria o consigue autorización explícita para redistribuir las imágenes en el bucket privado de R2. No incluyas imágenes de entrenamiento ni uses DeepLabV3 como caso positivo.
5. Solo después de publicar y verificar los recursos, reemplaza el perfil correspondiente en `assets/validation/experiment_plan.json` con los IDs reales y SHA-256 del dataset y de cada modelo, el ID/versión del workflow y sus contratos. No copies IDs de ejemplo del ZIP ni incluyas una SDK Key.
6. Ejecuta `flutter test test/validation/models/experiment_plan_test.dart`, `flutter test`, `flutter analyze` y `flutter build apk --debug`; luego genera el APK selector siguiendo las instrucciones de abajo.

La app conserva el dataset en almacenamiento privado. Lo descarga mediante el manifiesto autenticado y una URL temporal de R2; verifica el hash del ZIP, las rutas y los hashes de las imágenes antes de instalarlas. También verifica todos los modelos y la definición publicada de cada workflow. Antes de escribir JSONL, comprueba todos los perfiles, ambas condiciones y todas las imágenes seleccionadas; un recurso ausente o inválido bloquea la suite completa. El lote automático incluye 12 filas de fase/escenario, 5 376 intentos por condición y 10 752 intentos en total cuando los cuatro perfiles están listos. Tras medir, vuelve a sincronizar el SDK para intentar despachar las trazas autorizadas.

La URL de producción (`https://ayni-sdk-monorepo-server.vercel.app/`) está fijada en la app. La SDK Key se guarda con `flutter_secure_storage`; debe estar activa y corresponder a la aplicación. El APK no contiene la credencial.

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

La ejecución de desarrollo usa por defecto `VALIDATION_CONDITION=selector`. Ingresa la SDK Key y pulsa **Iniciar validación**. Cuando los cuatro perfiles estén listos, la app ejecuta `PERF-02-WARMUP`, `PERF-02` y `PERF-04` para cada perfil y ambas condiciones: 5 376 intentos por condición, 10 752 en total. El porcentaje y la actividad muestran el avance del lote completo. Con los recursos actuales, el botón permanece deshabilitado porque `S1`, `REU-01` y `S2` están pendientes. La inferencia corre localmente; la preparación y las sincronizaciones requieren conexión.

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

Cada intento se agrega y sincroniza a disco en `validation/runs.jsonl` dentro del directorio privado de documentos de la app. El registro incluye fase, escenario, pareja/repetición, caso, hashes, perfil de dispositivo (modelo, plataforma, versión de SO y API), versiones de la app y del SDK, backend CPU, duración, resultado normalizado, estado y si la captura de trazas estaba habilitada. Android excluye el almacenamiento privado de la app de copias en la nube y transferencias entre dispositivos. No incluye credenciales, imágenes, tensores, URL firmadas ni la traza SDK.

## Requisitos de validación

- La app no importa APIs internas del SDK; depende del paquete local `../../packages/sdk_flutter` (`ayni_sdk 0.3.1`).
- El SDK 0.3.1 y el arnés admiten workflows de detección S2 con `tensorIndices`. El perfil S2 sigue pendiente hasta registrar y verificar sus versiones de dataset, modelos y workflow en `experiment_plan.json`.
- La inferencia de cada lote no accede a la red. La preparación y las sincronizaciones se realizan automáticamente antes y después de las corridas.
- La app no implementa la medición de arranque en frío, la desconexión de red del dispositivo ni la inyección de fallos del Plan; no sube el JSONL.
- El piloto físico queda pendiente hasta instalar el APK en los dispositivos y completar las corridas de conectividad, cancelación, revocación de trazas y exportación.
