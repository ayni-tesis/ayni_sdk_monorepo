# US-003 — Ver el detalle de una aplicación

**Épica:** Gestión de workspaces y aplicaciones

## Historia de usuario

Como miembro de un workspace, quiero consultar el detalle de una aplicación
para conocer su estado e identificar los recursos que administraré.

## Interfaz

### Ubicación

Dashboard → Workspace → `Aplicaciones` → selección de una aplicación.

### Elementos y texto visible

- Ruta: `Aplicaciones / <nombre de la aplicación>`.
- Encabezado con `Nombre de la aplicación`, `ID de aplicación` y estado `Activa` o `Archivada`.
- Secciones: `Workflows`, `Modelos`, `Credenciales SDK`, `Datasets` y `Telemetría`.

### Estados y mensajes

- Carga: `Cargando aplicación…`.
- No encontrada o sin acceso: `No encontramos esta aplicación.`; no se revela si pertenece a otro workspace.
- Error: `No pudimos cargar la aplicación. Inténtalo nuevamente.`

## Happy path

```gherkin
Scenario: Consultar una aplicación del workspace actual
  Given que pertenezco al workspace de una aplicación
  When abro el detalle de la aplicación
  Then el sistema muestra su nombre, identificador y estado
```

## Bad path

```gherkin
Scenario: Consultar una aplicación de otro workspace
  Given que no pertenezco al workspace de una aplicación
  When intento abrir su detalle
  Then el sistema rechaza la solicitud por falta de permisos
  And no revela los datos de la aplicación
```

```gherkin
Scenario: Consultar una aplicación inexistente
  Given que pertenezco a un workspace
  When intento abrir una aplicación que no existe
  Then el sistema informa que la aplicación no fue encontrada
```

## Criterios de aceptación

- Solo los miembros del workspace pueden consultar una aplicación.
- El detalle muestra el nombre, identificador y estado de la aplicación.
- El detalle no muestra secretos ni credenciales del SDK.
- Una aplicación inexistente devuelve un resultado no encontrado.
- Una aplicación ajena no revela información.
