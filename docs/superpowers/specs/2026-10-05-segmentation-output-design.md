# Diseño: salida de segmentación semántica (`ayni_sdk` 0.4.0)

**Estado:** aprobado por el usuario el 5 de octubre de 2026
**Fecha:** 5 de octubre de 2026

## Objetivo

Agregar el tipo de salida `segmentation` de punta a punta: contrato del modelo en el servidor y el dashboard, workflows publicables, ejecución en el SDK y un perfil en la app de validación. Hoy el SDK solo acepta `classification` y `detection` (`workflow_definition_validator.dart:118`), y el servidor rechaza cualquier otro contrato (`apps/server/src/model-versions.ts`).

Decisiones del usuario (5/10/2026):
- La condición sobre el porcentaje de área entra en 0.4.0.
- La máscara tiene un tope de 1.048.576 píxeles (`H × W`).
- Issues y PR en GitHub, sí. Publicar en pub.dev requiere confirmación aparte.

## Contrato de salida

```json
{ "type": "segmentation", "labels": ["background", "..."], "scoreType": "logits" }
```

- **`labels`:** 1 a 256 etiquetas, en el orden de los canales del tensor.
- **`scoreType`:** `"logits"` o `"probabilities"`. Es obligatorio porque la confianza depende de él:
  - con `logits`, la confianza es el máximo de la softmax del píxel;
  - con `probabilities`, es el valor máximo, que debe estar en [0, 1].
- **Tensor aceptado:** una sola salida float32 `[1, H, W, C]`, con `C = labels.length`, `H ≥ 1`, `W ≥ 1` y `H × W ≤ 1.048.576`.
  - El servidor lo comprueba al guardar el contrato (`tflite-contract-validator.ts`).
  - El SDK lo comprueba otra vez al ejecutar.
- **Fuera de alcance:** salidas `[1, H, W]` con índices, tensores que no sean float32, `tensorLayout` y `backgroundLabel`.

## Resultado en el SDK

```dart
class SegmentationResult extends WorkflowValue {
  final int width;                        // W del tensor
  final int height;                       // H del tensor
  final List<String> labels;              // índice → etiqueta
  final Uint8List mask;                   // fila por fila, width × height, índice en labels; no modificable
  final Map<String, double> areaFractions; // todas las etiquetas, suman 1
  final double confidence;                // media de la confianza del ganador por píxel
  String labelAt(int x, int y);
}
```

- **Empates:** gana el índice más bajo, igual que en la clasificación.
- **Cobertura de la máscara:** cubre la imagen completa después del redimensionado del SDK, que no conserva la proporción.
- **Rendimiento:** la decodificación corre fuera del isolate principal (`Isolate.run`).
- **Salida inválida** (`modelOutputInvalid`): forma o cantidad de canales distinta del contrato, valores no finitos, probabilidades fuera de [0, 1], más de un tensor o más píxeles que el tope.

`WorkflowValue` es `sealed`, así que agregar `SegmentationResult` rompe los `switch` exhaustivos de las apps. Por eso la versión es **0.4.0**, con `### Cambios incompatibles` y `### Cómo migrar` en el CHANGELOG.

## Workflows

- `output.resultType` admite `"segmentation"`, también dentro de `sources` de una salida combinada.
- **Condición por área.** Un nodo `condition` cuyo origen es un modelo de segmentación compara `areaFractions[label]` con `threshold`, con los mismos `operator` y rango [0, 1]. No agrega campos nuevos.
- **Captura (`dataset.capture`):** no acepta resultados de segmentación. La base de datos limita `sdk_evidence.task_type` a clasificación y detección.
- **`schemaVersion`:** un workflow con un modelo de segmentación se publica con el esquema **"4"**, que incluye todo lo del esquema 3. Regla: `hasSegmentation ? "4" : hasCapture ? "3" : hasCombined ? "2" : "1"`. Así, un SDK 0.3.x lo rechaza con `unsupportedSchemaVersion`, que informa `unsupportedWorkflowVersion` y conserva la versión anterior, en lugar de tratarlo como un workflow inválido.

## Privacidad

La máscara es un dato derivado de la imagen y nunca sale del dispositivo. La traza de una salida de segmentación solo lleva `width`, `height`, `confidence` y `areaFractions`. La captura de evidencia no la acepta.

## Historias y PR

| Historia | Contenido |
|---|---|
| US-158 — Registrar el contrato de un modelo de segmentación | db, api, server y web; guía del dashboard |
| US-159 — Publicar un workflow con salida de segmentación | grafo, esquema 4 y lienzo |
| US-160 — Ejecutar un nodo de segmentación en el SDK | SDK 0.4.0, traza y documentación |
| US-161 — Evaluar una condición sobre el porcentaje de área | SDK, API, server, web y app de validación |
| US-162 — Validar la segmentación en la app de validación | perfil SEG-01 y comparación entre SDK y control |

Después de US-161 va la publicación de 0.4.0. Requiere confirmación del usuario.

## Validación en la app

**Perfil SEG-01:** modelo DeepLabV3 genérico de MediaPipe (float32), con entrada `[1,257,257,3]` normalizada a `minus_one_to_one`, 21 etiquetas VOC y `scoreType: "logits"`.

**Métrica en el dispositivo:** acuerdo entre el SDK y la integración directa con los mismos bytes:
- acuerdo por píxel;
- mIoU entre las dos máscaras;
- máx |Δ areaFraction| y |Δ confidence|.

El JSONL guarda el SHA-256 de la máscara, sus dimensiones, las fracciones de área, la confianza y la máscara en RLE. El JSONL no se sube a ningún servidor.

La exactitud frente a máscaras de referencia (mIoU frente a PASCAL VOC) es opcional, se calcula fuera del teléfono y depende de la licencia de las imágenes.
