# US-103 — Registrar una traza de ejecución

**Épica:** Observabilidad, telemetría y diagnóstico

## Historia de usuario

Como SDK, quiero registrar una traza por ejecución para saber qué workflow, modelos y resultado se usaron.

## Happy path

```gherkin
Scenario: Workflow ejecutado
  Given que la telemetría está habilitada
  When termina una ejecución de workflow
  Then el SDK registra workflow, versiones, estado, duración e identificador de instalación
```

## Bad path

```gherkin
Scenario: Telemetría deshabilitada
  Given que la política deshabilita telemetría
  When termina una ejecución de workflow
  Then el SDK no crea ni envía una traza
```

## Criterios de aceptación

- La traza no incluye los bytes de la imagen ni tensores/binarios arbitrarios del runtime.
- La traza sí puede incluir el resultado de inferencia decodificado por el contrato público del SDK: clasificación (etiquetas y confianzas), detección (etiquetas, confianzas y cajas) o booleano.
- La traza identifica workflow y versiones usadas.
- La creación de una traza no bloquea la respuesta del workflow.
- `Recursos` → `Datos y privacidad` (US-147) describe, en el mismo cambio, los
  datos que esta historia agrega o cambia, la política que los habilita, el
  consentimiento requerido y su retención.

## Criterios para validación técnica

- Cada ejecución elegible produce un registro con versión de esquema y `traceId` estable, además de `runId`, repetición, fecha, condición (`control`/`tratamiento`), caso y escenario.
- Incluye commit/versiones de app y SDK, workflow y versión, modelos realmente usados con versión/SHA-256, dataset/partición y hashes declarados cuando correspondan.
- Incluye estado, duración total, fases/nodos, resultado estructurado y error tipado/sanitizado si existe; las mediciones externas incluyen valor, unidad, método, fuente y fase.
- La validez, condición, contexto experimental y mediciones aportadas por la app se conservan como declaraciones del cliente. El servidor marca su origen como `clientReported`/no verificado.
- Campos pendientes del protocolo pueden quedar ausentes; no se inventan valores ni se presenta una traza cliente como verificación experimental del servidor.
- La captura requiere política conocida y habilitada; sin ella, el SDK no captura la traza.
