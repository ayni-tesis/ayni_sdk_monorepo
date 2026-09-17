# US-117 — Invitar a un miembro al workspace

**Épica:** Gestión de workspaces

## Historia de usuario

Como administrador de un workspace, quiero generar una URL de invitación para
compartirla con una persona que colaborará en sus aplicaciones y recursos.

## Interfaz

### Ubicación

Dashboard → Workspace → `Miembros` → `Crear enlace de invitación`.

### Elementos y texto visible

- Título: `Crear enlace de invitación`.
- Selector: `Rol`, con `Administrador` y `Miembro`.
- Acción principal: `Crear enlace`; acción secundaria: `Cancelar`.
- Tras crearlo se muestra la URL y la acción `Copiar enlace`.

### Estados y mensajes

- Mientras se crea: `Creando enlace…`.
- Éxito: `Enlace de invitación creado.`
- Error: `No pudimos crear el enlace. Inténtalo de nuevo.`
- Sin permisos: `No tienes permiso para crear invitaciones en este workspace.`

## Happy path

```gherkin
Scenario: Crear un enlace de invitación
  Given que soy administrador de un workspace
  When creo un enlace con un rol válido
  Then el sistema registra una invitación para ese workspace
  And muestra una URL que puedo copiar y compartir
```

## Bad path

```gherkin
Scenario: Miembro sin permiso para crear un enlace
  Given que soy miembro sin permiso de administración
  When intento crear un enlace de invitación
  Then el sistema rechaza la operación
  And no crea la invitación
```

## Criterios de aceptación

- Solo administradores pueden crear enlaces de invitación.
- El enlace queda vinculado a un único workspace y rol.
- El enlace se puede copiar sin enviar correo desde el sistema.
- Aceptar un enlace no da acceso a otros workspaces.
