# US-120 — Navegar el lienzo del workflow

**Épica:** Editor visual de workflows

## Historia de usuario

Como miembro de un workspace, quiero acercar, alejar y desplazar el lienzo del
borrador para recorrer workflows grandes sin perder de vista su estructura.

## Interfaz

En `Borrador`, el lienzo ocupa el área principal. Abajo a la izquierda están los controles `Acercar`, `Alejar` y `Ajustar a la vista`, junto al nivel de zoom actual, por ejemplo `100 %`; hacer clic en ese nivel ejecuta `Restablecer zoom` y vuelve al 100 %. Abajo a la derecha, el `Minimapa` muestra todos los nodos y el área visible; al hacer clic en él se centra esa zona. La rueda del mouse con `Ctrl` hace zoom; `Espacio` + arrastre o el botón central desplazan el lienzo. Al abrir el borrador, la vista se ajusta a todos los nodos. Sin nodos muestra el texto actual `Este borrador aún no tiene nodos.`, y solo a los administradores la ayuda `Agrega un nodo de entrada de imagen para empezar.`; una persona sin permisos de edición ve el lienzo en modo lectura con los mismos controles.

## Happy path

```gherkin
Scenario: Recorrer un workflow que no cabe en pantalla
  Given que pertenezco al workspace de un workflow con nodos fuera del área visible
  When uso Ajustar a la vista
  Then el lienzo muestra todos los nodos del borrador
  And el nivel de zoom refleja la nueva escala
```

## Bad path

```gherkin
Scenario: Superar el límite de zoom
  Given que el lienzo está en el zoom máximo permitido
  When intento acercar de nuevo
  Then el lienzo conserva el zoom máximo
  And el control Acercar aparece deshabilitado
```

## Criterios de aceptación

- El zoom se limita entre 25 % y 200 %.
- Navegar el lienzo no modifica el borrador ni las posiciones guardadas de los nodos.
- Los miembros sin permisos de administración pueden navegar el lienzo, pero no editarlo.
- Cada control del lienzo tiene un nombre accesible y se puede usar con teclado.
