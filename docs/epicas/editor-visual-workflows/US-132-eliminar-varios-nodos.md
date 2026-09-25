# US-132 — Eliminar varios nodos a la vez

**Épica:** Editor visual de workflows

## Historia de usuario

Como administrador de un workspace, quiero eliminar de una vez varios nodos
seleccionados para simplificar el borrador sin repetir la acción nodo por nodo.

## Interfaz

Con dos o más nodos seleccionados (US-121), la barra del lienzo muestra `Eliminar nodos`; la tecla `Supr` abre el mismo diálogo (US-129). El diálogo dice `¿Eliminar <n> nodos?` y `También se eliminarán sus conexiones y las condiciones o salidas que dependen de ellos.`, e indica cuántos nodos dependientes se eliminarán además de los seleccionados. Ofrece `Eliminar nodos` y `Cancelar`. Mientras elimina muestra `Eliminando nodos…`; al terminar, `Nodos eliminados.`; si falla, `No pudimos eliminar los nodos.` y el lienzo no cambia. Sin permisos, la acción no aparece.

## Happy path

```gherkin
Scenario: Eliminar varios nodos y sus dependientes
  Given que soy administrador de un workflow en borrador
  And selecciono dos modelos, y uno de ellos alimenta una condición
  When elijo Eliminar nodos y confirmo
  Then el sistema elimina ambos modelos, la condición dependiente y sus conexiones en una sola operación
```

## Bad path

```gherkin
Scenario: Falla la eliminación de varios nodos
  Given que soy administrador de un workflow en borrador con varios nodos seleccionados
  When confirmo Eliminar nodos y el sistema no puede completar la operación
  Then el sistema no elimina ningún nodo
  And conserva el DAG sin cambios
```

```gherkin
Scenario: Miembro sin permisos de administración
  Given que pertenezco al workspace sin permisos de administración
  When selecciono varios nodos
  Then el lienzo no ofrece eliminarlos
  And conserva el DAG
```

## Criterios de aceptación

- Solo los administradores pueden eliminar nodos del borrador.
- Eliminar varios nodos elimina todos, junto con sus dependientes y conexiones, o ninguno.
- El diálogo informa el número total de nodos que se eliminarán, incluidos los dependientes.
- Eliminar nodos no altera las versiones publicadas.
- Con un solo nodo seleccionado se usa el flujo de US-034.
