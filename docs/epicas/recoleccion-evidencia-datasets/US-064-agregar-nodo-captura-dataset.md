# US-064 — Agregar un nodo de captura para dataset

**Épica:** Recolección de evidencia para datasets

## Historia de usuario

Como administrador, quiero agregar un nodo `dataset.capture` a un workflow para solicitar evidencia solo en los flujos que la necesiten.

## Interfaz

Editor DAG → `Nodos` → `Capturar para dataset`. La tarjeta se titula `Capturar evidencia` y muestra entradas `imagen` y `resultado`. Si la política no está habilitada, la opción está deshabilitada con `Habilita la recolección de evidencia en la configuración de la aplicación.`

## Happy path

```gherkin
Scenario: Agregar captura después de detección
  Given que un borrador contiene una salida de detección
  And la aplicación tiene una política de recolección habilitada
  When agrego un nodo dataset.capture compatible
  Then el sistema añade el nodo con la imagen y resultado como entradas
```

## Bad path

```gherkin
Scenario: Agregar captura sin política habilitada
  Given que la aplicación no tiene una política de recolección habilitada
  When intento agregar un nodo dataset.capture
  Then el sistema rechaza la operación
  And no añade el nodo
```

## Criterios de aceptación

- El nodo usa entradas tipadas de imagen y resultado de inferencia.
- El nodo solo puede agregarse si la aplicación habilitó recolección.
- El nodo no contiene código ejecutable arbitrario.
