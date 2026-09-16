# US-030 — Agregar un nodo de condición

**Épica:** Workflows DAG

## Historia de usuario

Como administrador de un workspace, quiero agregar una condición tipada al
borrador para ramificar la ejecución según la salida de un modelo.

## Interfaz

El panel `Nodos` ofrece `Condición`. Su panel de propiedades contiene `Resultado de origen`, `Etiqueta`, `Operador` y `Umbral`; las ramas se rotulan `Verdadero` y `Falso`. El botón es `Guardar condición`; un origen incompatible muestra `Esta condición no es compatible con la salida seleccionada.`

## Happy path

```gherkin
Scenario: Agregar una condición sobre un resultado de clasificación
  Given que soy administrador de un workflow en borrador
  And existe una salida de clasificación en el DAG
  When configuro una condición con etiqueta, operador y umbral válidos
  Then el sistema agrega un nodo con ramas verdadera y falsa
```

## Bad path

```gherkin
Scenario: Usar una condición no compatible con la salida
  Given que existe una salida que no contiene etiquetas de clasificación
  When intento configurar una condición de etiqueta sobre ella
  Then el sistema rechaza la condición
  And no modifica el DAG
```

## Criterios de aceptación

- Las condiciones solo usan operaciones admitidas por el tipo de salida.
- Una condición define ramas verdadera y falsa explícitas.
- El dashboard no acepta expresiones ejecutables arbitrarias.
