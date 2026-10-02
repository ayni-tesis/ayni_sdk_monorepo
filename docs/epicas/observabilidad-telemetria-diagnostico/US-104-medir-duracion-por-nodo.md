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
- `Recursos` → `Datos y privacidad` (US-147) describe, en el mismo cambio, los
  datos que esta historia agrega o cambia, la política que los habilita, el
  consentimiento que resulte aplicable (sin tratar `sdkImprovement` como consentimiento para la validación) y su retención.

## Criterios para validación técnica

- El registro distingue duración total y duración por fase/nodo, con unidad documentada y estado por nodo.
- Un nodo no ejecutado o cancelado antes de iniciar no se representa con duración cero como si hubiera corrido.
- La medición conserva la condición, corrida y repetición de la traza para comparar control y tratamiento.
