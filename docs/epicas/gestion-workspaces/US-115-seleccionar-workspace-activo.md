# US-115 — Seleccionar el workspace activo

**Épica:** Gestión de workspaces

## Historia de usuario

Como miembro de varios workspaces, quiero seleccionar el workspace activo para
consultar y administrar únicamente sus recursos.

## Interfaz

### Ubicación

Dashboard → selector de workspace en el encabezado.

### Elementos y texto visible

- Selector: `Workspace actual`.
- Cada opción muestra el nombre del workspace y mi rol.

### Estados y mensajes

- Sin workspaces: `Aún no perteneces a ningún workspace.` y acción `Crear workspace`.
- Mientras cambia: `Cambiando workspace…`.
- Error: `No pudimos cambiar el workspace. Inténtalo de nuevo.`

## Happy path

```gherkin
Scenario: Cambiar el workspace activo
  Given que pertenezco a dos workspaces
  When selecciono uno de ellos en el dashboard
  Then el dashboard muestra sus aplicaciones y recursos
  And conserva el workspace seleccionado para mi sesión
```

## Bad path

```gherkin
Scenario: Seleccionar un workspace ajeno
  Given que no pertenezco a un workspace
  When intento activarlo mediante su identificador
  Then el sistema rechaza la solicitud
  And no muestra sus recursos
```

## Criterios de aceptación

- El selector lista solo workspaces donde la persona es miembro.
- El cambio actualiza el contexto de todas las rutas protegidas.
- No se puede activar un workspace sin una membresía válida.
- El dashboard no conserva datos visibles del workspace anterior tras cambiar.
