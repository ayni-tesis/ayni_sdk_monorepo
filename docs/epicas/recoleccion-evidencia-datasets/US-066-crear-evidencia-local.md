# US-066 — Crear evidencia local de una inferencia

**Épica:** Recolección de evidencia para datasets

## Historia de usuario

Como SDK, quiero crear una evidencia local al ejecutar `dataset.capture` para subirla más tarde sin bloquear el resultado de la app.

## Interfaz

La API de ejecución devuelve el resultado sin esperar la carga. La app puede recibir el evento `evidenceQueued`; si falta consentimiento, solo muestra el resultado y no indica que se guardó una imagen. En diagnóstico: `Evidencia guardada para envío posterior.`

## Happy path

```gherkin
Scenario: Workflow alcanza un nodo de captura
  Given que el workflow tiene un nodo dataset.capture alcanzable
  When termina la inferencia previa
  Then el SDK crea una evidencia local con imagen, resultado y versión de workflow
  And continúa devolviendo el resultado a la app
```

## Bad path

```gherkin
Scenario: No existe consentimiento vigente
  Given que el workflow alcanza un nodo dataset.capture
  And el SDK no tiene consentimiento vigente de recolección
  When intenta crear evidencia
  Then omite la captura
  And devuelve el resultado de inferencia sin subir la imagen
```

## Criterios de aceptación

- La evidencia identifica aplicación, workflow, versión y modelo usados.
- La captura no bloquea el resultado de la inferencia.
- Sin consentimiento vigente no se conserva la imagen.
