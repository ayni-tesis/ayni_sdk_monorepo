# US-109 — Filtrar trazas de ejecución

**Épica:** Observabilidad, telemetría y diagnóstico

## Historia de usuario

Como miembro de un workspace, quiero filtrar trazas para encontrar fallos por workflow, modelo, versión o dispositivo.

## Happy path

```gherkin
Scenario: Filtrar trazas por workflow y error
  Given que una aplicación tiene trazas de varios workflows
  When aplico filtros válidos de workflow y estado de error
  Then el sistema muestra solo las trazas coincidentes
```

## Bad path

```gherkin
Scenario: Usar un filtro no admitido
  Given que consulto trazas de una aplicación
  When envío un filtro no reconocido
  Then el sistema rechaza el filtro
  And no amplía el acceso a datos
```

## Criterios de aceptación

- Se filtra por workflow, modelo, versión, estado, fecha y perfil técnico.
- Los filtros se limitan a la aplicación solicitada.
- Un filtro inválido no modifica ni elimina trazas.
