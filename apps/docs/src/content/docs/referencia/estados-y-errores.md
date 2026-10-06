---
title: Estados y errores
description: Estados de initialize() y sync(), el texto exacto de cada mensaje y lo que ve la app ante cada error HTTP del servidor.
sidebar:
  order: 1
---

Esta página describe `ayni_sdk` 0.4.0. Para diagnosticar un problema a
partir de lo que ve tu app, sigue
[Solucionar problemas de sincronización](/guias/solucionar-problemas-de-sincronizacion/).

## Inicialización del SDK

`AyniSdk.initialize(config)` devuelve un `AyniInitializationResult` con el
resultado de la validación de la configuración. No lanza excepciones.

| `InitializationStatus` | Significado | `message` |
| --- | --- | --- |
| `ready` | La configuración es válida y el SDK está listo para sincronizar y ejecutar workflows. | `SDK listo.` |
| `incompleteConfiguration` | Falta un dato obligatorio o la configuración no es válida, por ejemplo una `serverUrl` que no usa `https`. | `Revisa la configuración del SDK antes de continuar.` |
| `error` | Ocurrió un error inesperado al inicializar el SDK. | `Revisa la configuración del SDK antes de continuar.` |
| `unsupportedPlatform` | La app no se ejecuta en un móvil compatible (Android API 26+ o iOS 11+), o el dispositivo Android o iOS tiene una versión inferior a la mínima requerida. El SDK no revisa la configuración ni ejecuta modelos. | `Esta plataforma no es compatible con ayni_sdk.` |

El resultado nunca muestra la credencial en registros, mensajes ni en su método
`toString()`. Si la inicialización falla, el SDK no queda en un estado
parcialmente operativo. En un dispositivo Android con una versión inferior a la mínima requerida (API 26), `unsupportedPlatform` devuelve el mensaje específico `Este dispositivo Android no cumple el requisito mínimo del SDK.`, y en un dispositivo iOS con una versión inferior a iOS 11.0 devuelve el mensaje específico `Este dispositivo iOS no cumple el requisito mínimo del SDK.`, además del mensaje genérico existente (`Esta plataforma no es compatible con ayni_sdk.`) en otras plataformas no admitidas, y no ejecuta inferencias.

## Sincronización

Ante fallos de red, del servidor o del almacenamiento, `sync()` no lanza una
excepción: devuelve un `SyncResult` con un estado general (`status`) y el
resultado de cada recurso revisado (`resources`). Sea cual sea el estado, un
recurso cuya actualización falla conserva la versión que ya estaba instalada, y
`run()` la sigue usando sin conexión. Un recurso que se actualizó (`updated`)
pasa a usar la versión nueva, aunque el estado general sea `error`.

## Estado general

| `SyncStatus` | Significado | Qué debería mostrar la app |
| --- | --- | --- |
| `updated` | Se instaló al menos una versión nueva de un workflow o modelo y ningún otro recurso falló. | Que hay workflows actualizados, y el `message` de cada recurso que lo tenga. |
| `upToDate` | No se instaló nada nuevo: el dispositivo ya tenía cada versión publicada, el servidor aceptó la credencial sin listar recursos o solo se rechazaron definiciones de workflow incompatibles (`invalidWorkflow`). | Nada, salvo el `message` de cada recurso que lo tenga. |
| `offline` | No se pudo conectar con el servidor, por ejemplo porque el dispositivo no tiene red. `resources` está vacío. | Que no hay conexión y que se usarán los workflows instalados, por ejemplo `Sin conexión. Se usarán los workflows instalados.` |
| `error` | La sincronización no terminó o falló un recurso. Con `resources` vacío, la sincronización se detuvo antes de terminar: `serverUrl` no puede recibir la credencial, el servidor rechazó la solicitud o respondió algo que no es un manifiesto, falló la descarga de una definición de workflow (por ejemplo, se cortó la red a mitad de la sincronización), se agotó `syncTimeout` o falló el almacenamiento del dispositivo. Si no, `resources` indica qué recurso falló. | Que no se pudo sincronizar y que se usarán los workflows instalados, el `message` de cada recurso que lo tenga y una forma de reintentar. |

`invalidWorkflow` es el único estado de recurso con mensaje que no convierte el
resultado en `error`.

## Estado de cada recurso

