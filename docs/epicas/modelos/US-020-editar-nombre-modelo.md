# US-020 — Editar el nombre de un modelo

**Épica:** Modelos

## Historia de usuario

Como administrador de un workspace, quiero cambiar el nombre de un modelo para
mantenerlo identificable sin alterar sus versiones publicadas.

## Interfaz

### Ubicación

Dashboard → Modelo → menú `Acciones` → `Editar nombre`.

### Elementos y texto visible

- Diálogo: `Editar nombre del modelo`.
- Campo: `Nombre del modelo`, con el valor actual.
- Acciones: `Guardar cambios` y `Cancelar`.

### Estados y mensajes

- Éxito: `Nombre del modelo actualizado.`
- Error: `Ingresa un nombre para el modelo.`
- Sin permisos: `No tienes permiso para editar este modelo.`

## Happy path

```gherkin
Scenario: Cambiar el nombre de un modelo
  Given que soy administrador del workspace de un modelo
  When guardo un nombre válido
  Then el sistema actualiza el nombre del modelo
  And conserva sus versiones y artefactos
```

## Bad path

```gherkin
Scenario: Guardar un nombre vacío
  Given que soy administrador del workspace de un modelo
  When intento guardar un nombre vacío
  Then el sistema rechaza el cambio
  And conserva el nombre anterior
```

```gherkin
Scenario: Miembro sin permisos de administración
  Given que pertenezco al workspace sin permisos de administración
  When intento cambiar el nombre de un modelo
  Then el sistema rechaza la operación
  And conserva el nombre anterior
```

## Criterios de aceptación

- Solo los administradores pueden editar el nombre de un modelo.
- El nombre es obligatorio.
- Editar el nombre no cambia el identificador, runtime ni versiones del modelo.
