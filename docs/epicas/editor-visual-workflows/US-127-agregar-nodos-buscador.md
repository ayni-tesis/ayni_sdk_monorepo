# US-127 — Agregar nodos desde un buscador

**Épica:** Editor visual de workflows

## Historia de usuario

Como administrador de un workspace, quiero buscar el tipo de nodo que necesito
y agregarlo al lienzo en un solo paso para construir workflows más rápido.

## Interfaz

La barra del lienzo ofrece `Agregar nodo` (botón `+`, atajo `Tab`), que abre el panel `Agregar nodo` con el campo `Buscar nodos…` y las categorías `Entrada`, `Modelos`, `Lógica` y `Salida`. `Modelos` lista cada versión de modelo disponible por nombre y versión; si la aplicación no tiene modelos muestra `No hay modelos registrados`, si ninguna versión tiene contrato, `No hay versiones con contrato` y `Registra una versión y configura su contrato para usar ese modelo en el workflow.`; y si solo algunas lo tienen, `Las versiones sin contrato no se pueden agregar al workflow.` Cada tipo muestra una descripción breve; los que no se pueden agregar aparecen deshabilitados con su motivo, por ejemplo `Este workflow ya tiene una entrada de imagen.` Elegir un tipo sin configuración lo agrega en el centro del área visible, o donde se suelte si se arrastra al lienzo. Una condición o una salida muestra primero, dentro del panel, los mismos campos que hoy (`Resultado de origen`, `Etiqueta`, `Operador`, `Umbral`, o `Nombre de salida` y `Tipo de resultado`) con `Agregar condición` o `Agregar salida`. Al agregarlo muestra el mensaje actual de cada tipo (`Nodo agregado.`, `Nodo de modelo agregado.`, `Condición agregada.` o `Nodo de salida agregado.`); si falla, el suyo (`No pudimos agregar el nodo.`, `No pudimos agregar la condición.` o `No pudimos agregar la salida.`). Si la búsqueda no encuentra nada muestra `No hay nodos que coincidan con "<texto>".` Este panel reemplaza la sección `Nodos disponibles` y sus formularios. Sin permisos, el botón no aparece.

## Happy path

```gherkin
Scenario: Agregar un modelo buscándolo por nombre
  Given que soy administrador de un workflow en borrador
  When abro Agregar nodo y busco el nombre de un modelo
  And elijo una de sus versiones
  Then el sistema agrega un nodo de modelo con esa versión
  And el nodo aparece en el área visible del lienzo
```

## Bad path

```gherkin
Scenario: Agregar una segunda entrada de imagen
  Given que soy administrador de un workflow que ya tiene una entrada de imagen
  When abro Agregar nodo
  Then la entrada de imagen aparece deshabilitada
  And el panel explica que el workflow ya tiene una entrada de imagen
```

## Criterios de aceptación

- Solo los administradores pueden agregar nodos al borrador.
- El buscador filtra por nombre de tipo, nombre de modelo y descripción, sin distinguir mayúsculas ni tildes.
- Solo aparecen las versiones con contrato definido de los modelos de la aplicación del workflow.
- Las condiciones y las salidas se crean con su origen y su configuración completos, con las mismas reglas que hoy.
- El panel se puede recorrer y usar solo con teclado.
