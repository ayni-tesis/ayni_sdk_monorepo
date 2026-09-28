---
title: Notas de versión y compatibilidad
description: Qué incluye cada versión del SDK de Ayni y con qué versiones de Dart es compatible.
sidebar:
  order: 1
---

## `ayni_sdk` 0.1.0-beta.1

Prelanzamiento para aplicaciones piloto. Esta versión es para pruebas piloto y puede cambiar.

### Incluye

- Sincronización con `AyniSdk.sync()` usando una credencial del SDK.
- Descarga de los workflows publicados de la aplicación y validación de su
  definición antes de instalarlos.
- Descarga de los modelos que usa cada workflow y verificación de su
  integridad con SHA-256.
- Conservación de la última versión válida cuando una actualización falla.

### Todavía no incluye

- Ejecución de workflows en el dispositivo sin conexión.

### Compatibilidad

| Componente | Versión |
| --- | --- |
| Dart | `>=3.8.0 <4.0.0` |
| Alcance de CI | Android (`apps/native`) |
