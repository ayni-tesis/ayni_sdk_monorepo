# US-119 — Retirar a un miembro del workspace

**Épica:** Gestión de workspaces

## Historia de usuario

Como administrador de un workspace, quiero retirar a un miembro para revocar
su acceso cuando ya no colabora con el equipo.

## Interfaz

### Ubicación

Dashboard → Workspace → `Miembros` → menú de un miembro → `Retirar miembro`.

### Elementos y texto visible

- Confirmación: `¿Retirar a este miembro del workspace?`.
- Consecuencia: `Perderá el acceso a las aplicaciones y recursos de este workspace.`
- Acción principal: `Retirar miembro`; acción secundaria: `Cancelar`.

### Estados y mensajes

- Mientras se retira: `Retirando miembro…`.
- Éxito: `Miembro retirado.`
- Sin permisos: `No tienes permiso para retirar miembros de este workspace.`

## Happy path

```gherkin
Scenario: Retirar a un miembro
  Given que soy administrador de un workspace con otro administrador
  When confirmo retirar a un miembro
  Then el sistema elimina su membresía
  And esa persona deja de acceder a los recursos del workspace
```

## Bad path

```gherkin
Scenario: Retirar al último administrador
  Given que el workspace tiene un único administrador
  When intento retirarlo
  Then el sistema rechaza la operación
  And conserva al menos un administrador
```

## Criterios de aceptación

- Solo administradores pueden retirar miembros.
- La operación requiere confirmación explícita.
- Un workspace conserva al menos un administrador.
- Retirar a un miembro revoca su acceso sin modificar sus otros workspaces.
