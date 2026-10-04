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
- `evidenceQueueStatus()` devuelve el estado de la cola de evidencia como un
  `EvidenceQueueStatus`: `waitingForWifi` (`Pendiente de Wi-Fi`) mientras la
  política de recolección está habilitada y solo permite Wi-Fi y el
  dispositivo usa datos móviles, otra conexión o ninguna, `pending` o `empty`.
  `sync()` guarda también la red permitida y la habilitación de la política, y
  el SDK lee el tipo de conexión con su plugin nativo sin guardarlo ni
  enviarlo. En Android, el SDK declara el permiso `ACCESS_NETWORK_STATE`.
- El SDK acepta el esquema de workflow 3, con el que el servidor publica los
  workflows que incluyen `dataset.capture`. Las versiones anteriores del SDK
  rechazan esos workflows con `unsupportedWorkflowVersion`.
- `sync()` sube la evidencia pendiente a la aplicación de la credencial con
  `POST /sdk/evidence`, la imagen a la URL firmada que indica el servidor y
  `POST /sdk/evidence/<evidenceId>/complete`, solo mientras la política de
  recolección, consultada antes de cada evidencia, esté habilitada y permita la
  conexión actual. Su nuevo parámetro `onEvidence` recibe `evidenceUploading`
  (`Subiendo evidencia…`) y después `evidenceReceived` (`Evidencia recibida.`),
  `evidenceUploadFailed`
  (`No se pudo enviar la evidencia; se reintentará cuando sea posible.`) o
  `evidenceCredentialRevoked`
  (`No se puede enviar evidencia porque la credencial fue revocada.`).
- Una evidencia solo cuenta como enviada cuando el servidor confirma que la
  recibió: el SDK agrega `received.json` a su directorio, elimina su copia
  local (la imagen optimizada, sus datos y sus intentos) antes de avisar
  `evidenceReceived`, deja de contarla en `pendingEvidenceCount()` y no la
  vuelve a subir. Sin confirmación la conserva como pendiente, sin eliminar
  nada, y un `sync()` posterior la vuelve a intentar con el mismo ID, sin
  duplicarla. El borrado se limita al directorio de esa evidencia y no afecta
  workflows ni modelos instalados. Si no puede eliminarla, `received.json`
  evita que se suba otra vez y la elimina un `sync()` posterior o
  `initialize()`, junto con la evidencia que quedó a medio guardar o a medio
  eliminar si la app se cerró.
- Cada carga de evidencia que termina sin confirmación cuenta como un intento,
  salvo con la credencial revocada; un `sync()` que no llega a empezarla por la
  política, la conexión o el tiempo disponible tampoco cuenta. Después de un
  intento fallido la evidencia
  queda `EvidenceStatus.retrying` (`Reintentando`) y un `sync()` posterior la
  reintenta tras una espera de 15 minutos que se duplica en cada fallo, hasta 6
  horas. El nuevo parámetro `maxEvidenceUploadAttempts` de `AyniSdk` y
  `AyniConfig` (5 por defecto) limita los intentos: en el último, `sync()` avisa
  `evidenceRetriesExhausted`
  (`No se pudo enviar la evidencia después de varios intentos.`) y la evidencia
  queda `failed` (`Fallida`), conservada en el dispositivo pero sin reenviarse
  automáticamente ni bloquear a las demás. Los intentos se guardan en
  `upload-attempts.json`, dentro del directorio de la evidencia.
- `evidenceStatusCounts()` devuelve cuántas evidencias hay en cada
  `EvidenceStatus`: `pending` (`Pendiente`), `uploading` (`Enviando`, mientras
  `sync()` la sube), `retrying`, `received` (`Enviada`) y `failed`, sin
  solicitudes de red. Como el SDK elimina la evidencia confirmada, `received`
  solo cuenta la que todavía no pudo empezar a eliminar; una que quedó a medio
  eliminar ya no cuenta en ningún estado.
- Al guardar una traza en la outbox y al leerla para enviarla, el SDK conserva
  solo los campos del esquema de trazas, cada uno con su tipo: si un componente
  le agrega la imagen de entrada, sus bytes u otro dato, o un texto con una
  imagen codificada, el SDK descarta ese adjunto y envía la traza solo con los metadatos permitidos, que son lo único
  que cuenta para el límite de 2 MiB de una traza. `dataset.capture`
  sigue siendo el único mecanismo que recolecta imágenes: un workflow sin ese
  nodo solo registra telemetría, aunque la app pase `evidenceConsent: true`.
- Un nodo `dataset.capture` puede colgar, por su puerto `condicion`, de la
  rama `true` o `false` de una condición sobre el mismo modelo cuyo resultado
  recibe, por ejemplo para guardar solo las predicciones de baja confianza.
  `run()` crea la evidencia solo si la condición toma esa rama; si no, no crea
  evidencia, conserva la traza permitida y devuelve el mismo resultado. Una
  condición que solo decide una captura se evalúa aunque ninguna salida la lea.
- Requiere la API HTTP 0.3.0 del servidor, que agrega `POST /sdk/evidence` y
  `POST /sdk/evidence/<evidenceId>/complete`.

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
