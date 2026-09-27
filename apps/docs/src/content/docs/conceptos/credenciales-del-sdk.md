---
title: Credenciales del SDK
description: Qué es una credencial del SDK, cómo se muestra y qué pasa al revocarla.
sidebar:
  order: 2
---

Una credencial del SDK es un secreto que pertenece a una sola aplicación. El
SDK la envía al servidor para sincronizar los recursos de esa aplicación.

## Creación

Un administrador genera la credencial en el dashboard. El secreto empieza por
`ayni_sk_` y **se muestra una sola vez**. El servidor no lo guarda: conserva
solo su hash SHA-256 y un prefijo para reconocerla en el listado.

:::caution
Si pierdes el secreto no se puede recuperar. Genera una credencial nueva y
revoca la anterior.
:::

## Revocación

Revocar una credencial la marca como `revoked`. Desde ese momento ya no
autentica ni sincroniza recursos nuevos.

La revocación no borra workflows, modelos ni versiones del servidor, ni elimina
los recursos que los dispositivos ya guardaron sin conexión.
