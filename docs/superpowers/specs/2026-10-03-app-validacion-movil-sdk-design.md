# Diseño: aplicación móvil de validación de ayni_sdk

**Fecha:** 2026-10-03
**Estado:** Diseño aprobado en conversación; falta revisión del documento escrito
**Protocolo:** Plan de Pruebas Técnico SDK de Visión Computacional v1.3
**SDK evaluado:** `ayni_sdk` 0.2.0 (`ayni_sdk-v0.2.0`)

## Contexto

El Plan v1.3 compara dos implementaciones equivalentes en dispositivos Android: integración directa con `tflite_flutter` y tratamiento mediante `ayni_sdk`. El arnés debe repetir los mismos casos y datos, registrar evidencia reproducible y permitir revisar trazas técnicas en el servidor. No debe convertir resultados de la aplicación en un servicio de sincronización.

El repositorio ya contiene `apps/native`, una app Flutter mínima, y `packages/sdk_flutter/example/app`, un ejemplo del SDK. La app `apps/native` es la base elegida para el arnés; el ejemplo publicado del SDK conserva su propósito de ejemplo. El checkout actual de `main` contiene SDK 0.3.0 en desarrollo. La app de tesis debe depender exactamente de la versión publicada 0.2.0 fijada por el Plan y no usar capacidades posteriores, incluido `dataset.capture`.

## Objetivos

- Ejecutar control y tratamiento desde una sola app Flutter con selector de condición.
- Reproducir lotes y fases descritos por un manifiesto versionado, con un identificador compartido para cada pareja de corridas.
- Usar el mismo dataset, modelo, entrada, preprocesamiento, postprocesamiento y backend en ambas condiciones.
- Descargar datasets privados desde R2 antes de medir, verificar sus hashes y poder ejecutar la inferencia sin red.
- Conservar el registro común de resultados en el dispositivo y permitir exportarlo como JSONL.
- Capturar y sincronizar trazas del SDK únicamente con la política del servidor habilitada y el permiso de validación del host app vigente.

## Fuera de alcance

- Entrenar modelos, producir imágenes o editar workflows desde la app.
- Enviar imágenes de entrada, tensores o el JSONL completo de resultados al servidor.
- Guardar resultados de aplicación en la outbox del SDK.
- Usar `dataset.capture` u otras capacidades de `ayni_sdk` 0.3.0 en la evaluación de 0.2.0.
- Cambiar el Plan, OE4, Capstone u otros documentos de tesis durante este trabajo.
- Reemplazar Macrobenchmark, Perfetto, las mediciones de energía o los procedimientos externos de inyección de fallos.

## Decisiones de arquitectura

### App y condiciones

La app se implementa en el proyecto existente `apps/native` y ofrece dos modos seleccionables:

1. **Integración directa:** ejecuta el artefacto `.tflite` con `tflite_flutter`, aplicando explícitamente el contrato de imagen y postprocesamiento del caso.
2. **`ayni_sdk`:** inicializa la versión 0.2.0, sincroniza los recursos publicados y ejecuta el workflow instalado sin red.

Las dos rutas reciben los mismos bytes de imagen y configuración experimental. Un perfil de corrida relaciona para cada escenario el identificador/hash de la versión del modelo directa, el workflow y la versión publicados para el SDK, el contrato de salida y el manifiesto. La app etiqueta el modo seleccionado como `control` o `tratamiento`; un `run_id` de pareja y los números de repetición enlazan ambas condiciones. Los metadatos declarados por el cliente no se presentan como hechos verificados por el SDK.

La app de tesis se construye para Android API 26 o posterior, que es el mínimo del Plan y de `ayni_sdk`; iOS no forma parte de esta validación. Las credenciales se guardan en almacenamiento seguro del sistema y nunca se escriben en el JSONL, los mensajes de error ni logcat. El backend de inferencia evaluado es CPU.

El APK con selector contiene ambas integraciones y tiene un único tamaño común. Para informar el tamaño incremental atribuible al SDK, se preparan además builds release de tamaño por modo desde el mismo código, con condición fijada en compilación para eliminar la ruta opuesta y sin modelos incluidos. El criterio de tamaño del Plan sigue pendiente de umbral; el APK común no se informará como si tuviera tamaños distintos por condición.

### Dataset privado en R2

El bucket de producción permanece privado. Se añade un flujo mínimo de administración para registrar y cargar versiones inmutables de datasets bajo un prefijo separado por aplicación. El flujo usa URLs de carga/descarga temporales generadas por el servidor; ni las claves R2 ni una URL permanente de objeto se incluyen en el APK.

Cada paquete ZIP incluye un manifiesto con versión de esquema, `datasetId`, partición, fuente/licencia, lista ordenada de casos, escenario, `caseId`, ruta relativa de imagen y SHA-256 de cada archivo. El servidor conserva los metadatos de versión, hash del paquete, tamaño y referencia de fuente/licencia. El cliente solicita el manifiesto a través de una ruta autenticada por credencial de SDK y limitada a la aplicación activa; el servidor firma la descarga corta y no revela la clave de almacenamiento.

Antes de subir, el operador registra fuente y licencia. Solo se publican imágenes cuya licencia permite la redistribución necesaria para este uso; el sistema registra esa declaración y no certifica cumplimiento legal. El cliente descarga el paquete una vez, valida hash del ZIP y hashes de archivos, rechaza rutas absolutas o traversal durante la extracción, y lo mantiene en almacenamiento privado local. Las corridas medidas leen la copia verificada y no hacen solicitudes de red.

