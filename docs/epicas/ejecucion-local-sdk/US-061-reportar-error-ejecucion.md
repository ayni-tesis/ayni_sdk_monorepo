# US-061 — Reportar un error de ejecución tipado

**Épica:** Ejecución local del SDK

## Historia de usuario

Como desarrollador Flutter, quiero recibir errores de ejecución tipados para reaccionar correctamente ante recursos, entradas o modelos inválidos.

## Interfaz

`WorkflowError` expone categoría y nodo cuando existe. Textos sugeridos: `No se pudo cargar el modelo requerido.`, `La imagen no es válida.` y `Ocurrió un error al ejecutar el análisis.`; no muestra trazas ni rutas internas.

## Happy path

```gherkin
Scenario: Error de un modelo identificado
  Given que un nodo de modelo falla durante la ejecución
  When el SDK detiene el workflow
  Then devuelve un error con el nodo y la categoría de fallo
```

## Bad path

```gherkin
Scenario: Excepción no prevista del runtime
  Given que el runtime lanza una excepción no prevista
  When el SDK la recibe
  Then la convierte en runtimeError
  And no expone rutas locales, secretos ni trazas internas a la app
```

## Criterios de aceptación

- Los errores distinguen entrada, workflow, modelo, condición y runtime.
- El error identifica el nodo afectado cuando existe.
- El SDK no expone información sensible en mensajes de error.
