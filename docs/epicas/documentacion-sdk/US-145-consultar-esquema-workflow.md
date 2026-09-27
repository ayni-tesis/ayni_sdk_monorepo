# US-145 — Consultar el esquema de un workflow publicado

**Épica:** Documentación del SDK

## Historia de usuario

Como desarrollador que integra el SDK, quiero conocer el formato de un workflow
publicado y las reglas con que el SDK lo valida para entender qué recibirá mi
app y por qué una actualización puede rechazarse.

## Interfaz

### Ubicación

`Referencia` → `Esquema de workflow`.

### Elementos y texto visible

- Estructura general de la definición: `{ nodes, connections }`, y aviso `Nota`:
  `La disposición del lienzo no forma parte de la versión publicada.`
- Tabla de tipos de nodo con sus campos exactos: `input.image`,
  `model.tflite`, `condition` y `output`.
- Sección `Conexiones`: formato de una conexión, tipos de puerto compatibles y
  regla de grafo acíclico.
- Sección `Reglas de validación`: cada regla que aplica el SDK antes de
  instalar, con el resultado (`SyncResourceStatus.invalidWorkflow`) y el
  mensaje que recibe la app.
- Ejemplo completo de un workflow publicado en JSON, con el botón `Copiar`.

### Estados y mensajes

- Tipo de nodo sin soporte en la versión del SDK: la página indica qué ocurre
  (se rechaza la actualización y se conserva la versión anterior) y enlaza a
  `Notas de versión y compatibilidad` (US-148).

## Happy path

```gherkin
Scenario: Entender un workflow publicado
  Given que abro "Esquema de workflow"
  When reviso el ejemplo completo
  Then identifico cada nodo, sus campos y cómo se conectan
```

## Bad path

```gherkin
Scenario: Entender por qué se rechazó una actualización
  Given que sync() devolvió invalidWorkflow para un workflow
  When consulto "Reglas de validación"
  Then encuentro las reglas que puede incumplir una definición
  And sé que el SDK conservó la última versión válida cuando existía
```

## Criterios de aceptación

- Los tipos de nodo y sus campos coinciden con `WorkflowDefinitionValidator`
  (`packages/sdk_flutter/lib/src/workflow_definition_validator.dart`) y con
  `WorkflowNode` del servidor.
- El ejemplo JSON pasa la validación del SDK en una prueba automatizada (US-150).
- Cuando se agregue un tipo de nodo (por ejemplo `dataset.capture`), la página
  se actualiza en el mismo cambio y declara desde qué versión del SDK existe.
