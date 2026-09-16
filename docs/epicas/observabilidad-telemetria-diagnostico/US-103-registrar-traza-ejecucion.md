# US-103 — Registrar una traza de ejecución

**Épica:** Observabilidad, telemetría y diagnóstico

## Historia de usuario

Como SDK, quiero registrar una traza por ejecución para saber qué workflow, modelos y resultado se usaron.

## Happy path

```gherkin
Scenario: Workflow ejecutado
  Given que la telemetría está habilitada
  When termina una ejecución de workflow
  Then el SDK registra workflow, versiones, estado, duración e identificador de instalación
```

## Bad path

```gherkin
Scenario: Telemetría deshabilitada
  Given que la política deshabilita telemetría
  When termina una ejecución de workflow
  Then el SDK no crea ni envía una traza
```

## Criterios de aceptación

- La traza no incluye imagen de entrada ni resultado crudo de inferencia.
- La traza identifica workflow y versiones usadas.
- La creación de una traza no bloquea la respuesta del workflow.
