# US-027 — Editar el nombre de un workflow

**Épica:** Workflows DAG

## Historia de usuario

Como administrador de un workspace, quiero cambiar el nombre de un workflow
para mantenerlo identificable sin alterar sus versiones publicadas.

## Interfaz

Dashboard → Workflow → `Acciones` → `Editar nombre`. El diálogo se titula `Editar nombre del workflow`, contiene `Nombre del workflow` precargado y los botones `Guardar cambios` y `Cancelar`. Muestra `Guardando cambios…`, `Nombre del workflow actualizado.` o `Ingresa un nombre para el workflow.`

## Happy path

```gherkin
Scenario: Editar un nombre válido
  Given que soy administrador de un workflow
  When guardo un nombre válido
  Then el sistema actualiza el nombre del workflow
  And conserva su borrador y versiones publicadas
```

## Bad path

```gherkin
Scenario: Guardar un nombre vacío
  Given que soy administrador de un workflow
  When intento guardar un nombre vacío
  Then el sistema rechaza el cambio
  And conserva el nombre anterior
```

## Criterios de aceptación

- Solo los administradores pueden editar el nombre.
- El nombre es obligatorio.
- Editar el nombre no modifica el identificador ni ninguna versión publicada.
