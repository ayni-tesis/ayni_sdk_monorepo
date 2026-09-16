# US-036 — Publicar una versión de workflow

**Épica:** Workflows DAG

## Historia de usuario

Como administrador de un workspace, quiero publicar un borrador válido para
que el SDK pueda sincronizar una versión inmutable del workflow.

## Interfaz

En el editor, `Publicar versión` abre un diálogo con `Versión` y el resumen `Se publicará una versión inmutable del workflow.`. Acciones: `Publicar versión` y `Cancelar`. Muestra `Publicando versión…`, `Versión <versión> publicada.` o `Corrige los errores de validación antes de publicar.`

## Happy path

```gherkin
Scenario: Publicar un borrador válido
  Given que soy administrador de un workflow con un borrador publicable
  When confirmo su publicación con un identificador de versión nuevo
  Then el sistema crea una versión inmutable del workflow
  And la deja disponible para sincronización del SDK
```

## Bad path

```gherkin
Scenario: Publicar un borrador inválido
  Given que un workflow tiene un borrador no publicable
  When intento publicarlo
  Then el sistema rechaza la publicación
  And no crea una versión nueva
```

```gherkin
Scenario: Reutilizar un identificador de versión
  Given que el workflow ya tiene una versión con un identificador
  When intento publicar otra con el mismo identificador
  Then el sistema rechaza la publicación
  And conserva las versiones existentes
```

## Criterios de aceptación

- Solo los administradores pueden publicar versiones.
- Una versión publicada es inmutable y almacena el DAG validado.
- Solo los borradores válidos pueden publicarse.
- El identificador de versión es único dentro del workflow.
