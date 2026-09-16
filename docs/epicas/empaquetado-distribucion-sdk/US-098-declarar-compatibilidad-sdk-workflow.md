# US-098 — Declarar compatibilidad entre SDK y workflow

**Épica:** Empaquetado y distribución del SDK

## Historia de usuario

Como desarrollador, quiero que el SDK compruebe si soporta la versión de esquema de un workflow antes de ejecutarlo.

## Interfaz

`sdk.sync()` devuelve `unsupportedWorkflowVersion`; la app muestra `Este workflow requiere una versión más reciente del SDK. Se conservará la última versión compatible.`

## Happy path

```gherkin
Scenario: Workflow compatible
  Given que el workflow declara una versión de esquema soportada por el SDK
  When el SDK lo sincroniza o ejecuta
  Then acepta el workflow como compatible
```

## Bad path

```gherkin
Scenario: Workflow de esquema más nuevo
  Given que el workflow declara una versión de esquema no soportada
  When el SDK intenta validarlo
  Then devuelve unsupportedWorkflowVersion
  And conserva la última versión compatible disponible
```

## Criterios de aceptación

- Cada workflow declara su versión de esquema.
- El SDK declara las versiones de esquema que soporta.
- Un workflow incompatible no se instala ni ejecuta.
