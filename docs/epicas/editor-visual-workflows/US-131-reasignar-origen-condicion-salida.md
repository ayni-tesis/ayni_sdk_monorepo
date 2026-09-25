# US-131 — Reasignar el origen de una condición o una salida

**Épica:** Editor visual de workflows

## Historia de usuario

Como administrador de un workspace, quiero cambiar de qué nodo recibe su
resultado una condición o una salida para corregir el flujo sin eliminar el
nodo y volver a crearlo.

## Interfaz

La entrada `Origen` de una condición o una salida siempre tiene una arista. Para cambiarla, la persona arrastra otra salida compatible (`Resultado`, `Verdadero` o `Falso`) hasta esa entrada, o arrastra el extremo de la arista actual hasta otra salida compatible. Al soltar, la arista anterior se reemplaza y muestra `Conexión actualizada.`; mientras guarda, la arista nueva aparece punteada. Si el origen no es compatible se usan los mensajes que ya existen: `Esta condición no es compatible con la salida seleccionada.` para una condición y `El resultado seleccionado no es compatible con la salida.` para una salida. Si falla por otro motivo muestra `No pudimos actualizar la conexión.` Ante cualquier error, la arista anterior vuelve a su lugar.

## Happy path

```gherkin
Scenario: Cambiar el origen de una condición
  Given que soy administrador de un workflow en borrador
  And una condición sobre la etiqueta "perro" recibe el resultado de un modelo de clasificación
  When arrastro la salida Resultado de otro modelo que también produce la etiqueta "perro" hasta la entrada Origen de la condición
  Then el sistema reemplaza el origen de la condición
  And el lienzo dibuja la nueva arista y retira la anterior
```

## Bad path

```gherkin
Scenario: Reasignar una condición a un modelo sin su etiqueta
  Given que soy administrador de un workflow en borrador con una condición sobre la etiqueta "perro"
  When arrastro la salida de un modelo que no produce la etiqueta "perro" hasta la entrada Origen de la condición
  Then el sistema rechaza el cambio
  And la condición conserva su origen anterior
```

```gherkin
Scenario: Reasignar una salida a un resultado de otro tipo
  Given que soy administrador de un workflow en borrador con una salida de clasificación
  When arrastro la salida Resultado de un modelo de detección hasta su entrada Origen
  Then el sistema rechaza el cambio
  And la salida conserva su origen anterior
```

## Criterios de aceptación

- Solo los administradores pueden reasignar el origen de un nodo.
- Una entrada `Origen` admite exactamente un origen; reasignarlo reemplaza el anterior en una sola operación.
- Reasignar el origen de una condición exige un modelo de clasificación que produzca su etiqueta; reasignar el de una salida exige un resultado del mismo tipo que su `Tipo de resultado`, o una rama `Verdadero` o `Falso` si la salida es booleana.
- La reasignación respeta la regla de DAG acíclico de US-033, considerando todas las aristas del borrador.
- Reasignar el origen conserva el identificador, la configuración y la posición del nodo.
- Reasignar el origen no altera las versiones publicadas.
