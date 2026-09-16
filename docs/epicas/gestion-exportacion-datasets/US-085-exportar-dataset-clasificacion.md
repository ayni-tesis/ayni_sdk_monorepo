# US-085 — Exportar un dataset de clasificación

**Épica:** Gestión y exportación de datasets

## Historia de usuario

Como administrador, quiero exportar un dataset de clasificación como imágenes y CSV de etiquetas para entrenar un modelo.

## Interfaz

`Exportaciones` → `Nueva exportación` → `Clasificación (imágenes + CSV)`. El diálogo resume ítems aprobados y botón `Generar exportación`. Estados: `Generando exportación…`, `Exportación de clasificación lista.` y `El dataset no tiene evidencias aprobadas para exportar.`

## Happy path

```gherkin
Scenario: Exportar clasificación validada
  Given que un dataset de clasificación es válido
  When solicito una exportación de clasificación
  Then el sistema genera las imágenes aprobadas y un CSV con sus etiquetas revisadas
```

## Bad path

```gherkin
Scenario: Exportar sin ítems aprobados
  Given que un dataset no tiene evidencias aprobadas
  When solicito una exportación de clasificación
  Then el sistema rechaza la exportación
  And no genera un archivo vacío
```

## Criterios de aceptación

- La exportación incluye solo ítems aprobados y etiquetados.
- El CSV relaciona cada imagen con su etiqueta revisada.
- La exportación identifica versión de dataset y fecha de generación.
