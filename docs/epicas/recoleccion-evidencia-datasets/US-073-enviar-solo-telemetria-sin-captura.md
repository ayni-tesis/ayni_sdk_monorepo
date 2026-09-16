# US-073 — Enviar solo telemetría sin nodo de captura

**Épica:** Recolección de evidencia para datasets

## Historia de usuario

Como administrador, quiero que un workflow sin `dataset.capture` emita solo telemetría para observar su uso sin recolectar imágenes.

## Interfaz

En el editor, un workflow sin `Capturar evidencia` muestra `Este workflow no recolecta imágenes.` La pantalla de telemetría aclara `La telemetría no incluye imágenes de entrada.`

## Happy path

```gherkin
Scenario: Workflow sin captura de evidencia
  Given que un workflow no contiene dataset.capture
  When el SDK lo ejecuta
  Then registra telemetría de ejecución sin incluir la imagen de entrada
```

## Bad path

```gherkin
Scenario: Intento de adjuntar una imagen a telemetría
  Given que un workflow no contiene dataset.capture
  When un componente intenta añadir la imagen a un evento de telemetría
  Then el SDK rechaza el adjunto
  And envía solo los metadatos permitidos
```

## Criterios de aceptación

- La telemetría no incluye imágenes, secretos ni datos de entrada crudos.
- El nodo dataset.capture es el único mecanismo de recolección de imágenes.
- La ejecución de telemetría no bloquea el resultado del workflow.
