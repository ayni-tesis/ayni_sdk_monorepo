# US-050 — Ejecutar un workflow por identificador

**Épica:** Ejecución local del SDK

## Historia de usuario

Como desarrollador Flutter, quiero ejecutar un workflow local por su identificador para obtener el resultado configurado en el dashboard.

## Interfaz

API: `sdk.run(workflowId, input)`. La app puede mostrar `Analizando…`; si no existe, `Este workflow no está disponible en el dispositivo. Sincroniza para continuar.`

## Happy path

```gherkin
Scenario: Ejecutar un workflow disponible
  Given que existe un workflow local válido con sus dependencias instaladas
  When la app solicita ejecutarlo por identificador
  Then el SDK inicia su ejecución local
```

## Bad path

```gherkin
Scenario: Workflow no disponible
  Given que el workflow solicitado no existe localmente
  When la app solicita ejecutarlo
  Then el SDK devuelve workflowNotAvailable
  And no inicia inferencias
```

## Criterios de aceptación

- El SDK ejecuta solo workflows validados y disponibles localmente.
- La solicitud identifica el workflow sin requerir acceso a la red.
- Un workflow faltante devuelve un error tipado.
