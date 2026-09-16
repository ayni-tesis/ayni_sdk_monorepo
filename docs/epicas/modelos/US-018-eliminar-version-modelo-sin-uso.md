# US-018 — Eliminar una versión de modelo sin uso

**Épica:** Modelos

## Historia de usuario

Como administrador de un workspace, quiero eliminar una versión de modelo que
no usan workflows para retirar artefactos que ya no necesito.

## Interfaz

### Ubicación

Dashboard → Modelo → `Versiones` → fila sin referencias → `Eliminar`.

### Elementos y texto visible

- Diálogo: `¿Eliminar la versión <versión>?`.
- Aviso: `Se eliminará el archivo del modelo. Esta acción no se puede deshacer.`
- Acciones: `Eliminar versión` y `Cancelar`.

### Estados y mensajes

- Éxito: `Versión eliminada.`
- En uso: `No puedes eliminar esta versión porque un workflow publicado la usa.`
- Sin permisos: `No tienes permiso para eliminar versiones de modelo.`

## Happy path

```gherkin
Scenario: Eliminar una versión sin referencias
  Given que soy administrador del workspace de un modelo
  And una versión del modelo no es referenciada por ningún workflow publicado
  When confirmo que deseo eliminarla
  Then el sistema elimina la versión y su artefacto almacenado
  And deja de mostrarla al listar las versiones del modelo
```

## Bad path

```gherkin
Scenario: Eliminar una versión usada por un workflow
  Given que soy administrador del workspace de un modelo
  And una versión del modelo es referenciada por un workflow publicado
  When intento eliminarla
  Then el sistema rechaza la operación indicando que la versión está en uso
  And conserva la versión y su artefacto
```

```gherkin
Scenario: Miembro sin permisos de administración
  Given que pertenezco al workspace sin permisos de administración
  When intento eliminar una versión de modelo
  Then el sistema rechaza la operación por falta de permisos
  And conserva la versión y su artefacto
```

## Criterios de aceptación

- Solo los administradores del workspace pueden eliminar versiones de modelo.
- El sistema impide eliminar una versión referenciada por cualquier workflow publicado.
- Al eliminar una versión sin uso, se elimina su artefacto y deja de aparecer en la lista.
- La operación se limita al modelo y aplicación propietaria.
- Una operación rechazada no elimina ni modifica el artefacto existente.
