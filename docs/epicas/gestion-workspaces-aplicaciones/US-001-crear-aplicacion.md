# US-001 — Crear una aplicación

**Épica:** Gestión de workspaces y aplicaciones

## Historia de usuario

Como administrador de un workspace, quiero crear una aplicación para separar
sus workflows, modelos y credenciales de las demás aplicaciones del workspace.

## Interfaz

### Ubicación

Dashboard → Workspace → `Aplicaciones` → `Nueva aplicación`.

### Elementos y texto visible

- Título del formulario: `Crear aplicación`.
- Campo obligatorio: `Nombre de la aplicación`; ayuda: `Usa un nombre que tu equipo pueda reconocer.`
- Acción principal: `Crear aplicación`; acción secundaria: `Cancelar`.

### Estados y mensajes

- Mientras se guarda: `Creando aplicación…`.
- Éxito: `Aplicación creada.` y redirección al detalle de la nueva aplicación.
- Error de nombre: `Ingresa un nombre para la aplicación.`
- Sin permisos: `No tienes permiso para crear aplicaciones en este workspace.`

## Happy path

```gherkin
Scenario: Crear una aplicación con datos válidos
  Given que soy administrador de un workspace
  When registro una aplicación con un nombre válido
  Then el sistema crea la aplicación dentro de mi workspace
  And la muestra en la lista de aplicaciones del workspace
```

## Bad path

```gherkin
Scenario: Crear una aplicación sin nombre
  Given que soy administrador de un workspace
  When intento registrar una aplicación sin nombre
  Then el sistema informa que el nombre es obligatorio
  And no crea la aplicación
```

```gherkin
Scenario: Usuario sin permisos de administración
  Given que pertenezco al workspace sin permiso de administración
  When intento registrar una aplicación
  Then el sistema rechaza la operación por falta de permisos
  And no crea la aplicación
```

## Criterios de aceptación

- Solo un administrador del workspace puede crear una aplicación.
- Una aplicación pertenece a un único workspace.
- El nombre de la aplicación es obligatorio.
- Al crearla, la aplicación aparece en el workspace que la creó.
- Crear una aplicación no expone ni comparte recursos de otras aplicaciones.
