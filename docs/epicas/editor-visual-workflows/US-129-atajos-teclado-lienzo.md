# US-129 — Usar atajos de teclado en el lienzo

**Épica:** Editor visual de workflows

## Historia de usuario

Como administrador de un workspace, quiero usar atajos de teclado en el lienzo
para editar workflows sin depender del mouse.

## Interfaz

Con el foco en el lienzo: `Supr` o `Retroceso` elimina la selección; `Ctrl`/`Cmd` + `A` selecciona todos los nodos; `1` ajusta a la vista; `0` restablece el zoom al 100 %; `+` y `-` acercan y alejan; `Shift` + `Alt` + `T` ordena los nodos; `Enter` abre `Detalles del nodo`; `Tab` abre `Agregar nodo`; las flechas mueven la selección al nodo vecino; `Esc` cierra paneles y limpia la selección; `?`, o el botón `Atajos de teclado` de la barra del lienzo, abre un panel con la lista completa. Eliminar un nodo pide confirmación como hoy, y eliminar varios muestra `¿Eliminar <n> nodos?` con `También se eliminarán sus conexiones y las condiciones o salidas que dependen de ellos.`, `Eliminar nodos` y `Cancelar`. Después muestra `Nodos eliminados.`; si falla, `No pudimos eliminar los nodos.` y el lienzo no cambia. Sin permisos, solo funcionan los atajos de navegación y selección.

## Happy path

```gherkin
Scenario: Eliminar varios nodos con el teclado
  Given que soy administrador de un workflow en borrador
  And selecciono dos nodos
  When presiono Supr y confirmo Eliminar nodos
  Then el sistema elimina ambos nodos, sus conexiones y los nodos que dependen de ellos
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
- Eliminar varios nodos elimina todos o ninguno.
- Cada atajo tiene una acción equivalente visible en la interfaz.
- En macOS los atajos usan `Cmd` en lugar de `Ctrl`.
