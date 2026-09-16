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
