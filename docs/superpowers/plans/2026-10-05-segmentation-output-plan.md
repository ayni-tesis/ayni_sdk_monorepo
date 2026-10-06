# Plan de implementación: salida de segmentación (`ayni_sdk` 0.4.0)

**Diseño:** `docs/superpowers/specs/2026-10-05-segmentation-output-design.md`
**Historias:** US-158 (#366), US-159 (#367), US-160 (#368), US-161 (#369) y US-162 (#370)
**Referencias de línea:** monorepo en `d2e3c1a`. Verifícalas antes de editar.

## Estado

- [x] **PR-1: US-158 + US-159**, rama `feat/us-158-segmentation-contract`.
  - Incluye el contrato en db, API, server y web; el grafo con `WorkflowResultType`; el esquema "4" al publicar; el aviso de SDK 0.4.0 en el diálogo de publicación; y el validador del servidor con tope de píxeles y rechazo de alto y ancho dinámicos por `shape_signature`.
  - US-158 y US-159 van juntas porque los tipos del contrato y del grafo están acoplados en web.
- [ ] **PR-2: US-160**, SDK 0.4.0 con su documentación.
- [ ] **PR-3: US-161**, condición sobre el porcentaje de área, en todas las capas.
- [ ] **Publicación de 0.4.0 en pub.dev.** Requiere confirmación del usuario.
- [ ] **PR-4: US-162**, perfil SEG-01 en `apps/native`.

## PR-2 — US-160: ejecutar la segmentación en el SDK (0.4.0)

### `packages/sdk_flutter/lib/src/workflow_definition_validator.dart`
- `supportedSchemaVersions` (:63) pasa a `{'1','2','3','4'}`.
- `_readNodes` (~:227-234):
  - `sources` de salida combinada permitido en los esquemas 2, 3 y 4;
  - `dataset.capture` permitido en 3 y 4;
  - un modelo `segmentation` con un esquema distinto de "4" da `invalidSchema`.
- `_modelOutputTypes` y `_resultTypes` (:118-119) suman `'segmentation'`.
- `_isModelResult` (~:327-344): segmentación con los campos exactos `{'type','labels','scoreType'}`, `scoreType` igual a `'logits'` o `'probabilities'`, y de 1 a 256 etiquetas.
- `_checkPorts` (~:488-489): el puerto `resultado` de la captura solo admite modelos de clasificación o detección.
- Condiciones: siguen aceptando solo un origen de clasificación hasta US-161.
- Actualizar el `///` de la clase y de los estados.

### `packages/sdk_flutter/lib/src/workflow_execution.dart`
- `WorkflowValue` es `sealed` (:186). Agregar `SegmentationResult extends WorkflowValue` después de las otras clases de resultado (~:253):

  ```dart
  final int width, height;
  final List<String> labels;
  final Uint8List mask;                    // fila por fila, unmodifiable (asUnmodifiableView)
  final Map<String, double> areaFractions; // todas las etiquetas, suman 1
  final double confidence;                 // media de la confianza del ganador por píxel
  String labelAt(int x, int y);
  ```

  Todo miembro público lleva `///`, porque `public_member_api_docs` es error. Documentar que la máscara cubre la imagen redimensionada por el SDK (estirada, sin conservar proporción, `_prepareImageTensor`).
- `_infer` (~:785-1064): poner una rama `segmentation` **antes** de la de detección (~:876), porque hoy todo lo que no es clasificación cae en detección.
- Decodificar con una función de nivel superior `_decodeSegmentation(...)` dentro de `Isolate.run`, como `_prepareImageTensor` (:794-802):
  - argmax por píxel; en un empate gana el índice más bajo (`>` estricto), como en la clasificación (~:862-865);
  - con `logits`, la confianza es `1/Σ exp(l_j − l_max)`;
  - con `probabilities`, es el valor máximo, que debe estar en [0, 1].
- Si la salida no es válida, `modelOutputInvalid` con `nodeId`:
  - más de un tensor;
  - forma distinta de `[1,H,W,C]`, o `C != labels.length`;
  - `values.length != H*W*C`;
  - valores no finitos;
  - con `probabilities`, valores fuera de [0, 1];
  - `H*W > 1048576` (mismo tope que `MAX_SEGMENTATION_PIXELS` del servidor).

### Otros archivos del SDK
- `lib/ayni_sdk.dart` (:25-35): exportar `SegmentationResult`.
- `lib/src/workflow_trace.dart` (`_encodeValue`, ~:353-395, un `switch` exhaustivo): la segmentación solo se resume como `{type:'segmentation', nodeId, width, height, confidence, areaFractions}`. **Nunca la máscara.**
- `lib/src/trace_payload.dart` (~:157-200): `_traceSegmentationOutputFields`, registrado en `_traceScalarOutputTypes`. Va en el mismo PR que `packages/api/src/sdk-trace.ts` (~:142-162, `traceScalarOutputSchema`, `z.strictObject` de segmentación), porque `packages/api/src/sdk-trace-allowlist.test.ts` exige que coincidan.
- `lib/src/ayni_sdk.dart` (~:1309-1329): el `///` de `run()` reproduce la región `ejecutar`; agregarle el caso `SegmentationResult`.
- `example/reference/run_workflow.dart` (:21-29, región `ejecutar`) y `example/app/lib/main.dart` (:192-200): agregar el caso `SegmentationResult(:final areaFractions) => ...`.
- `README.md`: versión `^0.4.0` (líneas ~16, 32 y 425), la lista de `WorkflowValue` (~272) y un párrafo sobre el contrato de segmentación.
- `pubspec.yaml`: `0.4.0`.
- `CHANGELOG.md`: nueva entrada arriba, `## 0.4.0 - <fecha>`, con `### Novedades`, `### Cambios incompatibles` (`WorkflowValue` suma `SegmentationResult` y los `switch` exhaustivos dejan de compilar) y `### Cómo migrar` (agregar `SegmentationResult(...) =>` o `_ =>`). Conservar ese orden de secciones. La fecha se fija al publicar.

### `packages/api`
- `src/sdk-trace.ts`: variante de traza de segmentación.
- `src/index.ts:40`: `info.version` pasa a `"0.4.0"`.
- Regenerar `openapi.json` con `bun run openapi:generate`.

### `apps/docs`
Va en el mismo PR. Las pruebas lo exigen; verificar con `bun run verify`.
- `src/resources/compatibility.ts`: `"0.4.0": { minimumServer: "0.4.0", workflowSchema: "1, 2, 3 y 4" }`. `nodeTypeSince` no cambia.
- `src/content/docs/referencia/esquema-de-workflow.mdx`:
  - `schemaVersion` (~:22);
  - salidas del modelo: `segmentation` y `scoreType` (~:74);
  - `resultType` (~:106);
  - la captura no acepta segmentación (~:135);
  - regla del esquema 4 (~:180).
- `recursos/datos-y-privacidad.mdx`:
  - «Válido para `ayni_sdk` 0.4.0» (:42 y :647);
  - la traza de una segmentación solo lleva dimensiones, fracciones y confianza, nunca la máscara (~:177-184).
- `referencia/estados-y-errores.md:8`: 0.4.0.
- `comenzar/que-es-ayni.mdx` (:41 y :50), `comenzar/instalacion-y-configuracion.mdx` (:19 y :32), `comenzar/inicio-rapido.mdx:28` y `conceptos/workflows-dag.mdx:19`: versión y mención de la segmentación.
- `public/referencia/api-dart/`: regenerar con `dart pub get` en `packages/sdk_flutter` y `bun run reference:dart` en `apps/docs`, con Flutter 3.44.8.
- El CLAUDE.md del repo describe cada prueba de documentación; leerlo antes de editar.

### Pruebas que hay que ampliar
- SDK:
  - `test/workflow_definition_validator_test.dart`
  - `test/typed_results_test.dart`: usa el seam `inferenceRunner` con tensores sintéticos; cubre argmax con logits y con probabilidades, empates, `areaFractions` que suman 1, confianza, todos los casos inválidos y `CombinedWorkflowResult`.
  - `test/workflow_execution_test.dart`
  - `test/workflow_trace_test.dart` y `test/telemetry_without_images_test.dart`: la traza no contiene la máscara.
  - `test/public_api_surface_test.dart` (:21-31 y :206)
  - `test/package_version_test.dart`
- API: `sdk-trace.test.ts`.
- Server: `sdk-traces.test.ts` y `sdk-openapi-contract.test.ts`.

### Comandos
- En `packages/sdk_flutter`: `dart analyze` y `dart test` (o `flutter test` si el paquete lo requiere).
- Pruebas de JavaScript y TypeScript: `node node_modules/vitest/vitest.mjs run` en cada paquete. Nunca corras dos vitest a la vez.
- `bun run verify` en `apps/docs`. bun está en `~/.bun/bin`.

## PR-3 — US-161: condición sobre el porcentaje de área

- **Validación:** la condición acepta un origen de segmentación, con una etiqueta del modelo, un operador `gte|gt|lte|lt` y un umbral en [0, 1].
  - API: `isConditionSourceCompatible` (`packages/api/src/workflow-graph.ts` ~:192-198).
  - Server: usa las mismas funciones.
  - Web: `accepted` del catálogo, `segmentation → ["logic","output"]`.
  - SDK: validador (~:517-523).
- **Evaluación en el SDK:** con un origen de segmentación, la condición compara `areaFractions[label]`.
- **Control directo de la app:** `apps/native/lib/validation/execution/direct_tflite_runner.dart` (~:324-348).
- **Sin cambios de forma:** el nodo `condition` no agrega campos y el esquema sigue siendo "4".

## PR-4 — US-162: perfil SEG-01 en `apps/native`

- **Comparación de versión del SDK:** `ayni_sdk_runner.dart:130` compara con `!= '0.3.1'`; pasar a SemVer (al menos 0.3.1 para detección y al menos 0.4.0 para segmentación). Además: `validationSdkVersion` en `validation_run_metadata_reader.dart:5`, la prueba `build_configuration_test.dart:17` y el valor por defecto de `sdkVersion` en `ayni_sdk_runner.dart:76`.
- **Contrato del modelo:**
  - `experiment_plan.dart`: `ValidationResultType.segmentation` y `scoreType` en `ValidationModelOutputContract` y `ValidationOutputContract`;
  - `validation_model_repository.dart`: claves del contrato;
  - `ayni_sdk_runner.dart`: `_matchesModelOutput` (~:519-544).
- **Normalización:** en `validation_output_normalizer.dart`, `_segmentationFromTensors` con implementación propia del control, y `SegmentationResult` en `_normalizeSdkValue`.
- **Registro JSONL:** `maskSha256`, `width`, `height`, `areaFractions`, `confidence` y la máscara en RLE. Nunca se envía al servidor.
