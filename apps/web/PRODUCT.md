# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Administradores de workspaces que gestionan aplicaciones, credenciales,
  workflows, modelos, datasets y telemetría.
- Desarrolladores Flutter que integran el SDK en sus aplicaciones móviles.
- Personas no técnicas que, con asistencia de IA, pueden configurar y operar
  workflows sin escribir código.

## Product Purpose

Ayni es una plataforma centralizada, comparable a n8n en su rol de orquestación,
para configurar y publicar workflows de modelos de IA para aplicaciones móviles.
El SDK Flutter sincroniza esos recursos cuando existe conectividad y los ejecuta
localmente y offline en el dispositivo.

## Positioning

La plataforma combina el control centralizado de un orquestador visual con una
ejecución offline-first: convierte workflows DAG versionados del dashboard en
integraciones on-device verificables para apps Flutter, con modelos,
sincronización, evidencia y telemetría bajo políticas explícitas.

## Operating Context

Un workspace contiene varias aplicaciones. Cada aplicación separa sus
credenciales, workflows DAG, versiones de modelo TensorFlow Lite, datasets y
trazas. El dashboard se usa para definir, validar y publicar recursos; la app
móvil ejecuta lo que ya fue sincronizado.

## Capabilities and Constraints

- El dashboard debe servir tanto a usuarios técnicos como no técnicos.
- Los workflows son DAGs versionados y no pueden transportar código arbitrario.
- La primera modalidad es visión por computadora con TensorFlow Lite on-device.
- La evidencia de imágenes es opcional, requiere consentimiento y usa un nodo
  `dataset.capture`.
- La telemetría no incluye imágenes ni identificadores de hardware.
- No hay restricciones de idioma, activos de marca ni requisitos de
  accesibilidad específicos confirmados todavía; se aplicarán las bases de
  accesibilidad web al diseñar.

## Brand Commitments

- Nombre del producto: Ayni.
- No hay sistema visual ni activos de marca confirmados todavía.

## Evidence on Hand

- Historias de usuario y contratos de interfaz: `../../docs/epicas/`.
- Resumen de producto: `../../docs/resumen-tesis-sdk.md`.
- La interfaz web actual es un scaffold mínimo de Next.js.

## Product Principles

- Mantener los recursos de cada aplicación aislados y trazables.
- Hacer la configuración avanzada comprensible sin exigir código.
- Validar antes de publicar o ejecutar.
- Priorizar ejecución local resiliente sobre dependencia de red.
- Tratar imágenes, dispositivos y telemetría con consentimiento explícito.
