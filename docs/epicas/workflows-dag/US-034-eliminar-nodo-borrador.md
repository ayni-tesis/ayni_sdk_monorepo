# US-034 — Eliminar un nodo del borrador

**Épica:** Workflows DAG

## Historia de usuario

Como administrador de un workspace, quiero eliminar un nodo del borrador para
corregir o simplificar la lógica de un workflow antes de publicarlo.

## Interfaz

Seleccionar un nodo del lienzo muestra `Eliminar nodo`. El diálogo dice `¿Eliminar "<nodo>"?` y `También se eliminarán sus conexiones.`; ofrece `Eliminar nodo` y `Cancelar`. Tras confirmar muestra `Nodo eliminado.`; sin permisos, `No tienes permiso para editar este workflow.`

## Happy path

```gherkin
Scenario: Eliminar un nodo y sus conexiones
  Given que soy administrador de un workflow en borrador
  And el DAG contiene un nodo conectado
  When elimino ese nodo
  Then el sistema elimina el nodo y las aristas que lo referencian
```

## Bad path

```gherkin
Scenario: Miembro sin permisos de administración
  Given que pertenezco al workspace sin permisos de administración
  When intento eliminar un nodo
  Then el sistema rechaza la operación
  And conserva el DAG
```

## Criterios de aceptación

- Solo los administradores pueden eliminar nodos del borrador.
- Eliminar un nodo elimina sus aristas entrantes y salientes.
- Eliminar un nodo no altera las versiones publicadas.
