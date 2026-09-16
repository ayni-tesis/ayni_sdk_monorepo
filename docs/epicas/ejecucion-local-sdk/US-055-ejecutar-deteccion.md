# US-055 — Ejecutar un nodo de detección

**Épica:** Ejecución local del SDK

## Historia de usuario

Como usuario de una app móvil, quiero que el SDK ejecute un modelo de detección para obtener objetos, etiquetas, confianza y ubicación.

## Interfaz

`WorkflowResult.detections` contiene etiqueta, confianza y caja. La app puede dibujar las cajas y una lista `Detecciones`; si no hay ninguna: `No se detectaron objetos.`; salida inválida: `El modelo devolvió detecciones no válidas.`

## Happy path

```gherkin
Scenario: Detectar objetos en una imagen
  Given que un nodo de detección tiene una imagen y modelo disponibles
  When el SDK ejecuta el nodo
  Then devuelve detecciones con etiqueta, confianza y caja delimitadora
```

## Bad path

```gherkin
Scenario: Caja delimitadora inválida
  Given que un modelo de detección devuelve una caja fuera de los límites de la imagen
  When el SDK procesa su salida
  Then descarta el resultado inválido
  And devuelve modelOutputInvalid si no queda una salida válida
```

## Criterios de aceptación

- Cada detección contiene etiqueta, confianza y coordenadas normalizadas o documentadas.
- Las salidas inválidas no pasan a nodos posteriores.
- La detección se ejecuta localmente sin red.
