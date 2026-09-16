# US-028 — Agregar un nodo de entrada de imagen

**Épica:** Workflows DAG

## Historia de usuario

Como administrador de un workspace, quiero agregar una entrada de imagen al
borrador para que el workflow pueda recibir una imagen desde la aplicación.

## Interfaz

Dashboard → Workflow → pestaña `Borrador`. El panel `Nodos` ofrece `Entrada de imagen`; al arrastrarlo al lienzo, la tarjeta muestra `Imagen de entrada` y el puerto `imagen`. Si ya existe, la opción está deshabilitada con ayuda `Este workflow ya tiene una entrada de imagen.`; el lienzo muestra `Nodo agregado.` tras insertarlo.

## Happy path

```gherkin
Scenario: Agregar una entrada de imagen
  Given que soy administrador de un workflow en borrador
  When agrego un nodo de tipo input.image
  Then el sistema lo añade al DAG con una salida de tipo imagen
```

## Bad path

```gherkin
Scenario: Agregar una segunda entrada de imagen
  Given que el borrador ya contiene una entrada de imagen
  When intento agregar otra entrada de imagen
  Then el sistema rechaza la operación
  And conserva el DAG existente
```

## Criterios de aceptación

- Solo los administradores pueden modificar el borrador.
- Un workflow admite una entrada inicial de imagen en la primera versión.
- El nodo expone una salida tipada como imagen.
