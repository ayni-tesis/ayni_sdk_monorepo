# US-104 — Medir duración por nodo

**Épica:** Observabilidad, telemetría y diagnóstico

## Historia de usuario

Como administrador, quiero conocer la duración de cada nodo para identificar cuellos de botella del workflow.

## Happy path

```gherkin
Scenario: Workflow con varios nodos
  Given que la telemetría está habilitada
  When el SDK ejecuta un workflow
  Then la traza registra la duración de cada nodo ejecutado
```

## Bad path

```gherkin
Scenario: Nodo cancelado antes de iniciar
  Given que una ejecución se cancela antes de un nodo pendiente
  When se registra la traza
  Then el SDK no reporta duración de ese nodo como si se hubiera ejecutado
```

## Criterios de aceptación

- La duración total y por nodo usan una misma unidad de tiempo documentada.
- Solo se registran nodos realmente ejecutados.
- Las métricas no incluyen entradas ni imágenes.
