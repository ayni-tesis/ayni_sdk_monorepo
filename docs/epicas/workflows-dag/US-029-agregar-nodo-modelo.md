# US-029 — Agregar un nodo de modelo

**Épica:** Workflows DAG

## Historia de usuario

Como administrador de un workspace, quiero agregar un nodo de modelo al
borrador para ejecutar una versión TensorFlow Lite dentro del workflow.

## Interfaz

En `Borrador` → panel `Nodos` → `Modelo`, el selector muestra solo modelos y versiones de la aplicación con contrato definido. La tarjeta muestra `<modelo> · <versión>` y sus puertos. Sin contrato aparece `Esta versión necesita un contrato antes de usarse en un workflow.`; ante éxito, `Nodo de modelo agregado.`

## Happy path

```gherkin
Scenario: Agregar un modelo de la aplicación
  Given que soy administrador de un workflow en borrador
  And existe una versión de modelo con contrato definido en la misma aplicación
  When la selecciono para crear un nodo de modelo
  Then el sistema agrega el nodo con las entradas y salidas de su contrato
```

## Bad path

```gherkin
Scenario: Seleccionar un modelo de otra aplicación
  Given que soy administrador de un workflow
  When intento agregar una versión de modelo de otra aplicación
  Then el sistema rechaza la operación
  And no añade el nodo
```

```gherkin
Scenario: Seleccionar una versión sin contrato
  Given que una versión de modelo no tiene contrato definido
  When intento agregarla a un workflow
  Then el sistema rechaza la operación
  And no añade el nodo
```

## Criterios de aceptación

- Un nodo de modelo referencia una versión concreta e inmutable.
- El modelo debe pertenecer a la misma aplicación que el workflow.
- Las entradas y salidas del nodo proceden de su contrato registrado.
