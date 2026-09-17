# US-116 — Listar miembros del workspace

**Épica:** Gestión de workspaces

## Historia de usuario

Como miembro de un workspace, quiero ver quiénes lo integran y sus roles para
identificar a las personas responsables de sus recursos.

## Interfaz

### Ubicación

Dashboard → Workspace → `Miembros`.

### Elementos y texto visible

- Título: `Miembros`.
- Cada fila muestra nombre, correo y rol.
- Estado vacío: `Este workspace aún no tiene otros miembros.`

### Estados y mensajes

- Mientras carga: `Cargando miembros…`.
- Error: `No pudimos cargar los miembros. Inténtalo de nuevo.`
- Sin permisos: `No tienes acceso a este workspace.`

## Happy path

```gherkin
Scenario: Consultar los miembros del workspace
  Given que pertenezco a un workspace
  When abro la sección de miembros
  Then el sistema muestra los miembros de ese workspace y sus roles
```

## Bad path

```gherkin
Scenario: Consultar miembros de otro workspace
  Given que no pertenezco a un workspace
  When solicito su lista de miembros
  Then el sistema rechaza la solicitud sin revelar sus miembros
```

## Criterios de aceptación

- Cualquier miembro puede consultar la lista de su workspace.
- La lista no expone miembros de otros workspaces.
- Cada miembro muestra el rol efectivo en ese workspace.