Cada `SyncResourceResult` indica su tipo (`type`: `workflow` o `model`), su
estado (`status`) y, cuando hubo un problema, un mensaje en español en
`message` para mostrar al usuario. En los workflows, `previousVersionRetained`
indica si el dispositivo conservó una versión válida anterior y elige el texto
del mensaje.

En los mensajes, `<nombre>` es el nombre del workflow (`name`) y `<modelo>` es
el ID de la versión de modelo que falló (`dependencyName`).

| `SyncResourceStatus` | Qué pasó | ¿Se conservó la versión anterior? | `message` |
| --- | --- | --- | --- |
| `updated` | Se guardó la nueva versión publicada. El archivo de un modelo solo se descarga cuando se instala un workflow que lo usa. | No aplica: se instaló la versión nueva. | `null` |
| `upToDate` | La versión instalada es la publicada. Un modelo también lo indica cuando se deshizo su versión nueva porque falló el workflow que la usaba. | Sí | `null` |
| `invalidRemoteResource` | Un modelo conserva el número de versión instalado pero cambió su hash SHA-256 (`remoteHashConflict` es `true`). | Sí | La actualización no coincide con la versión instalada; se conservará la copia local. |
| `invalidRemoteResource` | En cualquier otro caso, el servidor listó el recurso con datos no válidos: falta un campo o no es válido, o el workflow usa un modelo que no está listado ni instalado o que tampoco es válido. | Sí, si había una. | Se mantuvo la versión local porque la actualización no es válida. |
| `invalidWorkflow` | La definición descargada no pasó la validación del SDK. Consulta las reglas en [Esquema de workflow](/referencia/esquema-de-workflow/). | Sí | La actualización de `<nombre>` no es compatible. Se mantuvo la última versión válida. |
| `invalidWorkflow` | Igual, en un dispositivo sin una versión válida de ese workflow. | No | La actualización de `<nombre>` no es compatible. No se instaló ninguna versión. |
| `unsupportedWorkflowVersion` | El workflow declara una versión de esquema no soportada por el SDK (requiere una versión más reciente). | Sí | Este workflow requiere una versión más reciente del SDK. Se conservará la última versión compatible. |
| `unsupportedWorkflowVersion` | Igual, en un dispositivo sin una versión compatible anterior de ese workflow. | No | Este workflow requiere una versión más reciente del SDK. No se instaló ninguna versión. |
| `installationFailed` | La definición era válida pero no se pudo guardar en el dispositivo. | Sí | No se pudo guardar la actualización. Se mantuvo la versión anterior. |
| `installationFailed` | Igual, en un dispositivo sin una versión anterior de ese workflow. | No | No se pudo guardar la actualización. No se instaló ninguna versión. |
| `dependencyFailed` | No se pudo descargar, verificar o instalar un modelo que usa el workflow. | Sí | No se pudo preparar `<nombre>`: `<modelo>`. Se mantuvo la última versión válida. |
| `dependencyFailed` | Igual, en un dispositivo sin una versión válida de ese workflow. | No | No se pudo preparar `<nombre>`: `<modelo>`. |
| `workflowUnavailable` | El servidor ya no entrega la versión de workflow que listó. | Sí | El workflow ya no está disponible. Se mantuvo la versión anterior. |
| `workflowUnavailable` | Igual, en un dispositivo sin una versión anterior de ese workflow. | No | El workflow ya no está disponible. No se instaló ninguna versión. |

## Evidencia para datasets

