# US-159 — Publicar un workflow con salida de segmentación

**Épica:** Workflows DAG

## Historia de usuario

Como administrador, quiero agregar un modelo de segmentación a un workflow y conectar su resultado a una salida para publicar una versión que las apps con un SDK compatible puedan ejecutar.

## Interfaz

### Ubicación

Dashboard → aplicación → `Workflows` → lienzo del borrador.

### Elementos y texto visible

- **Nodo de modelo:** un modelo con contrato de segmentación aparece en el catálogo con la descripción del modelo y su panel de detalles muestra `Segmentación: <etiquetas> · logits` o `· probabilidades`.
- **Salida:** una salida conectada a un resultado de segmentación muestra el tipo de resultado `Segmentación`.
- **Captura:** el nodo de captura de dataset no ofrece el resultado de segmentación como origen.
- **Acción principal:** `Publicar versión`. Si el borrador tiene un modelo de segmentación, el diálogo avisa: `Esta versión usa segmentación y requiere ayni_sdk 0.4.0 o posterior. Las apps con una versión anterior del SDK conservan la versión del workflow que ya tienen.`

### Estados y mensajes

- Puerto incompatible: `Estos puertos no son compatibles.`
- Salida incompatible: `El resultado seleccionado no es compatible con la salida.`
- Éxito al publicar: la versión aparece en `Versiones publicadas`.

## Happy path

```gherkin
Scenario: Publicar un workflow de segmentación
  Given un modelo con contrato de segmentación
  When el administrador agrega la entrada de imagen, el modelo y una salida de tipo "Segmentación"
  And publica la versión 1.0.0
  Then la versión publicada tiene schemaVersion "4"
  And un SDK 0.3.x la informa como unsupportedWorkflowVersion y conserva la versión anterior
```

## Bad path

```gherkin
Scenario: Capturar evidencia de una segmentación
  Given un modelo de segmentación en el borrador
  When el administrador intenta conectar su resultado a un nodo de captura de dataset
  Then el servidor rechaza la conexión con "Estos puertos no son compatibles."
```

## Criterios de aceptación

- `output.resultType` acepta `"segmentation"`, también como origen dentro de `sources` de una salida combinada.
- **`schemaVersion`:** un workflow con al menos un modelo de segmentación se publica con el esquema `"4"`. Los workflows sin segmentación conservan el esquema `"1"`, `"2"` o `"3"` (prueba de regresión).
- **Captura:** la captura de dataset no acepta resultados de segmentación.
- **Condición:** hasta US-161, una condición no acepta un origen de segmentación.
- **Aviso al publicar:** el diálogo `Publicar versión` muestra el aviso sobre `ayni_sdk 0.4.0` cuando el borrador tiene un modelo de segmentación y no lo muestra en caso contrario.
