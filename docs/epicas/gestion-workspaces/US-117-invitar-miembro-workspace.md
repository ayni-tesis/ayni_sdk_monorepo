# US-117 — Invitar a un miembro al workspace

**Épica:** Gestión de workspaces

## Historia de usuario

Como administrador de un workspace, quiero invitar a una persona para que
colabore en sus aplicaciones y recursos.

## Interfaz

### Ubicación

Dashboard → Workspace → `Miembros` → `Invitar miembro`.

### Elementos y texto visible

- Título: `Invitar miembro`.
- Campo obligatorio: `Correo electrónico`.
- Selector: `Rol`, con `Administrador` y `Miembro`.
- Acción principal: `Enviar invitación`; acción secundaria: `Cancelar`.

### Estados y mensajes

- Mientras se envía: `Enviando invitación…`.
- Éxito: `Invitación enviada.`
- Error: `Ingresa un correo electrónico válido.`
- Sin permisos: `No tienes permiso para invitar miembros a este workspace.`

## Happy path

```gherkin
Scenario: Invitar a una persona
  Given que soy administrador de un workspace
  When envío una invitación con un correo y rol válidos
  Then el sistema registra la invitación para ese workspace
  And informa que fue enviada
```

## Bad path

```gherkin
Scenario: Miembro sin permiso para invitar
  Given que soy miembro sin permiso de administración
  When intento enviar una invitación
  Then el sistema rechaza la operación
  And no crea la invitación
```

## Criterios de aceptación

- Solo administradores pueden enviar invitaciones.
- La invitación queda vinculada a un único workspace y rol.
- No se duplican invitaciones pendientes para el mismo correo y workspace.
- Aceptar una invitación no da acceso a otros workspaces.
