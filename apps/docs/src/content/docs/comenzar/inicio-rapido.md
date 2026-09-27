---
title: Inicio rápido
description: Agrega el SDK de Ayni a una app Flutter y sincroniza por primera vez.
sidebar:
  order: 2
---

Esta guía agrega el SDK a una app Flutter y ejecuta una primera sincronización
contra tu servidor de Ayni.

## Antes de empezar

- Una app Flutter con Dart 3.8 o superior.
- La URL de tu servidor de Ayni, con `https`.
- Una credencial del SDK de la aplicación, generada en el dashboard. Tiene la
  forma `ayni_sk_…` y solo se muestra una vez al crearla.

## 1. Agrega la dependencia

El paquete todavía no está publicado en pub.dev. Agrégalo desde el repositorio
en el `pubspec.yaml` de tu app:

```yaml title="pubspec.yaml"
dependencies:
  ayni_sdk:
    git:
      url: https://github.com/ayni-tesis/ayni_sdk_monorepo.git
      path: packages/sdk_flutter
```

Luego resuelve las dependencias:

```sh
flutter pub get
```

## 2. Sincroniza

Crea una instancia de `AyniSdk` con la URL del servidor, la credencial y un
directorio donde la app pueda escribir, y llama a `sync()`:

```dart
import 'dart:io';

import 'package:ayni_sdk/ayni_sdk.dart';

Future<void> sincronizarAyni(Directory storageDirectory) async {
  final sdk = AyniSdk(
    serverUrl: Uri.parse('https://tu-servidor-ayni.example'),
    credential: 'ayni_sk_…',
    storageDirectory: storageDirectory,
  );

  final result = await sdk.sync();
  switch (result.status) {
    case SyncStatus.updated:
      print('Se instalaron ${result.resources.length} recursos.');
    case SyncStatus.upToDate:
      print('Todo está al día.');
    case SyncStatus.offline:
      print('Sin conexión: se mantienen las versiones guardadas.');
    case SyncStatus.error:
      print('No se pudo sincronizar.');
  }
}
```

:::danger
No escribas la credencial real en el código fuente ni la subas a un
repositorio. Quien la tenga puede sincronizar los recursos de tu aplicación
hasta que la revoques en el dashboard.
:::

## Siguiente paso

[Instalación y configuración](/comenzar/instalacion-y-configuracion/) explica
cada parámetro de `AyniSdk`, y [Estados y errores](/referencia/estados-y-errores/)
detalla qué significa cada resultado.
