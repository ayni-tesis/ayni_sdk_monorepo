# US-087 — Exportar un dataset de detección en YOLO

**Épica:** Gestión y exportación de datasets

## Historia de usuario

Como administrador, quiero exportar un dataset de detección en formato YOLO para entrenar modelos compatibles.

## Interfaz

`Nueva exportación` ofrece `Detección (YOLO)`. El resumen indica `Imágenes`, `Etiquetas` y `Clases`; botón `Generar exportación YOLO`. Éxito: `Exportación YOLO lista.`; error: `Corrige las anotaciones indicadas antes de exportar.`

## Happy path

```gherkin
Scenario: Exportar detección validada a YOLO
  Given que un dataset de detección es válido
  When solicito una exportación YOLO
  Then el sistema genera imágenes, archivos de etiquetas YOLO y la definición de clases
```

## Bad path

```gherkin
Scenario: Exportar una caja inválida
  Given que el dataset contiene una caja no normalizable
  When solicito una exportación YOLO
  Then el sistema rechaza la exportación
  And no publica archivos incompletos
```

## Criterios de aceptación

- Las cajas se exportan con la convención YOLO documentada.
- Solo incluye ítems aprobados y anotaciones validadas.
- La definición de clases corresponde a las etiquetas revisadas exportadas.
