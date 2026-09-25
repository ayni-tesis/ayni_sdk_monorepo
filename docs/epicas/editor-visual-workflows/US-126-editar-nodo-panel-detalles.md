# US-126 — Editar un nodo desde el panel de detalles

**Épica:** Editor visual de workflows

## Historia de usuario

Como administrador de un workspace, quiero abrir el detalle de un nodo y
modificar su configuración para corregirlo sin eliminarlo y volver a crearlo.

## Interfaz

Doble clic sobre un nodo, o `Enter` con el nodo seleccionado, abre a la derecha el panel `Detalles del nodo` sin ocultar el lienzo. En una condición se editan `Etiqueta`, `Operador` y `Umbral`; en una salida, `Nombre de salida`. En un modelo, el panel muestra el modelo, la versión y el contrato de entrada y salida sin permitir editarlos. La acción principal es `Guardar cambios del nodo` y la secundaria, `Cancelar`. Mientras guarda muestra `Guardando cambios…`; al terminar, `Nodo actualizado.` y el nodo refleja el cambio en el lienzo. Si la etiqueta no existe en el modelo de origen muestra el mensaje actual `Esta condición no es compatible con la salida seleccionada.`; si falla, `No pudimos guardar los cambios del nodo.` Sin permisos, el panel muestra `Solo lectura` y no ofrece guardar.

## Happy path

```gherkin
Scenario: Cambiar el umbral de una condición
  Given que soy administrador de un workflow en borrador con una condición
  When abro los detalles de la condición y cambio su umbral
  And elijo Guardar cambios del nodo
  Then el sistema guarda el nuevo umbral en el borrador
  And conserva las conexiones de la condición
```

## Bad path

```gherkin
Scenario: Guardar una configuración inválida
  Given que soy administrador de un workflow en borrador con una condición
  When cambio su etiqueta por una que el modelo de origen no produce
  Then el sistema rechaza el cambio
  And el nodo conserva su configuración anterior
```

```gherkin
Scenario: Miembro sin permisos de administración
  Given que pertenezco al workspace sin permisos de administración
  When abro los detalles de un nodo
  Then veo su configuración en modo lectura
  And no puedo modificarla
```

## Criterios de aceptación

- Solo los administradores pueden modificar la configuración de un nodo del borrador.
- Editar un nodo conserva su identificador, su posición y sus conexiones.
- El sistema valida la configuración con las mismas reglas que al agregar el nodo.
- Editar un nodo no altera las versiones publicadas.
- Cerrar el panel con cambios sin guardar pide confirmación: `¿Descartar los cambios del nodo?`
