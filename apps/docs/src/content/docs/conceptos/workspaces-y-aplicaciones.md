---
title: Workspaces y aplicaciones
description: Cómo Ayni separa los recursos de cada equipo y de cada app.
sidebar:
  order: 1
---

## Workspace

Un workspace es el límite que aísla a cada equipo: sus aplicaciones, miembros,
credenciales del SDK, workflows y datasets. Nada de un workspace es visible
desde otro.

Los miembros tienen un rol. Los **administradores** (roles `owner` y `admin`)
gestionan las aplicaciones y los recursos del workspace; los miembros con rol
`member` no.

## Aplicación

Una aplicación es un proyecto aislado dentro de un workspace. Agrupa todo lo
que una app Flutter necesita de Ayni:

- los **modelos** que corren en el dispositivo, con sus versiones;
- los **workflows**, grafos dirigidos acíclicos (DAG) de pasos de inferencia;
- las **credenciales del SDK** con las que la app sincroniza.

Solo los administradores crean, renombran o archivan aplicaciones. Una
aplicación archivada no acepta credenciales, modelos ni workflows nuevos.
