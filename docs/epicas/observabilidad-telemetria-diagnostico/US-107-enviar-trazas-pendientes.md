# US-107 — Enviar trazas pendientes

**Épica:** Observabilidad, telemetría y diagnóstico

## Historia de usuario

Como SDK, quiero enviar trazas pendientes cuando hay red y la política lo permite para centralizar diagnósticos.

## Happy path

```gherkin
Scenario: Red disponible
  Given que existen trazas pendientes y una credencial activa
  When el SDK procesa la cola con red permitida
  Then envía las trazas al servidor y las marca confirmadas
```

## Bad path

```gherkin
Scenario: Credencial revocada
  Given que existen trazas pendientes
  When el SDK intenta enviarlas con una credencial revocada
  Then el servidor rechaza el envío
  And el SDK no las marca como confirmadas
```

## Criterios de aceptación

- El envío está autenticado y limitado a una aplicación.
- El SDK espera confirmación del servidor antes de retirar una traza.
- Las trazas no incluyen imágenes ni datos de entrada crudos.
