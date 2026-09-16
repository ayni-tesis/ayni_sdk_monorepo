# US-111 — Ver el detalle de un error de ejecución

**Épica:** Observabilidad, telemetría y diagnóstico

## Historia de usuario

Como administrador, quiero consultar el detalle de un error para determinar qué nodo, modelo o plataforma necesita atención.

## Happy path

```gherkin
Scenario: Abrir un error registrado
  Given que existe una traza con error en mi aplicación
  When abro su detalle
  Then el sistema muestra categoría, nodo, workflow, versiones y perfil técnico asociado
```

## Bad path

```gherkin
Scenario: Consultar un error ajeno
  Given que no pertenezco al workspace de una traza
  When intento abrir su error
  Then el sistema rechaza la solicitud
  And no revela sus detalles
```

## Criterios de aceptación

- El detalle muestra solo campos sanitizados.
- El error identifica el recurso afectado cuando está disponible.
- No se muestran secretos, rutas locales ni imágenes.
