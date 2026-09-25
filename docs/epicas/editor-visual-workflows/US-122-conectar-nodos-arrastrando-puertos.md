# US-122 — Conectar nodos arrastrando desde sus puertos

**Épica:** Editor visual de workflows

## Historia de usuario

Como administrador de un workspace, quiero conectar nodos compatibles
arrastrando desde un puerto de salida para construir el DAG directamente en el
lienzo.

## Interfaz

Cada nodo muestra sus puertos con etiqueta: las entradas a la izquierda (`Entrada de imagen`, `Origen`) y las salidas a la derecha (`imagen`, `Resultado`, `Verdadero`, `Falso`). Al arrastrar desde una salida aparece una línea de vista previa; los puertos compatibles se resaltan en cian y los incompatibles se atenúan. Al soltar la salida `imagen` sobre la `Entrada de imagen` de un modelo muestra `Conexión creada.`; si falla, `No pudimos crear la conexión.` Si los tipos no encajan muestra `Estos puertos no son compatibles.`; si esa misma conexión ya existe, `Estos puertos ya están conectados.` y nada cambia. Soltar sobre el fondo abre `Agregar nodo` filtrado a los tipos compatibles (US-128); `Esc` cancela la conexión en curso. Soltar sobre la entrada `Origen` de una condición o una salida reasigna su origen, como describe US-131. Como alternativa sin arrastre, se hace clic en `Salida <puerto>` del nodo origen y luego en `Conectar <entrada> de <nodo>` del destino. Hoy esa alternativa existe solo para imagen → modelo (`Salida imagen` y `Conectar entrada de imagen de <nodo>`) y se extiende a todos los puertos.

## Happy path

```gherkin
Scenario: Conectar la imagen con un modelo arrastrando
  Given que soy administrador de un workflow en borrador con una entrada de imagen y un modelo sin conectar
  When arrastro la salida imagen hasta la Entrada de imagen del modelo
  Then el sistema guarda la conexión en el DAG
  And el lienzo dibuja la arista entre ambos puertos
```

## Bad path

```gherkin
Scenario: Conectar puertos incompatibles
  Given que soy administrador de un workflow en borrador
  When suelto una conexión sobre un puerto de un tipo incompatible
  Then el sistema rechaza la conexión
  And conserva el DAG sin cambios
```

```gherkin
Scenario: Miembro sin permisos de administración
  Given que pertenezco al workspace sin permisos de administración
  When intento arrastrar desde un puerto de salida
  Then el lienzo no inicia la conexión
  And conserva el DAG
```

## Criterios de aceptación

- Solo los administradores pueden crear conexiones en el borrador.
- El resaltado durante el arrastre usa las reglas de compatibilidad del DAG; las conexiones entre puertos son imagen hacia modelo, y las reglas de la entrada `Origen` las define US-131.
- La `Entrada de imagen` de un modelo admite una sola conexión.
- Toda conexión respeta la regla de DAG acíclico de US-033.
- Rechazar una conexión no altera nodos ni aristas existentes.
- Durante el arrastre, cada puerto indica si es compatible con resaltado y con una etiqueta o icono, no solo con color.
