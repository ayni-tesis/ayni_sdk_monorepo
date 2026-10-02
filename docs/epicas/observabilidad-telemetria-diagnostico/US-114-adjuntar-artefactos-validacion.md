# US-114 — Adjuntar artefactos fuente de validación

**Épica:** Observabilidad, telemetría y diagnóstico

## Historia de usuario

Como investigador o integrante autorizado de una aplicación, quiero adjuntar y consultar los artefactos originales de medición para conservar evidencia verificable de cada corrida.

## Happy path

```gherkin
Scenario: Adjuntar un artifact de benchmark
  Given que existe una traza de una aplicación con política de telemetría habilitada
  And el cliente cuenta con un artifact fuente de Macrobenchmark o Perfetto
  When carga el archivo y lo vincula a la traza
  Then el servidor verifica su tamaño y SHA-256
  And registra sus metadatos y una referencia privada
```

## Bad path

```gherkin
Scenario: Consultar o descargar un artifact no autorizado
  Given que no pertenezco a la aplicación propietaria de la traza
  When intento consultar o descargar el artifact
  Then el servidor rechaza la solicitud sin revelar su existencia
```

## Criterios de aceptación

- Los archivos binarios se cargan a R2 con el patrón de carga directa/autorizada ya usado por artefactos de modelos; no se envían como binario dentro del API JSON.
- El cliente rechaza redirecciones a otro origen al usar una URL firmada de R2 y no reenvía la URL firmada ni sus parámetros a otro origen.
- Solo se aceptan formatos binarios no ejecutables de una allowlist de implementación; se excluyen HTML, SVG y JavaScript.
- El registro incluye tipo/formato, tamaño, SHA-256, nombre lógico y, cuando aplique, herramienta y versión que lo produjo.
- El servidor determina el formato a partir del contenido, no del nombre o los headers del cliente; verifica hash y tamaño y almacena una referencia privada sin exponer la clave interna.
- Solo miembros autorizados de la aplicación pueden ver metadatos o descargar el archivo.
- Las descargas se sirven como adjunto con `Content-Type: application/octet-stream` y `X-Content-Type-Options: nosniff`; cualquier vista previa futura debe usar un origen aislado sin credenciales de la aplicación.
- La política de telemetría debe estar habilitada para adjuntar el artifact.
- El artifact se elimina junto con su traza cuando vence la retención por aplicación.
- Los límites de tamaño y formatos admitidos se establecen en implementación según las restricciones reales de API/R2; no se inventan en esta historia.
- `Recursos` → `Datos y privacidad` (US-147) describe, en el mismo cambio, los datos que esta historia agrega o cambia, la política que los habilita, el consentimiento que resulte aplicable (sin tratar `sdkImprovement` como consentimiento para la validación) y su retención.
