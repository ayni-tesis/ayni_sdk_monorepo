# US-114 — Crear un workspace

**Épica:** Gestión de workspaces

## Historia de usuario

Como usuario autenticado, quiero crear un workspace para organizar las
aplicaciones y colaboradores de un equipo independiente.

## Interfaz

### Ubicación

Dashboard → selector de workspace → `Crear workspace`.

### Elementos y texto visible

- Título: `Crear workspace`.
- Campo obligatorio: `Nombre del workspace`.
- Acción principal: `Crear workspace`; acción secundaria: `Cancelar`.

### Estados y mensajes

- Mientras se guarda: `Creando workspace…`.
- Éxito: `Workspace creado.` y selección del nuevo workspace.
- Error: `Ingresa un nombre para el workspace.`

## Happy path

```gherkin
Scenario: Crear un workspace
  Given que inicié sesión
  When registro un workspace con un nombre válido
  Then el sistema me agrega como administrador del workspace
  And lo deja seleccionado en el dashboard
```

## Bad path

```gherkin
Scenario: Crear un workspace sin nombre
  Given que inicié sesión
  When intento crear un workspace sin nombre
  Then el sistema informa que el nombre es obligatorio
  And no crea el workspace
```

## Criterios de aceptación

- La organización de Better Auth es el workspace; no se crea una entidad duplicada.
- La persona que lo crea queda como administradora.
- El nombre es obligatorio.
- El workspace nuevo no comparte aplicaciones ni miembros con otros workspaces.
