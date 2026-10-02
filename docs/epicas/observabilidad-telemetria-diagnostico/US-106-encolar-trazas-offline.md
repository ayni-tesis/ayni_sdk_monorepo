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
  Then indica que la evidencia de esa ejecución quedó incompleta
  And no falla la ejecución del workflow
```

## Criterios de aceptación

- La cola de telemetría no bloquea la inferencia.
- Una traza pendiente no se marca como enviada.
- Un fallo de cola no afecta workflows ni modelos locales.
- `Recursos` → `Datos y privacidad` (US-147) describe, en el mismo cambio, los
  datos que esta historia agrega o cambia, la política que los habilita, el
  consentimiento que resulte aplicable (sin tratar `sdkImprovement` como consentimiento para la validación) y su retención.

## Criterios para validación técnica

- El SDK persiste la traza durablemente antes de devolver el resultado de ejecución, sin esperar red ni respuesta del servidor.
- La outbox conserva las trazas pendientes a través de reinicios y cada una mantiene su `traceId` para reintentos idempotentes.
- Si no hay espacio, la inferencia sigue siendo exitosa y el resultado informa que su evidencia no pudo persistirse; no se marca ni reporta como enviada.
- Si la política se deshabilita, las trazas pendientes se conservan pero no se transmiten mientras siga deshabilitada.
