# US-106 — Encolar trazas sin conexión

**Épica:** Observabilidad, telemetría y diagnóstico

## Historia de usuario

Como SDK, quiero encolar trazas cuando no hay red para enviarlas después sin interrumpir la ejecución local.

## Happy path

```gherkin
Scenario: Ejecución offline
  Given que la telemetría está habilitada y no hay conexión
  When termina un workflow
  Then el SDK guarda la traza en una cola local
```

## Bad path

```gherkin
Scenario: Cola local sin espacio
  Given que no queda espacio para una nueva traza
  When el SDK intenta encolarla
  Then descarta la traza nueva
  And no falla la ejecución del workflow
```

## Criterios de aceptación

- La cola de telemetría no bloquea la inferencia.
- Una traza pendiente no se marca como enviada.
- Un fallo de cola no afecta workflows ni modelos locales.
