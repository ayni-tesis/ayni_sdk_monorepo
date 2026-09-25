# US-123 — Seleccionar y eliminar conexiones en el lienzo

**Épica:** Editor visual de workflows

## Historia de usuario

Como administrador de un workspace, quiero seleccionar una arista directamente
en el lienzo y eliminarla para corregir el flujo sin buscarla en una lista.

## Interfaz

Al pasar el cursor sobre una arista, esta se engrosa; al hacer clic queda seleccionada en cian y muestra en su punto medio el botón `Eliminar conexión`. La tecla `Supr` elimina la arista seleccionada. Tras eliminarla muestra `Conexión eliminada.` con la acción `Deshacer`, disponible mientras el aviso está visible (5 segundos). `Deshacer` vuelve a crear la misma conexión solo si el borrador no cambió desde la eliminación; si cambió, muestra `No pudimos restaurar la conexión porque el borrador cambió.` Si eliminar falla, muestra `No pudimos eliminar la conexión.` y la arista permanece. Solo se eliminan las conexiones entre puertos, como imagen → modelo. Las aristas que dan el origen obligatorio de una condición o una salida no se pueden eliminar: al seleccionarlas, el botón aparece deshabilitado con la ayuda `Esta conexión es obligatoria. Reasígnala arrastrándola a otro nodo.` (US-131). Esta interacción reemplaza la lista de conexiones que hoy aparece debajo del lienzo. Sin permisos, las aristas se pueden seleccionar para inspeccionarlas, pero no eliminar.

## Happy path

```gherkin
Scenario: Eliminar una conexión desde el lienzo
  Given que soy administrador de un workflow en borrador
  And una imagen está conectada a un nodo de modelo
  When selecciono esa arista en el lienzo y elijo Eliminar conexión
  Then el sistema elimina la arista del DAG
  And conserva ambos nodos
```

## Bad path

```gherkin
Scenario: Eliminar el origen obligatorio de una salida
  Given que soy administrador de un workflow en borrador
  When selecciono la arista que da el origen a un nodo de salida
  Then el lienzo no permite eliminarla
  And explica cómo reasignar ese origen
```

```gherkin
Scenario: Miembro sin permisos de administración
  Given que pertenezco al workspace sin permisos de administración
  When selecciono una arista del lienzo
  Then el lienzo no ofrece eliminarla
  And conserva el DAG
```

## Criterios de aceptación

- Solo los administradores pueden eliminar conexiones del borrador.
- Eliminar una conexión no elimina los nodos que unía.
- `Deshacer` restaura la conexión eliminada con los mismos puertos solo si la revisión del borrador es la misma que dejó la eliminación (US-130); en otro caso, el DAG no cambia.
- El origen obligatorio de una condición o una salida solo se puede reasignar, no dejar vacío.
- La arista seleccionada se distingue por color y por grosor, no solo por color.
