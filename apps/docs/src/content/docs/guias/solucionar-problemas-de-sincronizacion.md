---
title: Solucionar problemas de sincronización
description: Causas de los resultados offline y error de sync() y cómo resolverlas.
sidebar:
  order: 1
---

Ante fallos de red, de tiempo de espera o de archivos, `sync()` no lanza una
excepción: devuelve un `SyncResult` con `SyncStatus.offline` o
`SyncStatus.error`. En ese caso, las versiones que ya estaban guardadas en el
dispositivo se mantienen.

## `SyncStatus.offline`

El SDK no pudo abrir la conexión con el servidor.

- Comprueba que el dispositivo tenga red.
- Comprueba que `serverUrl` apunte al servidor correcto y que este responda.

## `SyncStatus.error`

| Síntoma | Causa probable | Qué hacer |
| --- | --- | --- |
| Falla siempre, sin tráfico de red | `serverUrl` usa `http` | Usa `https`. En desarrollo local, activa `allowInsecureLoopback` y usa `localhost`. |
| Falla tras la respuesta del servidor | La credencial no es válida o fue revocada; el servidor responde `401` | Genera una credencial nueva en el dashboard y actualiza la app. |
| Falla después de un tiempo de espera | La sincronización superó `syncTimeout` (30 segundos por defecto) | Revisa la conexión o aumenta `syncTimeout`. |
| Falla al guardar | El SDK no puede escribir en `storageDirectory` | Usa un directorio propio de la app con permisos de escritura. |

:::note
Ante un `401`, el SDK devuelve `SyncStatus.error` sin distinguir una credencial
inválida de una revocada. Revisa el estado de la credencial en el dashboard.
:::

## Un workflow no se actualizó

Si `sync()` termina pero un recurso trae un estado distinto de `updated` o
`upToDate`, su propiedad `message` explica qué pasó. Consulta la tabla de
[Estados y errores](/referencia/estados-y-errores/#estados-de-cada-recurso).
