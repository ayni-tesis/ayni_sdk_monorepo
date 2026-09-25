# US-121 — Mover y seleccionar varios nodos

**Épica:** Editor visual de workflows

## Historia de usuario

Como administrador de un workspace, quiero arrastrar libremente uno o varios
nodos del lienzo para organizar visualmente la lógica del workflow.

## Interfaz

En `Borrador`, cualquier parte de la tarjeta de un nodo sirve para arrastrarlo, excepto sus puertos y botones. Al soltarlo, el nodo se alinea a una cuadrícula de 16 px; el control `Alinear a la cuadrícula` activa o desactiva esa alineación. `Shift` + arrastre sobre el fondo dibuja una caja de selección; `Ctrl`/`Cmd` + clic agrega o quita un nodo de la selección; `Seleccionar todo`, en la barra del lienzo, selecciona todos los nodos, y un clic sobre el fondo limpia la selección. Los nodos seleccionados muestran un borde cian más grueso y se mueven juntos. Sin mouse, `Shift` + flechas mueve la selección una celda de la cuadrícula (16 px) en esa dirección; las flechas solas siguen llevando el foco al nodo vecino (US-129). Mientras guarda muestra `Guardando posiciones…` junto al nivel de zoom; al terminar, el indicador desaparece sin aviso adicional, porque mover es una acción frecuente; si falla, devuelve los nodos a su ubicación anterior y muestra `No pudimos guardar las posiciones. Se restauró la ubicación anterior.` Sin permisos, los nodos no se pueden arrastrar.

## Happy path

```gherkin
Scenario: Mover un grupo de nodos
  Given que soy administrador de un workflow en borrador
  And selecciono varios nodos con la caja de selección
  When los arrastro a otra zona del lienzo
  Then el sistema guarda la nueva posición de todos los nodos en una sola operación
  And los nodos conservan su distancia relativa
```

```gherkin
Scenario: Mover un nodo solo con el teclado
  Given que soy administrador de un workflow en borrador con un nodo seleccionado
  When presiono Shift + flecha derecha tres veces y suelto las teclas
  Then el nodo se desplaza 48 px a la derecha
  And el sistema guarda su nueva posición en una sola operación
```

## Bad path

```gherkin
Scenario: Falla el guardado de posiciones
  Given que soy administrador de un workflow en borrador
  When muevo varios nodos y el sistema no puede guardar sus posiciones
  Then el lienzo devuelve los nodos a su ubicación anterior
  And conserva el DAG sin cambios
```

```gherkin
Scenario: Miembro sin permisos de administración
  Given que pertenezco al workspace sin permisos de administración
  When intento arrastrar un nodo
  Then el lienzo no mueve el nodo
  And el sistema no guarda ninguna posición
```

## Criterios de aceptación

- Solo los administradores pueden mover nodos del borrador.
- Mover nodos cambia solo su posición en el lienzo; no altera nodos, conexiones ni versiones publicadas.
- Las posiciones de todos los nodos movidos se guardan juntas o no se guarda ninguna.
- Si otra persona cambió el borrador desde que se cargó, las posiciones no se guardan y se aplica US-130.
- Un nodo puede ubicarse en cualquier zona del lienzo, incluso a la izquierda o arriba del nodo inicial.
- `Alinear a la cuadrícula` está activado por defecto; desactivarlo permite posiciones libres y no mueve los nodos ya ubicados.
- El nodo seleccionado se distingue por color y por grosor del borde, no solo por color.
- Mover con `Shift` + flechas produce el mismo resultado que arrastrar: las posiciones se guardan juntas en una sola operación cuando se sueltan las teclas, con las mismas reglas de error y de conflicto.
