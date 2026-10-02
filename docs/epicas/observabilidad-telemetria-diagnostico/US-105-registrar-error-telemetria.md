# US-105 — Registrar un error de ejecución en telemetría

**Épica:** Observabilidad, telemetría y diagnóstico

## Historia de usuario

Como administrador, quiero registrar errores de ejecución para diagnosticar fallos sin acceder a datos sensibles de usuarios.

## Happy path

```gherkin
Scenario: Error de modelo
  Given que la telemetría está habilitada
  When un nodo de modelo falla
  Then el SDK registra categoría de error, nodo, workflow y versiones involucradas
```

## Bad path

```gherkin
Scenario: Excepción con datos sensibles
  Given que el runtime devuelve un mensaje con datos internos
  When el SDK registra el error
  Then sanitiza el mensaje
  And no envía rutas locales, secretos ni entradas crudas
```

## Criterios de aceptación

- La telemetría diferencia categorías de error tipadas.
- Los mensajes se sanitizan antes de almacenarse o enviarse.
- El error se asocia a la instalación sin identificar físicamente el dispositivo.
- `Recursos` → `Datos y privacidad` (US-147) describe, en el mismo cambio, los
  datos que esta historia agrega o cambia, la política que los habilita, el
  consentimiento que resulte aplicable (sin tratar `sdkImprovement` como consentimiento para la validación) y su retención.

## Criterios para validación técnica

- El error se relaciona con `traceId`, corrida/repetición, fase o nodo, workflow, modelo y versiones cuando estén disponibles.
- Se conserva la categoría tipada y el estado de la ejecución; mensajes arbitrarios del runtime se sanitizan antes de persistirse o transmitirse.
- El diagnóstico no incluye imagen, tensor, secreto, ruta local ni contenido no decodificado de la entrada.
