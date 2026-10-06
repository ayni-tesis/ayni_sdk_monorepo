# US-161 — Evaluar una condición sobre el porcentaje de área

**Épica:** Ejecución local del SDK

## Historia de usuario

Como administrador, quiero que un nodo de condición evalúe el porcentaje de la imagen que ocupa una clase segmentada para ramificar el workflow. Por ejemplo, `roya ≥ 10 % → Revisar hoja`.

## Interfaz

- **Dashboard:** el lienzo permite conectar un resultado de `Segmentación` a un nodo `Condición`. En el panel de la condición se elige una etiqueta del modelo, el operador y el umbral entre 0 y 1. El resumen muestra `<etiqueta> ≥ <umbral>`.
- **SDK:** si el origen de la condición es un modelo de segmentación, compara `areaFractions[label]` con `threshold` y entrega un `BooleanResult`, igual que con una clasificación.

### Estados y mensajes

- Condición inválida: `Ingresa una condición válida.`
- Etiqueta inexistente en el modelo: `Esta condición no es compatible con la salida seleccionada.`

## Happy path

```gherkin
Scenario: Ramificar por el área de una clase
  Given un workflow con un modelo de segmentación y una condición "roya gte 0.1"
  When la máscara asigna "roya" al 15 % de los píxeles
  Then la condición vale true y se ejecuta la rama "Verdadero"
```

## Bad path

```gherkin
Scenario: Etiqueta que el modelo no tiene
  Given un modelo de segmentación con las etiquetas "fondo" y "hoja"
  When el administrador crea una condición sobre "roya"
  Then el servidor la rechaza con "Esta condición no es compatible con la salida seleccionada."
```

## Criterios de aceptación

- **Validación igual en todos lados:** el servidor, el API (`workflow-graph`) y el validador del SDK aceptan una condición con origen de segmentación y la validan igual que con una clasificación: etiqueta del modelo, operador `gte`, `gt`, `lte` o `lt`, umbral en [0, 1].
- **Esquema:** el workflow sigue publicándose con el esquema `"4"`, porque contiene segmentación. No se agregan campos al nodo `condition`.
- **App de validación:** la integración directa de la app de validación evalúa la condición en US-162, porque el runner directo aún no decodifica segmentación. Esta historia no cambia `apps/native`.
- **Versión:** entra en la misma versión 0.4.0 del SDK.
