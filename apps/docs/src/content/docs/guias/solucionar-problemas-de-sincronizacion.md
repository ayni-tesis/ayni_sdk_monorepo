---
title: Solucionar problemas de sincronización
description: Qué hacer cuando sync() devuelve error u offline, o cuando un workflow no se actualiza, a partir de lo que ve la app.
sidebar:
  order: 2
---

Ante fallos de red, del servidor o del almacenamiento, `sync()` no lanza
excepciones: el problema llega a la app como un `SyncResult`. Busca abajo el
síntoma que ve tu app; cada entrada da sus causas probables y cómo resolverlo.
Los estados y los textos exactos de `message` están en
[Estados y errores](/referencia/estados-y-errores/).

Mientras tanto, la app sigue funcionando: un workflow cuya actualización falla
conserva la versión instalada, y `run()` la usa sin conexión.

## `sync()` devuelve `error` en cada intento

**Síntoma:** cada llamada a `sync()` devuelve `SyncStatus.error` y `resources`
está vacío.

**Causas probables:**

- La credencial fue revocada o regenerada en el dashboard, se copió incompleta
  o su aplicación está archivada.
- `serverUrl` no usa `https`. El SDK solo envía la credencial por `http` a
  `localhost` o a una dirección de loopback, y solo si `allowInsecureLoopback`
  es `true`. Si creas el SDK con `AyniSdk.initialize`, esa `serverUrl` devuelve
  `incompleteConfiguration` antes de sincronizar.
- `serverUrl` no es la dirección del servidor de Ayni, por ejemplo es la del
  dashboard, o el dispositivo no confía en el certificado HTTPS del servidor.
- La sincronización tarda más que `syncTimeout` (30 segundos por defecto), por
  ejemplo al descargar modelos grandes con una red lenta.
- La red se corta mientras se descarga la definición de un workflow.
- La app no puede leer o escribir en `storageDirectory`.

**Cómo resolverlo:**

1. En el dashboard, abre «Credenciales SDK» en la aplicación y busca la
   credencial cuyo «Prefijo» coincide con el inicio del secreto que usa la app.
2. Si su estado es «Revocada», o no hay ninguna credencial con ese prefijo,
   pulsa «Generar credencial» y copia el secreto nuevo, como en
   [Preparar una aplicación en el dashboard](/guias/preparar-una-aplicacion-en-el-dashboard/).
   Si perdiste el secreto de una credencial «Activa», pulsa «Regenerar».
   Una aplicación archivada no acepta credenciales nuevas ni se puede
   reactivar: crea una aplicación nueva y publica en ella sus workflows.
3. Reemplaza la credencial que usa la app por la nueva, vuelve a crear el SDK y
   llama a `sync()`.
4. Si la credencial está «Activa» y es la que usa la app, comprueba que
   `serverUrl` use `https` y apunte al servidor de Ayni, y que su certificado
   sea válido.
5. Si `sync()` tarda cerca de `syncTimeout` antes de fallar, o la red del
   dispositivo es inestable, revisa la conexión o aumenta `syncTimeout`.
6. Si nada de lo anterior aplica, usa como `storageDirectory` un directorio
   propio de la app con permisos de escritura.

:::note
El SDK no expone el código HTTP a la app: ante una credencial revocada devuelve `SyncStatus.error`.
:::

## `sync()` devuelve `offline`

**Síntoma:** `sync()` devuelve `SyncStatus.offline` y `resources` está vacío.

**Causas probables:**

- El dispositivo no tiene conexión a la red.
- El dominio de `serverUrl` está mal escrito o no existe.
- El servidor no está en marcha o no acepta conexiones en el puerto de
  `serverUrl`.

**Cómo resolverlo:**

1. Comprueba que el dispositivo tenga red, por ejemplo abriendo una página en
   su navegador.
2. Comprueba que el dominio y el puerto de `serverUrl` sean los del servidor de
   Ayni y que el servidor responda.
3. Vuelve a llamar a `sync()` cuando haya conexión. Mientras tanto, `run()` usa
   los workflows instalados.

