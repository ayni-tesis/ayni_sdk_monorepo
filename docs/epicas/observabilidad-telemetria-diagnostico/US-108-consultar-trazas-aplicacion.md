# US-108 — Consultar trazas de una aplicación

**Épica:** Observabilidad, telemetría y diagnóstico

## Historia de usuario

Como miembro de un workspace, quiero consultar las trazas de una aplicación para analizar sus ejecuciones recientes.

## Happy path

```gherkin
Scenario: Consultar trazas propias
  Given que pertenezco al workspace de una aplicación con trazas
  When abro su panel de trazas
  Then el sistema muestra estado, fecha, workflow, versiones y dispositivo técnico de cada traza
```

## Bad path

```gherkin
Scenario: Consultar trazas de otra aplicación
  Given que no pertenezco al workspace de una aplicación
  When intento consultar sus trazas
  Then el sistema rechaza la solicitud
  And no revela su existencia
```

## Criterios de aceptación

- Las trazas están aisladas por aplicación y workspace.
- La vista no muestra imágenes ni información sensible.
- Los miembros autorizados pueden ver solo metadatos permitidos.
