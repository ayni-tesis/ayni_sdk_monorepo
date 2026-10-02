# US-112 — Aplicar retención de telemetría

**Épica:** Observabilidad, telemetría y diagnóstico

## Historia de usuario

Como administrador, quiero definir la retención de telemetría para conservar diagnóstico útil sin almacenar trazas indefinidamente.

## Happy path

```gherkin
Scenario: Eliminar trazas vencidas
  Given que una aplicación tiene una política de retención
  When una traza supera el periodo configurado
  Then el sistema elimina o anonimiza la traza según la política
```

## Bad path

```gherkin
Scenario: Retención inválida
  Given que soy administrador de una aplicación
  When intento guardar un periodo de retención no permitido
  Then el sistema rechaza la política
  And conserva la anterior
```

## Criterios de aceptación

- La retención se aplica por aplicación.
- Solo administradores modifican el periodo de retención.
- Las trazas vencidas no aparecen en consultas ni métricas posteriores.
- `Recursos` → `Datos y privacidad` (US-147) describe, en el mismo cambio, los
  datos que esta historia agrega o cambia, la política que los habilita, el
  consentimiento que resulte aplicable (sin tratar `sdkImprovement` como consentimiento para la validación) y su retención.

## Criterios para validación técnica

- El vencimiento se calcula desde la recepción de la traza por el servidor y no se extiende al consultarla o exportarla.
- La tarea de retención elimina también los objetos R2 vinculados a esa traza.
- Trazas y artifacts vencidos dejan de estar disponibles en detalle, filtros, métricas, JSONL y descarga.
- Copias exportadas fuera del servicio quedan sujetas al procedimiento de conservación del investigador y no modifican la retención del servidor.
