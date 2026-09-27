---
title: Estados y errores
description: Valores de SyncStatus y SyncResourceStatus que devuelve sync(), con sus mensajes.
sidebar:
  order: 1
---

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
