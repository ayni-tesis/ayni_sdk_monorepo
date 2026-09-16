# US-033 — Impedir ciclos en un workflow DAG

**Épica:** Workflows DAG

## Historia de usuario

Como administrador de un workspace, quiero que el sistema rechace ciclos para
que el workflow siempre tenga un orden de ejecución finito.

## Interfaz

En el lienzo, una conexión que formaría un ciclo se bloquea antes de guardarse. Se muestra el aviso `Esta conexión crearía un ciclo. Los workflows deben ser acíclicos.` y se resaltan los nodos implicados. No se modifica el lienzo ni se habilita la publicación.

## Happy path

```gherkin
Scenario: Conectar nodos sin crear un ciclo
  Given que soy administrador de un workflow en borrador
  When agrego una arista que mantiene el grafo acíclico
  Then el sistema guarda la arista
```

## Bad path

```gherkin
Scenario: Conectar nodos creando un ciclo
  Given que ya existe un camino desde un nodo A hasta un nodo B
  When intento conectar B de regreso a A
  Then el sistema rechaza la arista por crear un ciclo
  And conserva el DAG acíclico existente
```

## Criterios de aceptación

- Todo borrador guardado conserva la propiedad de DAG.
- La validación detecta ciclos directos e indirectos.
- Una arista rechazada no modifica el workflow.
