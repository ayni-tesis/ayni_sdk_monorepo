# US-118 — Cambiar el rol de un miembro

**Épica:** Gestión de workspaces

## Historia de usuario

Como administrador de un workspace, quiero cambiar el rol de un miembro para
controlar quién puede administrar sus recursos.

## Interfaz

### Ubicación

Dashboard → Workspace → `Miembros` → menú de un miembro → `Cambiar rol`.

### Elementos y texto visible

- Título: `Cambiar rol`.
- Selector: `Rol`, con `Administrador` y `Miembro`.
- Acción principal: `Actualizar rol`; acción secundaria: `Cancelar`.

### Estados y mensajes

- Mientras se guarda: `Actualizando rol…`.
- Éxito: `Rol actualizado.`
- Sin permisos: `No tienes permiso para cambiar roles en este workspace.`

## Happy path

```gherkin
Scenario: Promover a un miembro
  Given que soy administrador de un workspace
  When cambio el rol de un miembro a administrador
  Then el sistema actualiza su rol en ese workspace
  And el miembro puede administrar sus recursos
```

## Bad path

```gherkin
Scenario: Quitar el último administrador
  Given que el workspace tiene un único administrador
  When intento cambiar su rol a miembro
  Then el sistema rechaza la operación
  And conserva al menos un administrador
```

## Criterios de aceptación

- Solo administradores pueden cambiar roles.
- El cambio solo afecta el workspace activo.
- Un workspace conserva al menos un administrador.
- El nuevo rol se aplica a las siguientes acciones protegidas.
