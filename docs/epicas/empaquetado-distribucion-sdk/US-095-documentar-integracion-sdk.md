# US-095 — Documentar la integración del SDK

**Épica:** Empaquetado y distribución del SDK

## Historia de usuario

Como desarrollador Flutter, quiero una guía mínima de integración para inicializar, sincronizar y ejecutar mi primer workflow.

## Interfaz

README → `Inicio rápido`: `Instala`, `Inicializa`, `Sincroniza` y `Ejecuta`; incluye manejo de `SyncResult` y `WorkflowError`.

## Happy path

```gherkin
Scenario: Seguir la guía de inicio
  Given que instalé ayni_sdk
  When sigo la guía de integración
  Then puedo inicializar el SDK, sincronizar y ejecutar un workflow de ejemplo
```

## Bad path

```gherkin
Scenario: Falta una configuración requerida
  Given que sigo la guía de integración
  When omito un requisito obligatorio de plataforma o configuración
  Then la guía identifica el requisito y el SDK devuelve un error entendible
```

## Criterios de aceptación

- La guía usa solo la API pública.
- Incluye configuración Android e iOS aplicable.
- Incluye un ejemplo de manejo de resultados y errores.
