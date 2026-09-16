# US-031 — Agregar un nodo de salida

**Épica:** Workflows DAG

## Historia de usuario

Como administrador de un workspace, quiero agregar una salida al borrador para
definir qué resultado devuelve el workflow a la aplicación móvil.

## Interfaz

En `Borrador` → panel `Nodos` → `Salida`, el formulario pide `Nombre de salida` y `Tipo de resultado`. La tarjeta se titula `Salida: <nombre>`. Al guardar muestra `Nodo de salida agregado.`; sin tipo muestra `Selecciona un tipo de resultado para la salida.`

## Happy path

```gherkin
Scenario: Agregar una salida tipada
  Given que soy administrador de un workflow en borrador
  When agrego un nodo de salida compatible con un resultado del DAG
  Then el sistema añade el nodo de salida al borrador
```

## Bad path

```gherkin
Scenario: Agregar una salida sin tipo compatible
  Given que soy administrador de un workflow en borrador
  When intento agregar una salida sin especificar un tipo admitido
  Then el sistema rechaza la operación
  And no añade el nodo
```

## Criterios de aceptación

- El nodo de salida declara el tipo de resultado que devuelve el workflow.
- El workflow puede tener salidas para éxito y error de negocio.
- El nodo no puede contener código ejecutable.