## `sync()` devuelve `error` y un recurso trae un mensaje

**Síntoma:** `sync()` devuelve `SyncStatus.error` y un recurso de `resources`
trae un `message`, como `El workflow ya no está disponible. Se mantuvo la
versión anterior.`

**Causas probables:**

- `workflowUnavailable`: el workflow se archivó mientras el dispositivo
  sincronizaba.
- `dependencyFailed`: no se pudo descargar, verificar o instalar un modelo que
  usa el workflow, por ejemplo porque la descarga se interrumpió o el archivo
  no coincide con su hash SHA-256. El mensaje nombra la versión de modelo.
- `installationFailed`: el dispositivo no pudo guardar la definición
  descargada en `storageDirectory`.
- `invalidRemoteResource`: el servidor listó el recurso con datos no válidos, o
  un modelo cambió de archivo sin cambiar de número de versión.

**Cómo resolverlo:**

1. Muestra el `message` del recurso: indica si se conservó la versión anterior.
2. Vuelve a llamar a `sync()`: una descarga interrumpida puede completarse en el
   siguiente intento.
3. Si el recurso sigue en `workflowUnavailable`, revisa en el dashboard si el
   workflow está archivado.
4. Si sigue en `dependencyFailed`, revisa en el dashboard la versión de modelo
   que nombra el mensaje.
5. Si sigue en `installationFailed`, comprueba que `storageDirectory` sea un
   directorio propio de la app con permisos de escritura y que el dispositivo
   tenga espacio libre.
6. Si sigue en `invalidRemoteResource`, reintentar no lo resuelve. Si cambiaste
   el archivo de un modelo, súbelo como una versión nueva del modelo, como en
   [Preparar una aplicación en el dashboard](/guias/preparar-una-aplicacion-en-el-dashboard/),
   y publica una versión del workflow que la use. Si no, repórtalo como se
   explica al final de esta página.

## `sync()` devuelve `upToDate`, pero no llega la versión nueva

**Síntoma:** cambiaste un workflow en el dashboard, pero `sync()` devuelve
`SyncStatus.upToDate` y `run()` sigue usando la versión anterior.

**Causas probables:**

- El cambio no está publicado: el SDK solo recibe versiones publicadas.
- La credencial que usa la app es de otra aplicación.
- El workflow está archivado, o usa un modelo que ya no está disponible.
- La definición no es compatible con la versión del SDK de la app: el recurso
  trae `invalidWorkflow` y un `message` como `La actualización de <nombre> no
  es compatible. Se mantuvo la última versión válida.`

**Cómo resolverlo:**

1. En el dashboard, comprueba que el workflow tenga una versión publicada en la
   misma aplicación de la credencial que usa la app.
2. Si el recurso trae `invalidWorkflow`, revisa las reglas de
   [Esquema de workflow](/referencia/esquema-de-workflow/) y qué versión del SDK
   incluye cada tipo de nodo en
   [Notas de versión y compatibilidad](/recursos/notas-de-version/). Actualiza el
   SDK o publica una versión compatible.

## Mi síntoma no aparece en esta guía

Repórtalo en un
[issue del repositorio de Ayni](https://github.com/ayni-tesis/ayni_sdk_monorepo/issues/new)
con estos datos:

- La versión de `ayni_sdk` (en `pubspec.lock`) y la salida de
  `flutter --version`.
- La plataforma y su versión, como Android 14 o iOS 17.
- El `status` del `SyncResult` y, de cada recurso de `resources`, su `type`,
  `status`, `version` y `message`.
- El dominio de `serverUrl`, el valor de `syncTimeout` y si
  `allowInsecureLoopback` es `true`.
- El «Prefijo» de la credencial y su estado en el dashboard.
- Qué esperabas, qué pasó y la fecha y hora aproximadas.

:::caution[Advertencia]
No compartas la credencial: nunca incluyas el secreto `ayni_sk_…` en el
reporte, en registros ni en capturas; basta con su «Prefijo». Si lo compartiste
por error, regenera la credencial en el dashboard.
:::
