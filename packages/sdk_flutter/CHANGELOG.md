## 0.3.0 - 2026-10-03

### Novedades

- Nodo `dataset.capture`: al ejecutar un workflow que lo alcanza, `run()`
  guarda en el dispositivo una evidencia con la imagen, el resultado de
  inferencia que recibe el nodo, la versión del workflow y el modelo, para
  enviarla más tarde. La captura no retrasa ni cambia el resultado.
- `run()` solo crea evidencia con `evidenceConsent: true`, que la app pasa
  mientras la persona mantiene su consentimiento de recolección; sin él, omite
  la captura y no conserva la imagen. `onEvidence` recibe
  `EvidenceEvent.evidenceQueued` y `onProgress`, el diagnóstico
  `Evidencia guardada para envío posterior.`
- `clearPendingEvidence()` elimina la evidencia guardada cuando la persona
  retira su consentimiento.
- Antes de guardar una evidencia, el SDK reduce su imagen a un JPEG con el
  tamaño máximo (lado mayor) y la calidad de la política de recolección de la
  aplicación, que `sync()` consulta en `GET /sdk/collection-policy`. Quita los
  metadatos EXIF y nunca modifica la imagen que recibió `run()`. `onEvidence`
  recibe `evidenceOptimizing` (`Optimizando`) y `evidencePrepared`
  (`Evidencia preparada para envío.`) antes de `evidenceQueued`.
- Una evidencia que no se puede preparar se descarta sin dejar archivos a medias
  y avisa `evidenceDiscarded`:
  `No se pudo preparar una evidencia. El resultado del análisis no se vio afectado.`
  Sin una política de recolección guardada por `sync()`, el SDK descarta la
  evidencia.
- La evidencia guardada queda pendiente de envío en una cola local que se
  conserva sin conexión y aunque la app se reinicie, sin bloquear `run()`.
  `pendingEvidenceCount()` devuelve cuántas evidencias esperan, para mostrar
  `Evidencia pendiente de envío`. `evidencePrepared` llega cuando la imagen
  está optimizada y `evidenceQueued`, cuando la evidencia ya está en la cola.
- Si el dispositivo no tiene espacio para guardar una evidencia, el SDK la
  descarta sin dejar archivos a medias y avisa `evidenceStorageFull`:
  `No se pudo guardar una imagen para el dataset; el análisis se completó normalmente.`
  El resultado de la inferencia no cambia.
- El SDK acepta el esquema de workflow 3, con el que el servidor publica los
  workflows que incluyen `dataset.capture`. Las versiones anteriores del SDK
  rechazan esos workflows con `unsupportedWorkflowVersion`.

Esta versión todavía no envía la evidencia al servidor.

## 0.2.0 - 2026-10-03

### Novedades

- Perfil técnico seguro del dispositivo e identificador de instalación que la
  aplicación puede restablecer con `resetInstallationId()`.
- Trazas tipadas de ejecución con tiempos por nodo, resultados y errores
  sanitizados; el SDK no incorpora imágenes, tensores ni credenciales.
- Outbox local de trazas técnicas que conserva pendientes durante desconexiones y
  las envía en `sync()` solo cuando la política de telemetría lo permite. El SDK
  elimina cada pendiente después del acuse del servidor.
- `clearPendingTraces()` permite a la aplicación detener el envío y vaciar las
  trazas pendientes al retirar la autorización correspondiente.

La outbox no almacena resultados de aplicación. La captura de trazas sigue
desactivada hasta que la política y la autorización gestionada por la aplicación
permitan pasar `traceContext`.

## 0.1.0 - 2026-10-01

Primera versión estable de `ayni_sdk`.

### Novedades

- API pública para inicializar el SDK, sincronizar recursos y ejecutar workflows
  localmente en Android e iOS.
- Verificación de integridad de modelos y validación de workflows antes de
  instalarlos.
- Conservación de los recursos locales válidos cuando una actualización falla.

## 0.1.0-beta.1 - 2026-09-28

Esta versión es para pruebas piloto y puede cambiar.

### Novedades

- Primera versión preliminar del SDK para aplicaciones piloto.
- Sincronización con `AyniSdk.sync()` usando una credencial del SDK.
- Descarga de los workflows publicados de la aplicación y validación de su
  definición antes de instalarlos.
- Descarga de los modelos que usa cada workflow y verificación de su
  integridad con SHA-256.
- Ejecución local de workflows sincronizados e instalados previamente, sin
  conexión a internet.
- Conservación de la última versión válida cuando una actualización falla.
