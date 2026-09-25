# US-128 — Agregar un nodo conectado desde un puerto de salida

**Épica:** Editor visual de workflows

## Historia de usuario

Como administrador de un workspace, quiero agregar el siguiente paso del flujo
directamente desde un puerto de salida para que el nodo nuevo quede conectado
y ubicado sin pasos adicionales.

## Interfaz

Cada puerto de salida sin conexiones muestra un botón `+` con el nombre accesible `Agregar nodo después de <puerto>`. Al pulsarlo, o al soltar una conexión en un espacio vacío del lienzo, se abre el panel `Agregar nodo` filtrado a los tipos que aceptan ese puerto: después de `imagen`, modelos; después de `Resultado` de clasificación, condiciones y salidas de clasificación; después de `Resultado` de detección, salidas de detección; después de `Verdadero` o `Falso`, salidas booleanas. El puerto elegido queda como origen del nodo nuevo, por ejemplo como `Resultado de origen` de una condición; si el tipo necesita más datos, como la `Etiqueta` de una condición o el `Nombre de salida`, el panel los pide antes de agregarlo, y el `Tipo de resultado` de una salida se deduce del puerto. El nodo se ubica a la derecha del nodo origen sin superponerse y queda conectado. Muestra `Nodo agregado y conectado.`; si falla, `No pudimos agregar el nodo.` y el lienzo no cambia. Si ningún tipo es compatible muestra `No hay nodos compatibles con esta salida.`

## Happy path

```gherkin
Scenario: Agregar una salida después de una rama de condición
  Given que soy administrador de un workflow en borrador con una condición
  When pulso + en su puerto Verdadero y elijo una salida booleana
  Then el sistema agrega la salida conectada a la rama Verdadero
  And la ubica a la derecha de la condición
```

## Bad path

```gherkin
Scenario: Falla al agregar el nodo conectado
  Given que soy administrador de un workflow en borrador
  When elijo un tipo desde un puerto de salida y el sistema no puede guardarlo
  Then el sistema no agrega el nodo ni la conexión
  And conserva el DAG sin cambios
```

## Criterios de aceptación

- Solo los administradores pueden agregar nodos desde un puerto.
- El nodo y su conexión se guardan juntos o no se guarda ninguno.
- El panel ofrece solo tipos compatibles con el puerto de origen, con las reglas de compatibilidad del DAG.
- El nodo nuevo se ubica a la derecha del nodo origen; si ese lugar está ocupado, baja hasta el primer espacio libre, sin superponerse a nodos existentes.
