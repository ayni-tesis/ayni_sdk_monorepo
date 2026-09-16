# US-083 — Filtrar evidencias de un dataset

**Épica:** Gestión y exportación de datasets

## Historia de usuario

Como miembro de un workspace, quiero filtrar las evidencias de un dataset para encontrar rápidamente las que debo revisar o exportar.

## Interfaz

La barra `Filtrar evidencias` incluye `Estado`, `Workflow`, `Modelo`, `Fecha` y `Confianza`; acciones `Aplicar filtros` y `Limpiar filtros`. Sin coincidencias: `No hay evidencias que coincidan con los filtros.` Un filtro inválido muestra `No se pudo aplicar uno de los filtros.`

## Happy path

```gherkin
Scenario: Filtrar por estado de revisión y confianza
  Given que un dataset contiene evidencias con distintos estados y confianzas
  When aplico filtros válidos
  Then el sistema muestra solo las evidencias que cumplen todos los filtros
```

## Bad path

```gherkin
Scenario: Usar un filtro no admitido
  Given que estoy consultando un dataset
  When envío un filtro no reconocido
  Then el sistema rechaza el filtro
  And no expone datos adicionales
```

## Criterios de aceptación

- Se puede filtrar por estado, workflow, modelo, fecha y confianza.
- Los filtros se aplican solo al dataset solicitado.
- Un filtro inválido no modifica el dataset.
