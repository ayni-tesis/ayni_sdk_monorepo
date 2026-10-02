# US-103 — Registrar una traza de ejecución

**Épica:** Observabilidad, telemetría y diagnóstico

## Historia de usuario

Como SDK, quiero registrar una traza por ejecución para saber qué workflow, modelos y resultado se usaron.

## Happy path

```gherkin
Scenario: Workflow ejecutado
  Given que la telemetría está habilitada
  When termina una ejecución de workflow
  Then el SDK crea localmente una traza con workflow, versiones, estado, duración, perfil e identificador de instalación
  And la adjunta al resultado o error tipado de esa ejecución
```

## Bad path

```gherkin
Scenario: Telemetría deshabilitada
  Given que la política deshabilita telemetría o no existe una política conocida
  When termina una ejecución de workflow
  Then el SDK no crea una traza
```

## Criterios de aceptación

- La traza no incluye los bytes de la imagen ni tensores/binarios arbitrarios del runtime.
- La traza sí puede incluir el resultado de inferencia decodificado por el contrato público del SDK: clasificación (etiquetas y confianzas), detección (etiquetas, confianzas y cajas) o booleano.
- La traza identifica workflow y versiones usadas.
- La creación de una traza no bloquea la respuesta del workflow.
- `Recursos` → `Datos y privacidad` (US-147) describe, en el mismo cambio, los
  datos que esta historia agrega o cambia, la política que los habilita, el
  consentimiento que resulte aplicable (sin tratar `sdkImprovement` como consentimiento para la validación) y su retención.

## Criterios para validación técnica

- Cada ejecución elegible produce un registro con versión de esquema y `traceId` estable, además de `runId` y repetición obligatorios, fecha, condición (`control`/`tratamiento`), caso y escenario. La app declara `runId` y repetición; el SDK no inventa esos valores.
- Incluye commit/versiones de app y SDK, workflow y versión, modelos realmente usados con versión/SHA-256, dataset/partición y hashes declarados cuando correspondan.
- Incluye estado, duración total, fases/nodos, resultado estructurado y error tipado/sanitizado si existe; las mediciones externas incluyen valor, unidad, método, fuente y fase.
- La validez, condición, contexto experimental y mediciones aportadas por la app se conservan como declaraciones del cliente. El servidor marca su origen como `clientReported`/no verificado.
- Campos pendientes del protocolo pueden quedar ausentes; no se inventan valores ni se presenta una traza cliente como verificación experimental del servidor.
- La captura requiere política conocida y habilitada; sin ella, el SDK no captura la traza.
- `GET /sdk/telemetry-policy` usa la credencial SDK y devuelve solo habilitación y retención; la aplicación se deriva de la credencial. `sync()` guarda la respuesta válida y continúa normalmente si no logra refrescarla.
- La consulta de política autenticada rechaza redirecciones a otro origen y nunca reenvía la credencial SDK a ese origen.
- La traza local es `WorkflowTrace` y está disponible como `WorkflowResult.trace` o `WorkflowError.trace`; no inicia solicitudes de red ni queda en una cola durable en esta historia.
- El esquema incluye `traceSchemaVersion`, `traceId`, `runId` y repetición obligatorios, condición/caso, procedencia, perfil, hashes/modelos, resultado estructurado, tiempos, mediciones externas e incidencias/validez declaradas.
- Los campos suministrados por la app se identifican como reportados por el cliente; el servidor no certifica su veracidad experimental.
- Envío, reintentos durables e ingesta de trazas son US-106 y US-107; esta historia no los implementa.
- El SDK expone una factory pública tipada para crear localmente una traza del mismo esquema a partir de una ejecución de control realizada fuera de `AyniSdk.run`; no ejecuta inferencia, envía datos ni crea una cola durable en esta historia.
