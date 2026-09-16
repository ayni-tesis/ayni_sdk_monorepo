# US-058 — Ejecutar solo la rama seleccionada

**Épica:** Ejecución local del SDK

## Historia de usuario

Como usuario de una app móvil, quiero que el SDK ejecute únicamente la rama elegida por una condición para evitar inferencias innecesarias.

## Interfaz

La selección de rama es interna. La app solo ve el resultado final; ante ruta incompleta recibe `invalidWorkflow` y muestra `El workflow no tiene una ruta de resultado válida.`

## Happy path

```gherkin
Scenario: Rama verdadera seleccionada
  Given que una condición selecciona la rama verdadera
  When el SDK continúa el workflow
  Then ejecuta los nodos alcanzables por esa rama
  And no ejecuta los nodos exclusivos de la rama falsa
```

## Bad path

```gherkin
Scenario: Rama seleccionada sin nodo siguiente
  Given que una condición selecciona una rama sin salida conectada
  When el SDK continúa el workflow
  Then devuelve invalidWorkflow
  And no ejecuta nodos no relacionados
```

## Criterios de aceptación

- El SDK no ejecuta nodos fuera de la rama seleccionada.
- Las ramas convergentes reciben solo resultados disponibles de su ruta.
- Una ruta incompleta devuelve un error tipado.
