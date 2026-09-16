# US-035 — Validar un borrador de workflow

**Épica:** Workflows DAG

## Historia de usuario

Como administrador de un workspace, quiero validar el borrador antes de
publicarlo para detectar errores de estructura y compatibilidad.

## Interfaz

En el editor existe el botón `Validar workflow`. Mientras revisa: `Validando workflow…`. Si es válido muestra `El workflow está listo para publicarse.`; si no, abre el panel `Errores de validación` con cada `Nodo`, `Puerto` y `Descripción`, por ejemplo `El nodo "Clasificador" necesita una imagen de entrada.`

## Happy path

```gherkin
Scenario: Validar un DAG completo
  Given que un borrador tiene entrada, nodos conectados y salida alcanzable
  When solicito su validación
  Then el sistema confirma que el borrador es publicable
```

## Bad path

```gherkin
Scenario: Validar un DAG con nodo obligatorio desconectado
  Given que un borrador contiene un nodo requerido sin sus entradas conectadas
  When solicito su validación
  Then el sistema informa el nodo y puerto con error
  And marca el borrador como no publicable
```

## Criterios de aceptación

- La validación revisa ciclos, tipos, entradas requeridas y salidas alcanzables.
- La respuesta identifica los nodos y puertos que causan cada error.
- La validación no modifica el borrador.
