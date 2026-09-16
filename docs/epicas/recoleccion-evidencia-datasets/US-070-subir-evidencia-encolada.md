# US-070 — Subir evidencia encolada

**Épica:** Recolección de evidencia para datasets

## Historia de usuario

Como SDK, quiero subir evidencia pendiente a la aplicación correcta para que pueda formar parte de un dataset.

## Interfaz

La cola muestra `Subiendo evidencia…`, `Evidencia recibida.` o `No se pudo enviar la evidencia; se reintentará cuando sea posible.` Una credencial revocada produce `No se puede enviar evidencia porque la credencial fue revocada.`

## Happy path

```gherkin
Scenario: Cargar evidencia autorizada
  Given que existe evidencia pendiente
  And la red y consentimiento permiten el envío
  When el SDK la carga con una credencial activa
  Then el servidor la asocia a la aplicación, workflow y versión indicados
  And confirma la recepción
```

## Bad path

```gherkin
Scenario: Credencial revocada al enviar
  Given que existe evidencia pendiente
  When el SDK intenta cargarla con una credencial revocada
  Then el servidor rechaza la carga
  And el SDK no marca la evidencia como enviada
```

## Criterios de aceptación

- La carga está autenticada y limitada a la aplicación propietaria.
- El servidor no acepta evidencia de otra aplicación o workspace.
- El SDK espera confirmación antes de considerar enviada la evidencia.
