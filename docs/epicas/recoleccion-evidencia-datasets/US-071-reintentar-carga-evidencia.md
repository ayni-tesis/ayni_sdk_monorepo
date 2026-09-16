# US-071 — Reintentar la carga de evidencia

**Épica:** Recolección de evidencia para datasets

## Historia de usuario

Como SDK, quiero reintentar una carga fallida de evidencia para recuperarme de fallos temporales de red.

## Interfaz

Los estados de cola son `Pendiente`, `Reintentando`, `Enviada` y `Fallida`. Cuando alcanza el límite, la app de diagnóstico muestra `No se pudo enviar la evidencia después de varios intentos.`

## Happy path

```gherkin
Scenario: Reintento exitoso
  Given que una evidencia pendiente falló por un problema temporal de red
  When el SDK vuelve a procesar la cola con red disponible
  Then reintenta su carga
  And la marca enviada tras la confirmación del servidor
```

## Bad path

```gherkin
Scenario: Fallos repetidos
  Given que una evidencia continúa fallando al cargarse
  When el SDK alcanza el límite de reintentos configurado
  Then conserva la evidencia como fallida
  And deja de reintentarlo automáticamente
```

## Criterios de aceptación

- Los reintentos no duplican evidencia confirmada por el servidor.
- Un fallo temporal no elimina la evidencia pendiente.
- El SDK limita los reintentos para evitar consumo indefinido de red y batería.
