---
title: Estados y errores
description: Valores de InitializationStatus, SyncStatus y SyncResourceStatus, con sus mensajes.
sidebar:
  order: 1
---

## Inicialización del SDK

`AyniSdk.initialize(config)` devuelve un `AyniInitializationResult` que indica
el resultado de la validación inicial de la configuración:

| `InitializationStatus` | Significado | Mensaje en `message` |
| --- | --- | --- |
| `ready` | La configuración es válida y el SDK está listo para sincronizar y ejecutar workflows. | `SDK listo.` |
| `incompleteConfiguration` | Falta algún dato obligatorio o la configuración no es válida. | `Revisa la configuración del SDK antes de continuar.` |
| `error` | Ocurrió un error inesperado al inicializar el SDK. | `Revisa la configuración del SDK antes de continuar.` |

El resultado nunca expone la credencial en registros, mensajes ni en su método `toString()`. Si la inicialización falla, el SDK no queda en un estado parcialmente operativo.

## Sincronización

`sync()` devuelve un `SyncResult` con un estado general (`status`) y la lista
de recursos revisados (`resources`).

## Estado general

| `SyncStatus` | Significado |
| --- | --- |
| `updated` | Se instaló al menos una versión nueva. |
| `upToDate` | No había nada nuevo, o solo se rechazaron definiciones de workflow incompatibles. |
| `offline` | No se pudo conectar con el servidor. |
| `error` | Falló una actualización de recurso; revisa `resources` para ver cuál y si se conservó la versión local. |

## Estados de cada recurso

Cada `SyncResourceResult` indica su tipo (`workflow` o `model`), su estado y,
cuando hay un problema, un mensaje en español en `message`.

El mensaje depende de si el dispositivo ya tenía una versión válida del
workflow:

| `SyncResourceStatus` | Con una versión anterior | Sin versión anterior |
| --- | --- | --- |
| `updated` | — | — |
| `upToDate` | — | — |
| `invalidRemoteResource` | Se mantuvo la versión local porque la actualización no es válida. | Igual |
| `invalidWorkflow` | La actualización de `<nombre>` no es compatible. Se mantuvo la última versión válida. | La actualización de `<nombre>` no es compatible. No se instaló ninguna versión. |
| `installationFailed` | No se pudo guardar la actualización. Se mantuvo la versión anterior. | No se pudo guardar la actualización. No se instaló ninguna versión. |
| `dependencyFailed` | No se pudo preparar `<nombre>`: `<dependencia>`. Se mantuvo la última versión válida. | No se pudo preparar `<nombre>`: `<dependencia>`. |
| `workflowUnavailable` | El workflow ya no está disponible. Se mantuvo la versión anterior. | El workflow ya no está disponible. No se instaló ninguna versión. |
