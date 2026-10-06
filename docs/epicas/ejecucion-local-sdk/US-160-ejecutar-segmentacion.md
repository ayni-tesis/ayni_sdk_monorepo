# US-160 — Ejecutar un nodo de segmentación en el SDK

**Épica:** Ejecución local del SDK

## Historia de usuario

Como usuario de una app móvil, quiero que el SDK ejecute un modelo de segmentación para obtener, sin conexión, la clase de cada píxel y el porcentaje de la imagen que ocupa cada clase.

## Interfaz

- **Resultado:** `run()` devuelve, en la salida conectada al modelo, un `SegmentationResult` con:
  - `width` y `height` del tensor;
  - `labels`;
  - `mask` (`Uint8List` no modificable, fila por fila, con el índice de la etiqueta de cada píxel);
  - `areaFractions`, con todas las etiquetas, en [0, 1], que suman 1 salvo redondeo;
  - `confidence`, la media de la confianza del ganador por píxel;
  - `labelAt(x, y)`.
- **App anfitriona:** puede pintar la máscara y mostrar una lista `Áreas por clase`.
- **Errores:** una salida inválida produce `WorkflowError` con la categoría `modelOutputInvalid` y el `nodeId` del modelo.
- **Esquemas:** el SDK acepta los workflows con `schemaVersion` `"1"`, `"2"`, `"3"` y `"4"`.

## Happy path

```gherkin
Scenario: Segmentar una imagen sin red
  Given un workflow con esquema "4", un modelo de segmentación instalado con 21 etiquetas y salida [1, 257, 257, 21]
  When la app llama a run() con una imagen
  Then el resultado es un SegmentationResult de 257 × 257 píxeles
  And areaFractions incluye las 21 etiquetas y suma 1 salvo redondeo
  And la ejecución no hace llamadas de red
```

## Bad path

```gherkin
Scenario: Salida del modelo distinta del contrato
  Given un modelo cuyo tensor de salida tiene 20 canales y un contrato con 21 etiquetas
  When el SDK ejecuta el nodo
  Then run() falla con modelOutputInvalid y el nodeId del modelo
```

## Criterios de aceptación

- **Decodificación:** argmax por píxel; en un empate gana el índice más bajo.
  - Con `logits`, la confianza del píxel es la probabilidad softmax del ganador.
  - Con `probabilities`, es el valor máximo, que debe estar en [0, 1].
- **Validación de la salida:** exactamente un tensor float32 `[1, H, W, C]`, con `C = labels.length`, valores finitos, `H × W ≤ 1.048.576` y `H × W × C ≤ 16.777.216` (unos 64 MB). Si no se cumple, `modelOutputInvalid`.
- **Rendimiento:** la decodificación corre fuera del isolate principal.
- **Privacidad:** la traza de ejecución resume la segmentación (`width`, `height`, `confidence` y `areaFractions`) y **nunca** incluye la máscara. Actualiza `Recursos` → `Datos y privacidad`.
- **Versión:** el SDK pasa a 0.4.0. El CHANGELOG lleva `Novedades`, `Cambios incompatibles` (`WorkflowValue` suma `SegmentationResult`) y `Cómo migrar`. La documentación se actualiza: esquema de workflow, compatibilidad, referencia Dart, instalación y ejemplos.
- **Workflows anteriores:** los de clasificación y detección se comportan igual que en 0.3.1.
