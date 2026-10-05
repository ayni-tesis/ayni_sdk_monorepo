# App móvil de validación de Ayni

`apps/native` es el arnés Android de la tesis. Usa el paquete publicado `ayni_sdk` **0.2.0**, Android API 26 o posterior y CPU. El APK selector ofrece integración directa con `tflite_flutter` y tratamiento con `ayni_sdk`; también se pueden compilar APK de una sola condición para comparar tamaños.

## Antes de crear el APK

1. Publica el modelo y su contrato desde el dashboard de la aplicación.
2. En el dashboard, registra y carga una versión privada del dataset en **Datasets de validación**. El ZIP es un paquete comprimido que contiene `manifest.json` e imágenes; incluye los casos, escenario, rutas relativas y SHA-256 de cada imagen. Declara la fuente y licencia que permiten redistribuir las imágenes para este uso.
3. Publica el workflow SDK, ligado a la misma versión del modelo que usa la integración directa.
4. Reemplaza los valores plantilla del perfil activo en `assets/validation/experiment_plan.json` por los IDs publicados y SHA-256 del dataset y del modelo. Control y tratamiento deben usar el mismo ID y hash del modelo. No incluyas la credencial SDK en ese archivo.
5. Ejecuta `flutter pub get` y prueba el APK en un teléfono Android con API 26 o posterior.

La app conserva el dataset en almacenamiento privado. Lo descarga mediante el manifiesto autenticado y una URL temporal de R2; verifica el hash del ZIP, las rutas y los hashes de las imágenes antes de instalarlas. Al preparar `Integración directa`, también descarga y verifica el modelo. Al preparar `ayni_sdk`, verifica la definición publicada del workflow. El botón **Sincronizar SDK** instala después el modelo y workflow para uso offline y hace una corrida de preflight sin traza experimental.

La credencial se introduce en la app y se guarda con `flutter_secure_storage`. Se requiere una URL HTTPS del servidor y una credencial SDK activa para la aplicación correspondiente. El APK no contiene el secreto.

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

La ejecución de desarrollo usa por defecto `VALIDATION_CONDITION=selector`. Después de preparar los recursos, el tratamiento requiere pulsar **Sincronizar SDK**. Antes de medir, confirma que el dataset y la condición muestran recursos verificados; ejecuta las fases medidas sin red. `PERF-01` se mide con el procedimiento externo del Plan. Los perfiles de red y los fallos se aplican manualmente.

La autorización de trazas comienza apagada. Si la activas, la traza SDK puede incluir las salidas tipadas decodificadas; imágenes y tensores no se envían. El botón **Sincronizar SDK** también puede enviar trazas que estén en la outbox, por lo que la app no sincroniza durante un lote. Después revisa su recepción en el dashboard. El JSONL de resultados permanece en el dispositivo; **Exportar JSONL** abre la hoja de compartir del sistema.

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

## Evidencia local

Cada intento se agrega y sincroniza a disco en `validation/runs.jsonl` dentro del directorio privado de documentos de la app. El registro incluye fase, escenario, pareja/repetición, caso, hashes, perfil de dispositivo (modelo, plataforma, versión de SO y API), versiones de la app y del SDK, backend CPU, duración, resultado normalizado, estado y si la captura de trazas estaba habilitada. Android excluye el almacenamiento privado de la app de copias en la nube y transferencias entre dispositivos. No incluye credenciales, imágenes, tensores, URL firmadas ni la traza SDK.

## Requisitos de validación

- La app no importa APIs internas del SDK; depende del paquete hospedado `ayni_sdk: 0.2.0`.
- El modo `ayni_sdk` rechaza perfiles de detección porque la versión 0.2.0 no consume los índices de tensores declarados por el Plan. No se ejecuta ni registra un resultado que pueda diferir del modo directo. Comparar detección requiere una versión publicada del SDK que admita esos índices.
- La ejecución de un lote no accede a la red. Preparación y sincronización se hacen antes, con botones separados.
- La app no implementa la medición de arranque en frío del Plan ni sube el JSONL.
- El piloto físico queda pendiente hasta instalar el APK en los dispositivos y completar las corridas de conectividad, cancelación, revocación de trazas y exportación.
