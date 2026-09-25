# US-130 — Proteger el borrador ante ediciones simultáneas

**Épica:** Editor visual de workflows

## Historia de usuario

Como administrador de un workspace, quiero que el editor me avise cuando otra
persona cambió el borrador que estoy editando para no sobrescribir su trabajo
con una vista desactualizada.

## Interfaz

Cada cambio que el lienzo envía indica en qué versión del borrador se basó: mover o agregar nodos, conectar, reasignar un origen, editar un nodo, ordenar o eliminar. Si otra persona cambió el borrador desde que se cargó, el cambio no se aplica, el lienzo vuelve al estado anterior y aparece el aviso `Otra persona modificó este borrador. Recarga para ver los cambios.` con la acción `Recargar borrador`. Mientras recarga muestra `Cargando workflow…`; después muestra el borrador actualizado y conserva el zoom y la posición de la vista. Si la recarga falla, se ve el mensaje actual `No pudimos cargar el workflow. Inténtalo nuevamente.`

## Happy path

```gherkin
Scenario: Recargar tras un cambio de otra persona
  Given que dos administradores tienen abierto el mismo borrador
  And el primero mueve un nodo y el sistema guarda el cambio
  When el segundo intenta conectar dos nodos con su vista anterior
  Then el sistema rechaza la conexión sin modificar el borrador
  And el segundo administrador ve el aviso con Recargar borrador
  And al recargar ve el nodo en la posición guardada por el primero
```

## Bad path

```gherkin
Scenario: Guardar posiciones sobre un borrador desactualizado
  Given que el borrador cambió después de que lo abrí
  When muevo varios nodos
  Then el sistema no guarda ninguna posición
  And el lienzo devuelve los nodos a su ubicación anterior
  And muestra que otra persona modificó el borrador
```

## Criterios de aceptación

- Todo cambio del borrador hecho desde el lienzo se rechaza si se basa en una versión del borrador que ya no es la actual.
- Un cambio rechazado por este motivo no modifica nodos, conexiones ni posiciones.
- Cada cambio aceptado deja al borrador en una versión nueva, que el lienzo usa para el siguiente cambio.
- Las reglas de compatibilidad, ciclos y validación se evalúan sobre el mismo conjunto de aristas: las conexiones entre puertos y los orígenes de condiciones y salidas.
- La protección no cambia las versiones publicadas ni la definición que recibe el SDK.
