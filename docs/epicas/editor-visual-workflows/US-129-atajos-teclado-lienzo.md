# US-129 — Usar atajos de teclado en el lienzo

**Épica:** Editor visual de workflows

## Historia de usuario

Como administrador de un workspace, quiero usar atajos de teclado en el lienzo
para editar workflows sin depender del mouse.

## Interfaz

Con el foco en el lienzo: `Supr` o `Retroceso` elimina la selección con el flujo que corresponda: un nodo, con el diálogo de US-034; varios nodos, con el de US-132; una conexión, sin diálogo y con `Deshacer` (US-123); `Ctrl`/`Cmd` + `A` selecciona todos los nodos; `1` ajusta a la vista; `0` restablece el zoom al 100 %; `+` y `-` acercan y alejan; `Shift` + `Alt` + `T` ordena los nodos; `Enter` abre `Detalles del nodo`; `Tab` abre `Agregar nodo`; las flechas mueven la selección al nodo vecino; `Esc` cierra paneles y limpia la selección; `?`, o el botón `Atajos de teclado` de la barra del lienzo, abre un panel que lista cada atajo junto a su equivalente visible. Esos equivalentes son los controles del lienzo (US-120), `Seleccionar todo` (US-121), `Ordenar nodos` (US-124), el doble clic que abre `Detalles del nodo` (US-126), `Agregar nodo` (US-127), `Eliminar nodo` (US-034), `Eliminar nodos` (US-132), `Eliminar conexión` (US-123), el clic sobre un nodo en lugar de las flechas, y el botón de cerrar de cada panel o el clic sobre el fondo en lugar de `Esc`. Sin permisos, solo funcionan los atajos de navegación y selección.

## Happy path

```gherkin
Scenario: Ajustar la vista y abrir un nodo con el teclado
  Given que soy administrador de un workflow en borrador con el foco en el lienzo
  When presiono 1, selecciono un nodo con las flechas y presiono Enter
  Then el lienzo muestra todos los nodos
  And se abre Detalles del nodo del nodo seleccionado
```

## Bad path

```gherkin
Scenario: Escribir en un campo del panel
  Given que estoy editando un campo en Detalles del nodo
  When presiono Retroceso
  Then el campo borra un carácter
  And el lienzo no elimina el nodo
```

```gherkin
Scenario: Miembro sin permisos de administración
  Given que pertenezco al workspace sin permisos de administración
  When presiono Supr con un nodo seleccionado
  Then el lienzo no ofrece eliminarlo
  And conserva el DAG
```

## Criterios de aceptación

- Los atajos no se activan mientras el foco está en un campo de texto, un menú o un diálogo.
- Cada atajo tiene una acción equivalente visible en la interfaz, y el panel `Atajos de teclado` la nombra.
- Los atajos solo invocan acciones de otras historias; no agregan comportamiento propio al borrador.
- En macOS los atajos usan `Cmd` en lugar de `Ctrl`.
