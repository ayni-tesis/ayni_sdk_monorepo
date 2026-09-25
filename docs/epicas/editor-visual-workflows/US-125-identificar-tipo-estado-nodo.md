# US-125 — Identificar el tipo y el estado de cada nodo

**Épica:** Editor visual de workflows

## Historia de usuario

Como administrador de un workspace, quiero reconocer de un vistazo el tipo, la
configuración y los errores de cada nodo para corregir el workflow sin abrir
cada uno.

## Interfaz

Cada nodo muestra un icono y un nombre de tipo: `Imagen de entrada`, `Modelo`, `Condición` o `Salida`. Debajo aparece un resumen compacto: el modelo muestra su nombre y, en fuente monoespaciada, su versión; la condición, su regla, por ejemplo `perro ≥ 0,8`; la salida, su nombre y `Tipo de resultado`. Después de `Validar workflow`, cada nodo con errores muestra un borde rojo, un icono de alerta y el número de errores; al pasar el cursor o enfocar el indicador se lee el mensaje, por ejemplo `El nodo "Clasificador" necesita una imagen de entrada.` Los errores que no pertenecen a un nodo, como `El workflow necesita al menos un nodo de salida.`, siguen apareciendo en el panel `Errores de validación`.

## Happy path

```gherkin
Scenario: Ver un error de validación sobre el nodo
  Given que soy administrador de un workflow con un modelo sin imagen de entrada
  When valido el borrador
  Then el nodo del modelo muestra un indicador de error
  And el indicador explica que el nodo necesita una imagen de entrada
```

## Bad path

```gherkin
Scenario: Corregir un nodo con error
  Given que un nodo muestra un indicador de error de validación
  When cambio el borrador
  Then el indicador desaparece hasta la siguiente validación
  And el lienzo no muestra errores de un borrador anterior
```

## Criterios de aceptación

- Cada tipo de nodo se distingue por icono y texto, no solo por color.
- El icono, el tipo y el resumen son visibles para cualquier miembro del workspace; los indicadores de error aparecen tras una validación.
- Los indicadores de error usan los mismos mensajes que el panel `Errores de validación`.
- El lienzo no muestra errores que ya no corresponden al borrador actual.
- Las versiones e identificadores usan fuente monoespaciada; los nombres usan la fuente normal.