Cuando `run()` alcanza un nodo `dataset.capture` y la app pasó
`evidenceConsent: true`, el SDK prepara la evidencia después de devolver el
resultado y llama a `onEvidence` con cada `EvidenceEvent`, en este orden:
`evidenceOptimizing`, `evidencePrepared` y `evidenceQueued`. Si no puede
conservarla, el último evento es `evidenceStorageFull` o `evidenceDiscarded`,
que también puede llegar justo después de `evidenceOptimizing`. Su `message` es
también el diagnóstico que recibe `onProgress`. Sin consentimiento no hay
evento, y tampoco cuando el nodo cuelga de una rama de una condición que la
ejecución no tomó. Ningún evento cambia el resultado que ya devolvió `run()` (ver
[Datos y privacidad](/recursos/datos-y-privacidad/#evidencia-para-datasets)).

`sync()` llama a su propio `onEvidence` por cada evidencia pendiente que empieza
a subir: `evidenceUploading` y después `evidenceReceived`,
`evidenceUploadFailed`, `evidenceRetriesExhausted` o
`evidenceCredentialRevoked` (ver
[Envío de la evidencia](/recursos/datos-y-privacidad/#envío-de-la-evidencia) y
[Reintentos de la evidencia](/recursos/datos-y-privacidad/#reintentos-de-la-evidencia)).

| `EvidenceEvent` | Cuándo ocurre | `message` |
| --- | --- | --- |
| `evidenceOptimizing` | El SDK empezó a reducir y comprimir la imagen de la evidencia con el tamaño máximo y la calidad de la política de recolección. | `Optimizando` |
| `evidencePrepared` | El SDK optimizó la imagen de la evidencia y va a guardarla en el dispositivo con el resultado de la captura. | `Evidencia preparada para envío.` |
| `evidenceQueued` | El SDK guardó completas la imagen y el resultado de la captura en la cola local de evidencia pendiente de envío, donde se conservan aunque la app se reinicie. Cuando llega, `pendingEvidenceCount()` ya la cuenta. | `Evidencia guardada para envío posterior.` |
| `evidenceDiscarded` | El SDK no pudo preparar la evidencia, por ejemplo porque ningún `sync()` guardó aún la política de recolección o porque no pudo optimizar o guardar la imagen por un motivo distinto de la falta de espacio, y la descartó sin dejar archivos a medias. | `No se pudo preparar una evidencia. El resultado del análisis no se vio afectado.` |
| `evidenceStorageFull` | El dispositivo no tenía espacio para guardar la evidencia en la cola, así que el SDK la descartó sin dejar archivos a medias. La evidencia que ya estaba pendiente se conserva. | `No se pudo guardar una imagen para el dataset; el análisis se completó normalmente.` |
| `evidenceUploading` | `sync()` empezó a subir una evidencia pendiente: la política de recolección, consultada justo antes, la permite por la conexión actual. | `Subiendo evidencia…` |
| `evidenceReceived` | El servidor confirmó que recibió la evidencia, sus datos y su imagen. El SDK ya eliminó su copia local, así que no está pendiente, ningún `sync()` posterior la vuelve a subir y `evidenceStatusCounts()` ya no la cuenta: este aviso es el momento en que queda `Enviada`. | `Evidencia recibida.` |
| `evidenceUploadFailed` | El SDK no pudo enviar la evidencia o el servidor no confirmó su recepción. Cuenta un intento: la evidencia sigue pendiente como `retrying` y un `sync()` posterior la vuelve a intentar después de una espera. | `No se pudo enviar la evidencia; se reintentará cuando sea posible.` |
| `evidenceCredentialRevoked` | El servidor rechazó la carga porque la credencial fue revocada. No cuenta como intento: la evidencia sigue pendiente y el SDK no sube otra en ese `sync()`. | `No se puede enviar evidencia porque la credencial fue revocada.` |
| `evidenceRetriesExhausted` | La carga volvió a fallar y era el último de los `maxEvidenceUploadAttempts` intentos. La evidencia queda `failed`: el SDK la conserva en el dispositivo, pero no la vuelve a enviar automáticamente. | `No se pudo enviar la evidencia después de varios intentos.` |

## Cola de evidencia

`evidenceQueueStatus()` devuelve el estado de la cola de evidencia pendiente de
envío como un `EvidenceQueueStatus`, cuyo `message` es un texto que la app puede
mostrar. Lo calcula en el dispositivo con la cola, la última política de
recolección que guardó `sync()` y el tipo de conexión del momento, sin
solicitudes de red (ver
[Datos y privacidad](/recursos/datos-y-privacidad/#red-permitida-para-enviar-evidencia)).

| `EvidenceQueueStatus` | Cuándo ocurre | `message` |
| --- | --- | --- |
| `empty` | No hay evidencia pendiente de envío en el dispositivo. | `Sin evidencia pendiente de envío` |
| `pending` | Hay evidencia pendiente y nada la hace esperar Wi-Fi: el dispositivo usa Wi-Fi, la política permite «Wi-Fi y datos móviles» o la recolección está deshabilitada, o ningún `sync()` guardó aún la política. | `Evidencia pendiente de envío` |
| `waitingForWifi` | Hay evidencia pendiente, la política está habilitada y solo permite Wi-Fi, y el dispositivo usa datos móviles, otra conexión o ninguna. El SDK la mantiene pendiente, sin iniciar cargas ni usar datos móviles. | `Pendiente de Wi-Fi` |

## Estado de cada evidencia

`evidenceStatusCounts()` devuelve cuántas evidencias guardadas en el
dispositivo hay en cada `EvidenceStatus`, con todos los estados, también los
que están en 0. Su `message` es un texto que la app puede mostrar. Lo lee en el
dispositivo, sin solicitudes de red. `pendingEvidenceCount()` suma las
`pending`, las `uploading` y las `retrying` (ver
[Reintentos de la evidencia](/recursos/datos-y-privacidad/#reintentos-de-la-evidencia)).
Cuando el servidor confirma una evidencia, `sync()` elimina su copia local y
avisa `evidenceReceived`, así que deja de contarse (ver
[Retención de la evidencia en el dispositivo](/recursos/datos-y-privacidad/#retención-de-la-evidencia-en-el-dispositivo)).

| `EvidenceStatus` | Cuándo ocurre | `message` |
| --- | --- | --- |
| `pending` | La evidencia está en la cola y espera su primera carga. | `Pendiente` |
| `uploading` | Un `sync()` la está subiendo. Sigue pendiente: el SDK nunca la muestra como enviada antes de que el servidor confirme que la recibió. | `Enviando` |
| `retrying` | Al menos una carga terminó sin confirmación del servidor, por ejemplo por un fallo de la red o del servidor, y todavía no alcanzó `maxEvidenceUploadAttempts`. Un `sync()` posterior la vuelve a intentar con el mismo ID cuando pasa la espera: 15 minutos después del primer fallo, el doble después de cada uno de los siguientes y como máximo 6 horas. | `Reintentando` |
| `received` | El servidor confirmó que la recibió. El SDK no la vuelve a subir y elimina su copia local en ese momento, así que normalmente no se cuenta: solo cuenta una evidencia cuya copia el SDK todavía no pudo empezar a eliminar, por ejemplo porque un archivo estaba bloqueado, y que elimina un `sync()` posterior o `initialize()`. | `Enviada` |
| `failed` | La evidencia alcanzó `maxEvidenceUploadAttempts` cargas sin confirmación. El SDK la conserva en el dispositivo, no la vuelve a enviar automáticamente y ya no la cuenta como pendiente. | `Fallida` |

## Errores HTTP del servidor

El SDK llama a los endpoints de la [API HTTP del SDK](/referencia/api-http/).
Cuando el servidor rechaza una solicitud, responde con un `code`, pero la app no
lo recibe: ve el resultado de la última columna.

| `code` | Estado HTTP | Cuándo ocurre | Qué ve la app |
| --- | --- | --- | --- |
| `invalidConsent` | `400` | El recibo enviado a `POST /sdk/consents` no cumple el esquema. | `recordConsent()` devuelve `ConsentStatus.pending` y conserva el recibo para reintentar. |
| `invalidCredential` | `401` | Falta la credencial, no tiene el formato `ayni_sk_…`, no corresponde a ninguna credencial o su aplicación está archivada. | `sync()` devuelve `SyncStatus.error` con `resources` vacío. Una evidencia que estaba subiendo trae `evidenceUploadFailed` y cuenta un intento. |
| `credentialRevoked` | `401` | Un administrador revocó o regeneró la credencial. | `sync()` devuelve `SyncStatus.error` con `resources` vacío. Si se revoca a mitad de una sincronización, mientras se descarga un modelo, el workflow que lo usa trae `dependencyFailed`. Una evidencia que estaba subiendo trae `evidenceCredentialRevoked` y sigue pendiente, sin contar un intento. |
| `consentReceiptConflict` | `409` | El `receiptId` ya existe con otros datos. | `recordConsent()` devuelve `ConsentStatus.pending` y conserva el recibo local. |
| `privacyNoticeUnavailable` | `503` | El aviso de privacidad de Ayni todavía está en borrador. | `recordConsent()` devuelve `ConsentStatus.pending`; `sync()` puede continuar con workflows y modelos. |
| `invalidTrace` | `400` | La traza enviada a `POST /sdk/traces` no cumple el esquema tipado estricto. | `sync()` conserva la traza en la outbox; el envío opcional no impide sincronizar workflows y modelos. |
| `telemetryDisabled` | `403` | La política vigente de la aplicación no permite recibir trazas. | `sync()` conserva la traza en la outbox; el envío opcional no impide sincronizar workflows y modelos. |
| `traceConflict` | `409` | El mismo ID de traza de esta aplicación ya se confirmó con otros datos. | `sync()` conserva la traza en la outbox; el envío opcional no impide sincronizar workflows y modelos. |
| `traceTooLarge` | `413` | El cuerpo de `POST /sdk/traces` supera 2 MiB. | `sync()` conserva la traza en la outbox; el envío opcional no impide sincronizar workflows y modelos. |
| `invalidEvidence` | `400` | Los datos enviados a `POST /sdk/evidence` no cumplen el esquema de la evidencia. | `sync()` llama a `onEvidence` con `evidenceUploadFailed`, cuenta un intento de esa evidencia y sigue con la siguiente. |
| `collectionDisabled` | `403` | La política de recolección de la aplicación está deshabilitada en el servidor. | `sync()` llama a `onEvidence` con `evidenceUploadFailed`, cuenta un intento de esa evidencia y no sube otra en ese `sync()`. |
| `evidenceSourceNotFound` | `404` | La versión de workflow, el nodo `dataset.capture` o la versión de modelo de la evidencia no son de la aplicación de la credencial o no coinciden entre sí. | `sync()` llama a `onEvidence` con `evidenceUploadFailed`, cuenta un intento de esa evidencia y sigue con la siguiente. |
| `evidenceConflict` | `409` | El ID de evidencia ya se usó con otros datos en esta aplicación. | `sync()` llama a `onEvidence` con `evidenceUploadFailed`, cuenta un intento de esa evidencia y sigue con la siguiente. |
| `evidenceTooLarge` | `413` | Los datos de la evidencia superan 1 MiB o su imagen, 32 MiB. | `sync()` llama a `onEvidence` con `evidenceUploadFailed`, cuenta un intento de esa evidencia y sigue con la siguiente. |
| `invalidEvidenceImage` | `400` | La imagen subida no es un JPEG o su tamaño, su SHA-256 o sus dimensiones no son los de la evidencia; el servidor la descarta. | `sync()` llama a `onEvidence` con `evidenceUploadFailed`, cuenta un intento de esa evidencia y sigue con la siguiente. |
| `evidenceNotFound` | `404` | `POST /sdk/evidence/<evidenceId>/complete` nombra una evidencia cuya carga no se inició en esta aplicación. | `sync()` llama a `onEvidence` con `evidenceUploadFailed`, cuenta un intento de esa evidencia y sigue con la siguiente. |
| `evidenceImageMissing` | `409` | La imagen de la evidencia todavía no está en el almacenamiento. | `sync()` llama a `onEvidence` con `evidenceUploadFailed`, cuenta un intento de esa evidencia y sigue con la siguiente. |
| `workflowVersionNotFound` | `404` | La versión de workflow que listó el servidor ya no se puede descargar, por ejemplo porque su workflow se archivó durante la sincronización. | El workflow trae `workflowUnavailable` y `sync()` devuelve `SyncStatus.error`. |
| `modelVersionNotFound` | `404` | La versión de modelo que usa un workflow ya no se puede descargar. | El workflow trae `dependencyFailed` con esa versión en `<modelo>`, y `sync()` devuelve `SyncStatus.error`. |
| `datasetVersionNotFound` | `404` | La versión no existe, pertenece a otra aplicación o la aplicación está archivada. | El cliente de validación recibe este error y no obtiene una URL de descarga. |
| `datasetManifestUnavailable` | `500` | No se pudo consultar la versión o crear la URL firmada. | El cliente de validación recibe este error y no obtiene una URL de descarga. |

:::note
Los métodos de `ayni_sdk` no exponen el código HTTP a la app: ante una credencial revocada, `sync()` devuelve `SyncStatus.error`. El endpoint de manifiesto de dataset responde directamente al cliente de validación con su estado HTTP y su JSON.
:::
