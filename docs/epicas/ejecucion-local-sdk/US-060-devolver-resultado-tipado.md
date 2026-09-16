# US-060 — Devolver un resultado tipado

**Épica:** Ejecución local del SDK

## Historia de usuario

Como desarrollador Flutter, quiero recibir un resultado tipado del workflow para mostrarlo sin interpretar internamente el DAG.

## Interfaz

`sdk.run` devuelve `WorkflowResult` con `workflowId`, `workflowVersion` y salida tipada. La app puede renderizar la salida sin leer nodos; si no llega a una salida muestra `El análisis no produjo un resultado.`

## Happy path

```gherkin
Scenario: Workflow finalizado
  Given que un workflow llega a un nodo de salida válido
  When el SDK termina su ejecución
  Then devuelve un resultado tipado con el identificador y versión del workflow
```

## Bad path

```gherkin
Scenario: Workflow sin salida alcanzable
  Given que el SDK no alcanza un nodo de salida
  When termina la ejecución
  Then devuelve outputNotReached
  And no devuelve datos ambiguos como éxito
```

## Criterios de aceptación

- El resultado identifica workflow, versión y tipo de salida.
- La app no necesita conocer nodos internos para consumir el resultado.
- Un resultado de error se distingue de uno exitoso.
