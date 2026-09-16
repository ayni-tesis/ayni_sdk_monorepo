# US-002 — Listar las aplicaciones de un workspace

**Épica:** Gestión de workspaces y aplicaciones

## Historia de usuario

Como miembro de un workspace, quiero ver sus aplicaciones para poder elegir la
aplicación con la que deseo trabajar.

## Interfaz

### Ubicación

Dashboard → Workspace → `Aplicaciones`.

### Elementos y texto visible

- Título: `Aplicaciones`.
- Cada fila muestra `Nombre`, `ID de aplicación` y `Estado`.
- Para administradores se muestra el botón `Nueva aplicación`.

### Estados y mensajes

- Carga: `Cargando aplicaciones…`.
- Vacío: `Aún no hay aplicaciones en este workspace.`; para administradores, botón `Crear aplicación`.
- Error: `No pudimos cargar las aplicaciones. Inténtalo nuevamente.`
- Sin acceso: `No tienes acceso a este workspace.`

## Happy path

```gherkin
Scenario: Workspace con aplicaciones
  Given que pertenezco a un workspace con aplicaciones
  When abro la lista de aplicaciones del workspace
  Then el sistema muestra únicamente las aplicaciones de ese workspace
```

```gherkin
Scenario: Workspace sin aplicaciones
  Given que pertenezco a un workspace sin aplicaciones
  When abro la lista de aplicaciones del workspace
  Then el sistema informa que aún no existen aplicaciones
  And ofrece la acción para crear una aplicación si tengo permisos
```



## Bad path

```gherkin
Scenario: Usuario sin membresía del workspace
  Given que no pertenezco a un workspace
  When intento consultar sus aplicaciones
  Then el sistema rechaza la solicitud por falta de permisos
  And no revela información de sus aplicaciones
```



## Criterios de aceptación

- Solo los miembros del workspace pueden ver su lista de aplicaciones.
- La lista no incluye aplicaciones de otros workspaces.
- Cada aplicación muestra al menos su nombre e identificador.
- Un workspace sin aplicaciones muestra un estado vacío claro.
