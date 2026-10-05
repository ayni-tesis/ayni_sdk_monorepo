# Diseño: suite multiperfil de validación móvil

**Estado:** propuesta aprobada para revisión escrita  
**Fecha:** 5 de octubre de 2026

## Objetivo

Ampliar la app Android de validación para ejecutar con un solo botón los casos preparados por el compañero. La app conserva una sola configuración de SDK Key, corre integración directa y `ayni_sdk` con los mismos bytes y el mismo workflow funcional, guarda resultados localmente y envía solo las trazas permitidas.

La app valida la integración y el SDK; no evalúa la exactitud de los modelos como producto de aprendizaje automático.

## Estado actual

- `apps/native/assets/validation/experiment_plan.json` configura solo café con EfficientNetB0 y una salida de clasificación.
- `ValidationResourceProfile` identifica un dataset, un modelo y un workflow; el runner directo admite un modelo y una salida.
- `AyniSdkValidationRunner` verifica que los nodos de modelo del workflow usen una única versión declarada en el perfil y rechaza detección con `sdkDetectionTensorRolesUnsupported`.
- La ruta de detección de `ayni_sdk 0.2.0` infiere cajas por forma del tensor y clases y puntuaciones por sus valores. El runner directo usa índices explícitos y respeta la cantidad válida (`count`).
- La aplicación ya verifica los ZIP, manifiestos, hashes, versiones de modelo y workflow, guarda JSONL en el dispositivo y sincroniza las trazas SDK de acuerdo con el permiso local.
- El ZIP contiene cinco modelos distintos. El EfficientNet de café está copiado en más de un caso; la configuración de producción compartida hasta ahora usa solo ese modelo, su dataset BRACOL y un workflow de clasificación.

## Casos del ZIP

| Caso | Recursos y uso en la app |
|---|---|
| INT-01 | Café, EfficientNetB0, clasificación. Perfil actual; 268 imágenes BRACOL. |
| S1 | Café, MobileNetV2 con las mismas etiquetas y contrato; prueba de cambio de modelo. Reutiliza el dataset BRACOL. |
| REU-01 | Tomate, `second_crop_classifier`, clasificación de diez etiquetas; 500 imágenes PlantVillage. |
| S2 | Workflow compuesto: EfficientNetB0 para clasificación, SSD MobileNetV2 para detección, una condición `sana >= 0.8` y salidas de clasificación, detección y ramas booleanas. Usa 172 imágenes COCO preparadas. Se ejecutará el grafo completo bajo ambas condiciones. |
| Segmentación | DeepLabV3 no es compatible con el contrato publicado del SDK. El ZIP lo describe como caso negativo de rechazo, sin métrica de precisión. No se ejecutará como caso positivo ni se eludirán los validadores del servicio de producción. |

## Diseño

### Suite y perfiles de recursos

El plan pasará de un perfil activo a una suite declarativa de perfiles. Cada escenario del Plan indicará qué perfil ejecuta y mantendrá sus cantidades de repeticiones y bloques; las cantidades seguirán en el plan, no en el código del batch. Los perfiles identificarán el dataset/versionado/hash, los casos del manifiesto, cada artefacto TFLite y su contrato, el workflow inmutable y sus salidas esperadas.

Un perfil enumerará los modelos del caso con un identificador de nodo, versión, SHA-256 y contratos de entrada y salida. Así, S2 puede declarar EfficientNet y SSD con tamaños y normalización distintos. El preflight descarga y verifica todos los recursos de la suite antes de iniciar la primera medición; un recurso inválido o ausente impide que el lote comience parcialmente.

La app seguirá mostrando configuración de SDK Key, un botón **Iniciar validación**, porcentaje, caso/fase actual y trazas recientes. No se añadirá un selector de escenarios o condiciones. La operación medirá cada escenario habilitado conforme a sus repeticiones del Plan.

### Ejecución pareada

- **Control directo:** un runner de TFLite ejecuta directamente cada nodo `model.tflite` del caso sobre los mismos bytes verificados. Aplica los contratos por modelo y, para S2, evalúa la condición de clasificación y construye las salidas tipadas declaradas. No llama a `ayni_sdk`.
- Durante la preparación, el control obtiene la misma definición de workflow inmutable que el tratamiento y comprueba sus nodos/versiones. Su intérprete directo implementa solo los nodos publicados que el SDK ya admite (`input.image`, `model.tflite`, `condition`, `output`); cada nodo de modelo usa el artefacto TFLite y el contrato verificados por su versión. El control no reutiliza ejecutores ni lógica interna del SDK.
- **Tratamiento SDK:** `ayni_sdk` descarga/sincroniza los workflows y modelos publicados, ejecuta la versión exacta del workflow y produce los mismos nombres y tipos de salida.
- Ambos resultados se normalizan a una forma compartida antes de persistirlos. Cada par conserva el mismo `pairRunId`, perfil, `caseId`, SHA-256 de imagen y backend CPU.
- Ninguna inferencia medida hace solicitudes de red. La preparación y la sincronización de trazas ocurren fuera del intervalo medido.

