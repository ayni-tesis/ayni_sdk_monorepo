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
- Las trazas no incluyen imágenes ni tensores/binarios arbitrarios del runtime; pueden incluir resultados estructurados decodificados de la inferencia.
- `Recursos` → `Datos y privacidad` (US-147) describe, en el mismo cambio, los
  datos que esta historia agrega o cambia, la política que los habilita, el
  consentimiento que resulte aplicable (sin tratar `sdkImprovement` como consentimiento para la validación) y su retención.

## Criterios para validación técnica

- La ingesta deriva la aplicación de la credencial SDK y comprueba nuevamente que la política de telemetría esté habilitada.
- Antes de cada intento de transmisión, el SDK refresca la política; si está deshabilitada o no se puede obtener una política vigente, conserva las trazas pendientes y no las transmite.
- El SDK rechaza redirecciones a un origen distinto del configurado y nunca reenvía la credencial a otro origen.
- Repetir el mismo `(applicationId, traceId)` y contenido confirma idempotentemente; reutilizarlo con contenido distinto se rechaza sin reemplazar el registro.
- El SDK retira de la outbox solo los registros confirmados por el servidor; ante fallo de red, credencial revocada o rechazo, conserva el registro pendiente.
- Control y tratamiento usan el mismo esquema de ingesta. Los campos enviados por el cliente se guardan marcados como `clientReported`/no verificados.
