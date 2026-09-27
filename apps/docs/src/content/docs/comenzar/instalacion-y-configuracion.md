---
title: Instalación y configuración
description: Requisitos del SDK de Ayni, formas de instalarlo y parámetros de AyniSdk.
sidebar:
  order: 3
---

## Requisitos

| Requisito | Valor |
| --- | --- |
| Paquete | `ayni_sdk` 0.1.0 |
| Dart | `>=3.8.0 <4.0.0` |
| Plataforma probada | Android |
| Dependencias | `crypto` |

## Instalación

`ayni_sdk` no está publicado en pub.dev (`publish_to: none`). Instálalo como
dependencia `git`, o como dependencia `path` si tu app vive en el mismo
monorepo:

```yaml title="pubspec.yaml"
dependencies:
  ayni_sdk:
    path: ../../packages/sdk_flutter
```

## Parámetros de `AyniSdk`

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `serverUrl` | `Uri` | Sí | URL del servidor de Ayni. Debe usar `https`. |
| `credential` | `String` | Sí | Credencial del SDK de la aplicación (`ayni_sk_…`). |
| `storageDirectory` | `Directory` | Sí | Directorio donde el SDK guarda los workflows, los modelos y su inventario. |
| `syncTimeout` | `Duration` | No | Tiempo máximo de una sincronización. Por defecto, 30 segundos. |
| `allowInsecureLoopback` | `bool` | No | Permite `http` solo hacia `localhost` o una dirección de loopback, para desarrollo. Por defecto, `false`. |
| `onProgress` | `void Function(String)` | No | Recibe mensajes de actividad, como `Descargando workflow <nombre>…`. |
| `onWorkflowDownload` | `void Function(WorkflowVersionDownloadResult)` | No | Recibe cada definición de workflow descargada o no disponible durante la sincronización. |

:::note
El SDK solo envía la credencial por `https`. Con `http`, `sync()` devuelve
`SyncStatus.error` sin conectarse, salvo que `allowInsecureLoopback` sea
`true` y el servidor esté en loopback.
:::
