# US-057 — Ordenar la ejecución de un DAG

**Épica:** Ejecución local del SDK

## Historia de usuario

Como SDK, quiero determinar un orden válido para los nodos del DAG para ejecutar cada nodo después de sus dependencias.

## Interfaz

Operación interna previa a `sdk.run`. Si el recurso local es inconsistente, devuelve `invalidWorkflow`; la app muestra `El workflow guardado no es válido. Sincroniza nuevamente.`

## Happy path

```gherkin
Scenario: DAG con dependencias válidas
  Given que un workflow local es un DAG validado
  When el SDK prepara su ejecución
  Then ordena los nodos de modo que cada dependencia se resuelva antes de su consumidor
```

## Bad path

```gherkin
Scenario: DAG local inconsistente
  Given que un workflow local no puede ordenarse de forma acíclica
  When el SDK prepara su ejecución
  Then devuelve invalidWorkflow
  And no ejecuta ningún nodo
```

## Criterios de aceptación

- El orden respeta todas las aristas del DAG.
- El SDK vuelve a validar la estructura antes de ejecutar.
- Un DAG inconsistente no produce resultados parciales.
