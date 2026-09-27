---
title: ¿Qué es Ayni?
description: Qué hace Ayni y qué parte del flujo cubre hoy el SDK para Flutter.
sidebar:
  order: 1
---

Ayni es una plataforma offline-first para orquestar y desplegar workflows de
modelos de IA en el dispositivo, dentro de aplicaciones móviles Flutter.

## Cómo encajan las piezas

- **Dashboard.** En la aplicación web, los administradores de un workspace
  crean aplicaciones, registran modelos (por ejemplo, TensorFlow Lite), diseñan
  workflows y generan las credenciales del SDK.
- **Servidor.** Guarda las versiones publicadas de los workflows y de los
  modelos, y las entrega al SDK cuando este se autentica con una credencial.
- **SDK para Flutter.** El paquete Dart `ayni_sdk` sincroniza esas versiones y
  las guarda en el almacenamiento de la app, para que sigan disponibles sin
  conexión.

## Qué hace hoy el SDK

La versión 0.1.0 sincroniza los workflows publicados de una aplicación y los
modelos que usan: descarga cada versión nueva, la valida, verifica la
integridad de los modelos y conserva la última versión válida cuando una
actualización falla.

:::caution
La ejecución de workflows en el dispositivo todavía no está disponible. El SDK
descarga y guarda los workflows, pero aún no ofrece una API para ejecutarlos.
:::
