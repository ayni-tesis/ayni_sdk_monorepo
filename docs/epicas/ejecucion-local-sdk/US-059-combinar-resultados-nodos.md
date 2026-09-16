# US-059 — Combinar resultados de nodos

**Épica:** Ejecución local del SDK

## Historia de usuario

Como SDK, quiero combinar entradas de nodos compatibles para producir una salida final de workflow.

## Interfaz

`WorkflowResult` expone campos de salida con sus nombres publicados, no IDs internos de aristas. Si falta un valor requerido, devuelve `outputInputMissing` y la app muestra `No se pudo construir el resultado del análisis.`

## Happy path

```gherkin
Scenario: Salida final con clasificación y detección
  Given que un nodo de salida recibe resultados compatibles de dos nodos
  When el SDK construye la salida
  Then devuelve ambos resultados con sus identificadores de nodo
```

## Bad path

```gherkin
Scenario: Salida con una dependencia faltante
  Given que un nodo de salida requiere un resultado que no fue producido
  When el SDK construye la salida
  Then devuelve outputInputMissing
  And no devuelve una salida final parcial
```

## Criterios de aceptación

- El nodo de salida solo combina entradas declaradas en el workflow.
- Los resultados conservan su tipo e identificador de origen.
- Una salida incompleta devuelve un error tipado.