La creación/publicación de modelos y workflows sigue usando las capacidades existentes del dashboard. La app sincroniza workflows/modelos con `AyniSdk.sync()` para tratamiento. El control obtiene la versión exacta del modelo como artefacto verificado y la carga directamente con `tflite_flutter`; no ejecuta el workflow con `AyniSdk`.

### Lote y evidencia

El manifiesto de ejecución fija los casos y la fase antes de correr. Como mínimo representa las 20 inferencias de calentamiento, 300 medidas en tres bloques de 100, la corrida de estrés de 1.024 inferencias y las repeticiones de los escenarios de fallo. Los 30 arranques en frío requieren reiniciar el proceso/dispositivo conforme al procedimiento del Plan; la app prepara y etiqueta el caso, pero Macrobenchmark y las herramientas de sistema externas miden el inicio. El operador aplica externamente los perfiles de red/airplane mode; el arnés no reintenta fallos en silencio.

El JSONL local registra condición, `run_id`, repetición, caso/escenario, dataset/partición/hash, hash de entrada, versiones y hashes de recursos, duración y resultado decodificado de la app, error/estado, backend y campos de dispositivo disponibles. Cada intento fallido o cancelado se conserva con su estado; continuar un bloque no reutiliza silenciosamente una repetición anterior. El operador exporta este JSONL desde el dispositivo.

En tratamiento, `WorkflowTraceContext` enlaza el `run_id`, repetición, condición, caso, escenario, dataset y versión de la app con la traza SDK. **La traza de `ayni_sdk` 0.2.0 incluye salidas tipadas decodificadas.** Si se autoriza su sincronización, esos valores también llegan al servidor como parte de la traza técnica. La autorización que aprobó el usuario debe nombrar claramente ese contenido. El SDK no envía imágenes de entrada ni tensores, y el JSONL completo permanece local.

La app distingue el permiso host-managed de trazas de validación del consentimiento opcional `sdkImprovement`; son propósitos separados. El permiso para trazas inicia apagado. Si se revoca, la app detiene la captura y llama `AyniSdk.clearPendingTraces()` para purgar la outbox local. El servidor además debe tener la política de telemetría habilitada. El botón `Sincronizar SDK` se ejecuta después de las corridas y se presenta como sincronización de recursos y trazas: `AyniSdk.sync()` hace ambas cosas. La API pública no entrega un acuse de trazas por separado; el estado de recepción se comprueba en el dashboard y en la exportación JSONL del servidor antes de la retención configurada.

### Pantalla y flujo operativo

La pantalla principal se limita a los controles que necesita el operador:

1. Estado del servidor, dataset (versión/hash) y recursos de la condición.
2. Selector `Integración directa` / `ayni_sdk`, perfil/escenario/fase y `run_id` de pareja.
3. Autorización separada de captura de trazas, con texto que indique que la traza SDK contiene salidas decodificadas.
4. Acciones `Preparar recursos`, `Ejecutar lote`, `Cancelar`, `Sincronizar SDK` y `Exportar JSONL`.
5. Progreso, último estado y lista compacta de eventos/errores observables.

El botón de ejecución se habilita solo si el manifiesto, hashes y recursos requeridos por esa condición están verificados. La cancelación espera a la inferencia en curso y registra la corrida como cancelada. No se sincronizan trazas automáticamente durante una fase de medición.

## Requisitos de entorno conocidos

En la máquina se detectaron Flutter 3.47.4, Dart 3.13.3 y Android SDK 36 bajo `C:\Users\diego\AppData\Local\Android\sdk`. Android Studio está instalado, como confirma el usuario. En esta sesión `flutter doctor -v` aún marca ausentes `cmdline-tools` y la aceptación de licencias Android; también informa que no hay teléfono Android conectado. Antes de compilar/instalar y del piloto hay que completar esos componentes, aceptar las licencias y conectar los dispositivos físicos del Plan. Los avisos de Visual Studio son ajenos al objetivo Android.

## Riesgos y límites

- La carga de datasets a producción amplía el servidor y el dashboard; los límites de tamaño, borrado/retención y autorización por aplicación deben quedar explícitos en la implementación.
- Las reglas de licencia de las imágenes pueden impedir su carga al bucket; el manifiesto y los registros no reemplazan la revisión de la fuente.
- Un modo seleccionable facilita el uso del mismo arnés, pero el APK común no produce una comparación de tamaño por condición; hacen falta artefactos aislados para esa métrica.
- Los valores de salida incluidos en trazas requieren autorización específica y visible; no deben confundirse con el consentimiento Ayni de mejora del SDK.
- El Plan aún marca pendiente el umbral máximo de incremento de tamaño del paquete y factores de dispositivo por congelar.

## Criterios de aceptación del diseño

- Control y tratamiento ejecutan el mismo caso/hash de entrada y conservan evidencia enlazada por pareja y repetición.
- La app rechaza el dataset si el ZIP o cualquier imagen no coincide con sus hashes y no inicia lotes con recursos incompatibles.
- Durante `run`, la app no hace solicitudes de red; dataset/modelos/workflows se preparan antes.
- La traza SDK solo se captura/sincroniza si la política y el permiso host-managed lo habilitan; la autorización comunica que incluye outputs decodificados.
- Imágenes, tensores y el JSONL completo de resultados no se envían al servidor.
- El operador puede cancelar, ver errores/estados, exportar el JSONL local y verificar trazas aceptadas mediante el dashboard.
- La dependencia de la app queda fijada a `ayni_sdk` 0.2.0 durante la validación descrita por el Plan v1.3.
