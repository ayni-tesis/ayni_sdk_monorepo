# US-110 — Ver métricas agregadas

**Épica:** Observabilidad, telemetría y diagnóstico

## Historia de usuario

Como administrador, quiero ver métricas agregadas para comparar estabilidad y rendimiento de workflows y modelos.

## Happy path

```gherkin
Scenario: Consultar métricas de un periodo
  Given que una aplicación tiene trazas en un periodo
  When consulto sus métricas agregadas
  Then el sistema muestra cantidad de ejecuciones, tasa de errores y duración por workflow y modelo
```

## Bad path

```gherkin
Scenario: Periodo sin trazas
  Given que no existen trazas en el periodo solicitado
  When consulto las métricas
  Then el sistema muestra un estado sin datos
  And no inventa valores agregados
```

## Criterios de aceptación

- Las métricas se calculan solo con trazas de la aplicación.
- La vista distingue workflow, versión y modelo cuando hay datos.
- Las métricas no exponen imágenes ni entradas crudas.
