# App móvil de validación de Ayni

`apps/native` es el arnés Android de la tesis. Usa `ayni_sdk` **0.2.0**, Android API 26 o posterior y CPU. En el APK selector, el operador ingresa la SDK Key y pulsa **Iniciar validación**. La app prepara el dataset y los modelos, sincroniza el workflow y ejecuta las fases automáticas para integración directa y `ayni_sdk`.

## Antes de crear el APK

1. Publica el modelo y su contrato desde el dashboard de la aplicación.
2. En el dashboard, registra y carga una versión privada del dataset en **Datasets de validación**. El ZIP es un paquete comprimido que contiene `manifest.json` e imágenes; incluye los casos, escenario, rutas relativas y SHA-256 de cada imagen. Declara la fuente y licencia que permiten redistribuir las imágenes para este uso.
3. Publica el workflow SDK, ligado a la misma versión del modelo que usa la integración directa.
4. Reemplaza los valores plantilla del perfil activo en `assets/validation/experiment_plan.json` por los IDs publicados y SHA-256 del dataset y del modelo. Control y tratamiento deben usar el mismo ID y hash del modelo. No incluyas la credencial SDK en ese archivo.
5. Ejecuta `flutter pub get` y prueba el APK en un teléfono Android con API 26 o posterior.

La app conserva el dataset en almacenamiento privado. Lo descarga mediante el manifiesto autenticado y una URL temporal de R2; verifica el hash del ZIP, las rutas y los hashes de las imágenes antes de instalarlas. También verifica el modelo y la definición publicada del workflow. Antes de las corridas de `ayni_sdk`, sincroniza el SDK y comprueba el workflow; después vuelve a sincronizar para intentar despachar las trazas autorizadas.

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

La ejecución de desarrollo usa por defecto `VALIDATION_CONDITION=selector`. Ingresa la SDK Key y pulsa **Iniciar validación**. En selector, la app ejecuta `PERF-02-WARMUP`, `PERF-02` y `PERF-04` para ambas condiciones: 1 344 intentos por condición, 2 688 en total. El progreso cuenta los intentos guardados en JSONL. La inferencia corre localmente; la preparación y las sincronizaciones requieren conexión.

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

## Medir PERF-01 en el dispositivo físico

Primero instala y abre el APK selector. Configura la SDK Key y deja que descargue y verifique el dataset, modelo y workflow del perfil activo. La Macrobenchmark conserva los datos privados entre arranques, pero el dispositivo debe estar conectado y en las mismas condiciones de red durante las mediciones.

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

- La app no importa APIs internas del SDK; depende del paquete hospedado `ayni_sdk: 0.2.0`.
- El modo `ayni_sdk` rechaza perfiles de detección porque la versión 0.2.0 no consume los índices de tensores declarados por el Plan. No se ejecuta ni registra un resultado que pueda diferir del modo directo. Comparar detección requiere una versión publicada del SDK que admita esos índices.
- La inferencia de cada lote no accede a la red. La preparación y las sincronizaciones se realizan automáticamente antes y después de las corridas.
- La app no implementa la medición de arranque en frío, la desconexión de red del dispositivo ni la inyección de fallos del Plan; no sube el JSONL.
- El piloto físico queda pendiente hasta instalar el APK en los dispositivos y completar las corridas de conectividad, cancelación, revocación de trazas y exportación.
