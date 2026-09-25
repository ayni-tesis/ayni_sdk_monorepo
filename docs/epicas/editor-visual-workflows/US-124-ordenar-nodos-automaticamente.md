# US-124 — Ordenar automáticamente los nodos

**Épica:** Editor visual de workflows

## Historia de usuario

Como administrador de un workspace, quiero ordenar automáticamente los nodos
del lienzo para leer el workflow de izquierda a derecha sin acomodarlo a mano.

## Interfaz

La barra del lienzo ofrece `Ordenar nodos` (atajo `Shift` + `Alt` + `T`). La acción acomoda los nodos por niveles del DAG, de izquierda a derecha, empezando por la entrada de imagen y separando las ramas `Verdadero` y `Falso`. Usa el tamaño real de cada tarjeta en pantalla. Los nodos que no se alcanzan desde la entrada de imagen se ubican en una fila aparte, debajo del flujo principal. Después ajusta la vista a todos los nodos. Mientras guarda muestra `Ordenando nodos…`; al terminar, `Nodos ordenados.` con la acción `Deshacer`, que restaura las posiciones anteriores. Si falla, conserva las posiciones anteriores y muestra `No pudimos ordenar los nodos. Inténtalo nuevamente.` Sin nodos, el botón está deshabilitado con la ayuda `No hay nodos para ordenar.`; sin permisos, no aparece.

## Happy path

```gherkin
Scenario: Ordenar un workflow desordenado
  Given que soy administrador de un workflow en borrador con nodos superpuestos
  When elijo Ordenar nodos
  Then el sistema guarda una posición nueva para cada nodo en una sola operación
  And ningún nodo queda superpuesto a otro
  And cada nodo queda a la derecha de los nodos de los que depende
```

## Bad path

```gherkin
Scenario: Falla el guardado del orden
  Given que soy administrador de un workflow en borrador
  When elijo Ordenar nodos y el sistema no puede guardar las posiciones
  Then el lienzo conserva las posiciones anteriores
  And conserva el DAG sin cambios
```

## Criterios de aceptación

- Solo los administradores pueden ordenar los nodos del borrador.
- Ordenar cambia solo posiciones; no altera nodos, conexiones ni versiones publicadas.
- Ordenar dos veces seguidas el mismo borrador produce las mismas posiciones: los empates dentro de un nivel se resuelven por el orden de los nodos en el borrador.
- Ningún par de tarjetas se superpone según su tamaño medido, con una separación mínima de 48 px entre niveles y de 24 px entre nodos de un mismo nivel.
- Los nodos desconectados o con errores de validación también se ordenan y no bloquean la acción.
- `Deshacer` restaura exactamente las posiciones previas al orden.
