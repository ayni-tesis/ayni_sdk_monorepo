---
title: Estados y errores
description: Estados de initialize() y sync(), el texto exacto de cada mensaje y lo que ve la app ante cada error HTTP del servidor.
sidebar:
  order: 1
---

Esta página describe `ayni_sdk` 0.1.0-beta.1. Para diagnosticar un problema a
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
| `unsupportedPlatform` | La app no se ejecuta en Android ni en iOS. El SDK no revisa la configuración. | `Esta plataforma no es compatible con ayni_sdk.` |

El resultado nunca muestra la credencial en registros, mensajes ni en su método
`toString()`. Si la inicialización falla, el SDK no queda en un estado
parcialmente operativo.

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
| `installationFailed` | La definición era válida pero no se pudo guardar en el dispositivo. | Sí | No se pudo guardar la actualización. Se mantuvo la versión anterior. |
| `installationFailed` | Igual, en un dispositivo sin una versión anterior de ese workflow. | No | No se pudo guardar la actualización. No se instaló ninguna versión. |
| `dependencyFailed` | No se pudo descargar, verificar o instalar un modelo que usa el workflow. | Sí | No se pudo preparar `<nombre>`: `<modelo>`. Se mantuvo la última versión válida. |
| `dependencyFailed` | Igual, en un dispositivo sin una versión válida de ese workflow. | No | No se pudo preparar `<nombre>`: `<modelo>`. |
| `workflowUnavailable` | El servidor ya no entrega la versión de workflow que listó. | Sí | El workflow ya no está disponible. Se mantuvo la versión anterior. |
| `workflowUnavailable` | Igual, en un dispositivo sin una versión anterior de ese workflow. | No | El workflow ya no está disponible. No se instaló ninguna versión. |

## Errores HTTP del servidor

El SDK llama a los endpoints de la [API HTTP del SDK](/referencia/api-http/).
Cuando el servidor rechaza una solicitud, responde con un `code`, pero la app no
lo recibe: ve el resultado de la última columna.

| `code` | Estado HTTP | Cuándo ocurre | Qué ve la app |
| --- | --- | --- | --- |
| `invalidCredential` | `401` | Falta la credencial, no tiene el formato `ayni_sk_…`, no corresponde a ninguna credencial o su aplicación está archivada. | `sync()` devuelve `SyncStatus.error` con `resources` vacío. |
| `credentialRevoked` | `401` | Un administrador revocó o regeneró la credencial. | `sync()` devuelve `SyncStatus.error` con `resources` vacío. Si se revoca a mitad de una sincronización, mientras se descarga un modelo, el workflow que lo usa trae `dependencyFailed`. |
| `workflowVersionNotFound` | `404` | La versión de workflow que listó el servidor ya no se puede descargar, por ejemplo porque su workflow se archivó durante la sincronización. | El workflow trae `workflowUnavailable` y `sync()` devuelve `SyncStatus.error`. |
| `modelVersionNotFound` | `404` | La versión de modelo que usa un workflow ya no se puede descargar. | El workflow trae `dependencyFailed` con esa versión en `<modelo>`, y `sync()` devuelve `SyncStatus.error`. |

:::note
El SDK no expone el código HTTP a la app: ante una credencial revocada devuelve `SyncStatus.error`.
:::
