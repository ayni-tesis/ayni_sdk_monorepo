# US-122 — Conectar nodos arrastrando desde sus puertos

**Épica:** Editor visual de workflows

## Historia de usuario

Como administrador de un workspace, quiero conectar cualquier par de nodos
compatibles arrastrando desde un puerto de salida para construir el DAG sin
llenar formularios.

## Interfaz

Cada nodo muestra sus puertos con etiqueta: las entradas a la izquierda (`Entrada de imagen`, `Origen`) y las salidas a la derecha (`imagen`, `Resultado`, `Verdadero`, `Falso`). Al arrastrar desde una salida aparece una línea de vista previa; los puertos compatibles se resaltan en cian y los incompatibles se atenúan. Al soltar sobre un puerto compatible muestra `Conexión creada.`; si el nodo destino ya tenía un origen, lo reemplaza y muestra `Conexión actualizada.` Si los tipos no encajan muestra `Estos puertos no son compatibles.`; al reasignar el origen se usan los mensajes que ya existen: `Esta condición no es compatible con la salida seleccionada.` para una condición y `El resultado seleccionado no es compatible con la salida.` para una salida. Si ese mismo puerto de salida ya está conectado a ese mismo puerto de entrada, muestra `Estos puertos ya están conectados.` y nada cambia. Soltar sobre el fondo cancela la conexión. Como alternativa sin arrastre, se hace clic en `Salida <puerto>` del nodo origen y luego en `Conectar <entrada> de <nodo>` del destino, igual que hoy con `Salida imagen` y `Conectar entrada de imagen de <nodo>`.

## Happy path

```gherkin
Scenario: Cambiar el origen de una condición
  Given que soy administrador de un workflow en borrador
  And una condición recibe el resultado de un modelo de clasificación
  When arrastro la salida de otro modelo de clasificación compatible hasta la entrada Origen de la condición
  Then el sistema reemplaza el origen de la condición
  And el lienzo dibuja la nueva arista y retira la anterior
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
Scenario: Reasignar una condición a un modelo sin su etiqueta
  Given que soy administrador de un workflow en borrador con una condición sobre la etiqueta "perro"
  When arrastro la salida de un modelo que no produce la etiqueta "perro" hasta la entrada Origen de la condición
  Then el sistema rechaza el cambio
  And la condición conserva su origen anterior
```

## Criterios de aceptación

- Solo los administradores pueden crear o cambiar conexiones del borrador.
- Las reglas de compatibilidad son las del DAG: imagen hacia modelo, resultado de clasificación hacia condición, resultado de un modelo hacia una salida del mismo tipo y rama `Verdadero` o `Falso` hacia una salida booleana.
- Una entrada `Origen` admite un solo origen; conectar otro lo reemplaza.
- Reasignar el origen de una condición exige que el nuevo modelo produzca la etiqueta de la condición; reasignar el de una salida exige un resultado del mismo tipo.
- Toda conexión respeta la regla de DAG acíclico de US-033, considerando también las aristas de condiciones y salidas, aunque los tipos actuales no permitan cerrar un ciclo.
- Rechazar una conexión no altera nodos ni aristas existentes.
