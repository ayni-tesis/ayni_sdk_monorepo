# US-086 — Exportar un dataset de detección en COCO

**Épica:** Gestión y exportación de datasets

## Historia de usuario

Como administrador, quiero exportar un dataset de detección en formato COCO para entrenar modelos compatibles.

## Interfaz

`Nueva exportación` ofrece `Detección (COCO)`. El resumen indica `Imágenes`, `Anotaciones` y `Categorías`; botón `Generar exportación COCO`. Éxito: `Exportación COCO lista.`; error: `Corrige las anotaciones indicadas antes de exportar.`

## Happy path

```gherkin
Scenario: Exportar detección validada a COCO
  Given que un dataset de detección es válido
  When solicito una exportación COCO
  Then el sistema genera las imágenes aprobadas y el archivo JSON COCO con sus anotaciones revisadas
```

## Bad path

```gherkin
Scenario: Exportar una anotación no compatible con COCO
  Given que el dataset tiene una anotación inválida
  When solicito una exportación COCO
  Then el sistema rechaza la exportación
  And identifica el ítem que debe corregirse
```

## Criterios de aceptación

- La exportación usa categorías, imágenes y anotaciones compatibles con COCO.
- Solo incluye ítems aprobados y anotaciones validadas.
- Una exportación inválida no deja un archivo parcial disponible.
