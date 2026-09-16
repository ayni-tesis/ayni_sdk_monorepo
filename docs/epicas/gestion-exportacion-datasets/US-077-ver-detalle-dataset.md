# US-077 — Ver el detalle de un dataset

**Épica:** Gestión y exportación de datasets

## Historia de usuario

Como miembro de un workspace, quiero consultar un dataset para conocer sus evidencias, estado de revisión y exportaciones.

## Interfaz

Dashboard → Datasets → selección. Encabezado con nombre, tipo y contador; pestañas `Evidencias` y `Exportaciones`. Estados: `Cargando dataset…`, `No encontramos este dataset.` y `No pudimos cargar el dataset.`

## Happy path

```gherkin
Scenario: Consultar un dataset propio
  Given que pertenezco al workspace de un dataset
  When abro su detalle
  Then el sistema muestra sus evidencias y sus estados de revisión
```

## Bad path

```gherkin
Scenario: Consultar un dataset ajeno
  Given que no pertenezco al workspace de un dataset
  When intento abrirlo
  Then el sistema rechaza la solicitud
  And no revela su contenido
```

## Criterios de aceptación

- El detalle se limita al dataset y aplicación propietaria.
- La vista no expone recursos de otros workspaces.
- El detalle identifica las exportaciones generadas para el dataset.
