# US-158 — Registrar el contrato de un modelo de segmentación

**Épica:** Modelos

## Historia de usuario

Como administrador, quiero declarar que una versión de modelo TensorFlow Lite hace segmentación semántica para usarla después en un workflow que entregue una máscara por píxel.

## Interfaz

### Ubicación

Dashboard → aplicación → `Modelos` → versión del modelo → diálogo `Contrato de la versión <versión>`.

### Elementos y texto visible

- Campo: `Tipo de tarea`, con la opción nueva `Segmentación`, además de `Clasificación` y `Detección`.
- Campo, solo para segmentación: `Tipo de puntaje`, sin valor inicial (`Elige un tipo de puntaje`) y con las opciones `Logits` y `Probabilidades`. Ayuda: `Indica si la salida del modelo trae logits o probabilidades por píxel.` No tiene valor por defecto porque logits y probabilidades se decodifican distinto.
- Campo existente: `Etiquetas, una por línea`, en el orden de los canales de la salida (hasta 256).
- Acción principal: `Guardar contrato`.
- En la tabla de versiones, la columna de tarea muestra `Segmentación`.

### Estados y mensajes

- Carga: `Guardando…`.
- Éxito: el diálogo se cierra y la versión muestra `Segmentación`.
- Tipo de puntaje sin elegir: `Elige si la salida del modelo trae logits o probabilidades.`
- Error de compatibilidad: `El contrato no es compatible con TensorFlow Lite.`
- Error genérico: `No se pudo guardar el contrato.`

## Happy path

```gherkin
Scenario: Guardar el contrato de un modelo de segmentación
  Given una versión de modelo cuyo .tflite tiene una sola salida float32 [1, 257, 257, 21]
  When el administrador elige "Segmentación", "Logits", entrada 257 × 257 × 3, normalización "-1 a 1" y 21 etiquetas
  And pulsa "Guardar contrato"
  Then el contrato queda guardado con output.type "segmentation", 21 etiquetas y scoreType "logits"
  And la versión muestra "Segmentación"
```

## Bad path

```gherkin
Scenario: El tensor no coincide con las etiquetas
  Given una versión cuyo .tflite tiene una salida [1, 257, 257, 21]
  When el administrador declara 20 etiquetas de segmentación
  Then el servidor rechaza el contrato con "El contrato no es compatible con TensorFlow Lite."
```

## Criterios de aceptación

- **Contrato de segmentación:** `{ type: "segmentation", labels: string[] (1 a 256), scoreType: "logits" | "probabilities" }`. Se rechazan los campos extra y las etiquetas repetidas (`incompatibleContract`): las fracciones de área se indexan por etiqueta.
- **Compatibilidad con el `.tflite`:** el servidor la acepta solo si el archivo tiene exactamente una salida **float32** `[1, H, W, C]`, con `C = labels.length`, `H ≥ 1`, `W ≥ 1` y `H × W ≤ 1.048.576` y `H × W × C ≤ 16.777.216` valores (unos 64 MB de float32). El alto y el ancho no pueden ser dinámicos: en `shape_signature` no pueden valer -1.
- **API y OpenAPI:** el OpenAPI (`packages/api/src/openapi.json`) incluye la variante y `openapi:verify` pasa.
- **Dashboard:** el diálogo guarda y vuelve a cargar `scoreType`; la tabla de versiones distingue `Clasificación`, `Detección` y `Segmentación`.
- **Sin efecto en los SDK publicados:** ningún workflow publicado cambia de esquema por este contrato. Hasta US-159 no se puede agregar un modelo de segmentación a un workflow.
