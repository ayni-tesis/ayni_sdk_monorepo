# US-004 — Editar el nombre de una aplicación

**Épica:** Gestión de workspaces y aplicaciones

## Historia de usuario

Como administrador de un workspace, quiero cambiar el nombre de una aplicación
para mantenerla identificable para los miembros del workspace.

## Interfaz

### Ubicación

Dashboard → Aplicación → menú `Acciones` → `Editar nombre`.

### Elementos y texto visible

- Diálogo: `Editar nombre de la aplicación`.
- Campo obligatorio: `Nombre de la aplicación`, precargado con el nombre actual.
- Acciones: `Guardar cambios` y `Cancelar`.

### Estados y mensajes

- Mientras se guarda: `Guardando cambios…`.
- Éxito: `Nombre actualizado.`
- Error de nombre: `Ingresa un nombre para la aplicación.`
- Sin permisos: `No tienes permiso para editar esta aplicación.`

## Happy path

```gherkin
Scenario: Cambiar el nombre de una aplicación
  Given que soy administrador del workspace de una aplicación
  When guardo un nombre válido para la aplicación
  Then el sistema actualiza su nombre
  And muestra el nuevo nombre en la lista y el detalle de la aplicación
```

## Bad path

```gherkin
Scenario: Guardar un nombre vacío
  Given que soy administrador del workspace de una aplicación
  When intento guardar un nombre vacío
  Then el sistema informa que el nombre es obligatorio
  And conserva el nombre anterior
```

```gherkin
Scenario: Miembro sin permisos de administración
  Given que pertenezco al workspace sin permisos de administración
  When intento cambiar el nombre de una aplicación
  Then el sistema rechaza la operación por falta de permisos
  And conserva el nombre anterior
```

## Criterios de aceptación

- Solo los administradores del workspace pueden cambiar el nombre.
- El nuevo nombre es obligatorio.
- El cambio se refleja al consultar la aplicación y al listarla.
- Cambiar el nombre no modifica el identificador, workflows, modelos ni credenciales.
- Un intento no autorizado no cambia la aplicación.
