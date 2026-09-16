# US-056 — Evaluar un nodo de condición

**Épica:** Ejecución local del SDK

## Historia de usuario

Como SDK, quiero evaluar una condición tipada para elegir la rama correcta del workflow.

## Interfaz

Operación interna; no se muestra la lógica del DAG a la persona usuaria. Si falta un dato para evaluar, la app recibe `conditionInputMissing` y muestra `No se pudo completar el análisis con la información disponible.`

## Happy path

```gherkin
Scenario: Condición verdadera
  Given que una condición recibe una salida compatible
  When su etiqueta, operador y umbral se cumplen
  Then el SDK selecciona la rama verdadera
```

## Bad path

```gherkin
Scenario: Condición sin dato requerido
  Given que una condición requiere una etiqueta no presente en la salida
  When el SDK la evalúa
  Then devuelve conditionInputMissing
  And no ejecuta ninguna rama dependiente
```

## Criterios de aceptación

- Las condiciones usan operadores definidos por el SDK, no código remoto.
- La evaluación selecciona exactamente una rama.
- Una condición inválida detiene únicamente la ejecución solicitada.
