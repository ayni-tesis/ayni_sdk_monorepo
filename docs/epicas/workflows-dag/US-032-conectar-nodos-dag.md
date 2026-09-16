# US-032 — Conectar nodos compatibles del DAG

**Épica:** Workflows DAG

## Historia de usuario

Como administrador de un workspace, quiero conectar nodos compatibles para
dirigir los datos y el orden de ejecución del workflow.

## Interfaz

En el lienzo del borrador, la persona arrastra desde un puerto de salida a un puerto de entrada; los puertos compatibles se resaltan. Tras soltar, aparece `Conexión creada.`; los incompatibles muestran `Estos puertos no son compatibles.` y no dibujan una arista. Una arista seleccionada ofrece `Eliminar conexión`.

## Happy path

```gherkin
Scenario: Conectar una imagen con un nodo de modelo
  Given que soy administrador de un workflow en borrador
  And existen una salida de imagen y una entrada de modelo compatible
  When creo una conexión entre ambas
  Then el sistema guarda la arista en el DAG
```

## Bad path

```gherkin
Scenario: Conectar tipos incompatibles
  Given que existen dos puertos con tipos incompatibles
  When intento conectarlos
  Then el sistema rechaza la arista
  And conserva el DAG sin cambios
```

## Criterios de aceptación

- Una arista conecta una salida con una entrada compatible.
- El sistema impide conexiones duplicadas.
- El sistema no altera nodos ni aristas existentes al rechazar una conexión.
