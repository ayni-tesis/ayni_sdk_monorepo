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

- Las cajas se exportan en el formato Ultralytics: cada línea tiene `class_id x_center y_center width height`, con coordenadas `xywh` normalizadas entre 0 y 1 y clases numeradas desde 0.
- Solo incluye ítems aprobados y anotaciones validadas.
- `data.yaml` define las rutas relativas a su propio directorio `images/train` y `images/val` y las clases como `names` con nombres YAML escapados.
- Los ítems aprobados se ordenan por ID y se distribuyen determinísticamente en proporción 80/20, sin solapamiento; cada imagen aparece una vez. Se requiere al menos una imagen por partición.
- La definición de clases corresponde a las etiquetas revisadas de las anotaciones exportadas, ordenadas alfabéticamente según el locale español.
- Cada imagen tiene su archivo `labels/<partición>/<itemId>.txt`; una imagen sin cajas tiene un archivo vacío.
- Una anotación inválida rechaza la exportación antes de subir el ZIP.
- Se requiere al menos una clase revisada; Ultralytics no admite datasets de detección con cero clases.
- `GET /applications/:applicationId/datasets/:datasetId/validation?format=detection_yolo` aplica también los requisitos de al menos dos imágenes aprobadas y una clase revisada. Si se omite `format`, conserva la validación general existente.
- Cuando no se cumplen esos requisitos, la validación del formato y la creación de la exportación informan la misma causa; el dashboard explica cómo corregir el conteo de imágenes o agregar una clase revisada.

El ZIP incluye las imágenes en `images/train|val`, las etiquetas en `labels/train|val` y `data.yaml` en la raíz. Para admitir ambas particiones sin duplicar datos, un dataset con menos de dos imágenes aprobadas no se puede exportar en YOLO.