### Contrato de detección y versión SDK

La salida de un modelo de detección declarará un mapa explícito `tensorIndices` con los roles `boxes`, `classes`, `scores` y `count`. El contrato de la versión del modelo transportará ese mapa y el dashboard lo copiará al nodo del workflow.

La API, el dashboard y los validadores aceptarán el mapa solo con los cuatro roles, índices enteros distintos dentro de los cuatro tensores publicados. El SDK validará de nuevo la estructura real en el dispositivo y usará esos índices, incluido `count`, para producir `DetectionResult`. Los workflows antiguos sin mapa conservarán el comportamiento heredado del SDK; el perfil S2 de la tesis exigirá el mapa explícito. La implementación se publicará en una nueva versión del SDK después de que pasen CI y revisión; la versión inicial propuesta es `0.3.0`.

### Resultados y trazas

El JSONL añadirá una lista de modelos (id de versión y hash por modelo) y podrá representar todas las salidas del workflow compuesto. Los registros existentes de una versión anterior seguirán siendo legibles; no se borran ni se reescriben. Cada intento mantiene resultado, duración, condición, fase, caso, dispositivo y errores tipados.

Los resultados de la aplicación y las imágenes permanecen en el teléfono. Las trazas de tratamiento se capturan y sincronizan solo si el permiso de trazas está habilitado, e incluyen las salidas tipadas autorizadas. La sincronización no carga el JSONL ni las imágenes.

## Datos y despliegue

- Los IDs `c0ffee…` del ZIP son ejemplos, no IDs de producción. MobileNetV2, tomate y SSD necesitan versiones reales registradas; S2 necesita el workflow completo publicado con ambos nodos de modelo y los resultados esperados. El perfil de la app usará IDs y hashes reales.
- BRACOL y PlantVillage se prepararán como versiones privadas independientes con manifiestos y hashes verificados.
- El README del ZIP documenta licencias Flickr distintas para las imágenes COCO y dice que no deben redistribuirse. No se cargarán las 172 imágenes a R2 de producción hasta filtrar un subconjunto con términos que permitan ese uso o confirmar permiso. La suite puede declarar el perfil S2 incompleto y bloquear la ejecución completa hasta provisionarlo; no cambiará silenciosamente de caso.
- Los modelos y datasets grandes no se incluirán en Git ni dentro del APK.

## Errores y compatibilidad

- La preparación valida primero el plan, las URLs firmadas, los hashes, los contratos de todos los modelos y la definición/versionado de workflows. Un fallo detiene el inicio y señala el recurso del caso.
- Durante la corrida, cada intento conserva éxito, error o cancelación en JSONL; un fallo de una inferencia no altera versiones instaladas y sigue el comportamiento de batch definido por el Plan.
- Antes de cada caso SDK se verifica que el workflow publicado contenga exactamente los modelos y contratos esperados, incluidas las salidas necesarias. Una versión distinta o incompleta nunca se usa como reemplazo.
- El formato JSONL nuevo permite varios modelos por registro y mantiene lectura de registros anteriores.
- No se crean workflows de segmentación inválidos en producción. La validación negativa del segmentador permanece en pruebas SDK aisladas, donde se pueden controlar las definiciones que se reciben.

## Pruebas de aceptación

1. Los contratos y el dashboard guardan y devuelven `tensorIndices` sin perder metadatos del detector.
2. Pruebas del SDK permutan el orden de los tensores de detección y verifican puntuaciones, cajas y truncamiento por `count`; mapas incompletos, duplicados o incompatibles fallan con error tipado.
3. Una prueba de contrato confirma que los workflows publicados transportan los índices del contrato del modelo al nodo del grafo.
4. Pruebas nativas verifican que los perfiles de un y varios modelos se preparen con versiones/hashes exactos, que el runner directo ejecute los dos nodos de S2 y su condición, y que su resultado normalizado coincida con el de `ayni_sdk` para los mismos bytes.
5. Pruebas de suite verifican que todos los recursos se validen antes de escribir el primer registro, que el progreso abarque cada caso/fase, que la cancelación pare las siguientes inferencias y que el JSONL nuevo y antiguo se lean.
6. La prueba en Android compara control y SDK con cada caso provisionado, especialmente las 172 imágenes autorizadas de S2. La validación de escritorio no sustituye esta ejecución en dispositivo.

## Fuera de alcance

- Inferencia positiva de segmentación o cambio del contrato para soportarla.
- Publicar salidas JSONL o imágenes a un servicio remoto.
- Cambiar las cantidades o criterios estadísticos del Plan.
- Automatizar las fallas F1–F6 o incorporar PERF-01 al lote ordinario.
- Publicar datos COCO cuya licencia no autorice el uso propuesto.

## Decisiones pendientes para implementación

- Registrar los modelos/workflows/datasets adicionales en el dashboard y sustituir los IDs de ejemplo por IDs/versiones reales.
- Resolver la selección o autorización del subconjunto COCO antes de subirlo a R2.
- Tras decidir la versión del SDK y congelar su release, alinear la referencia de versión del Plan técnico antes de medir.
