# US-074 — Filtrar evidencia por confianza

**Épica:** Recolección de evidencia para datasets

## Historia de usuario

Como administrador, quiero condicionar la captura por confianza de detección para recolectar ejemplos útiles para mejorar el modelo.

## Interfaz

En el editor se conecta `Condición` a `Capturar evidencia`; la condición muestra `Capturar solo cuando` con etiqueta, operador y umbral. La vista previa de flujo rotula la rama `Capturar evidencia` y la otra `No capturar`.

## Happy path

```gherkin
Scenario: Capturar una predicción de baja confianza
  Given que dataset.capture está conectado a una condición de baja confianza
  When el resultado cumple esa condición
  Then el SDK encola la evidencia para dataset
```

## Bad path

```gherkin
Scenario: Predicción fuera del criterio de captura
  Given que dataset.capture está condicionado por un umbral de confianza
  When el resultado no cumple el umbral
  Then el SDK no crea evidencia
  And conserva la telemetría permitida
```

## Criterios de aceptación

- El filtrado reutiliza los nodos de condición tipados del DAG.
- El SDK no implementa expresiones arbitrarias para muestreo.
- Una evidencia solo se crea si la ruta de captura es alcanzable.
