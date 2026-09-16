# US-051 — Validar una entrada de imagen

**Épica:** Ejecución local del SDK

## Historia de usuario

Como SDK, quiero validar la imagen recibida antes de procesarla para evitar ejecutar un workflow con una entrada incompatible.

## Interfaz

`sdk.run` valida `input.image`; ante fallo devuelve `invalidInput`. Texto de app: `Selecciona o captura una imagen válida para continuar.` No inicia el indicador de inferencia.

## Happy path

```gherkin
Scenario: Imagen válida
  Given que un workflow espera una entrada de imagen
  When la app proporciona una imagen compatible
  Then el SDK la acepta como entrada del nodo inicial
```

## Bad path

```gherkin
Scenario: Entrada ausente o no compatible
  Given que un workflow espera una imagen
  When la app proporciona una entrada nula o de otro tipo
  Then el SDK devuelve invalidInput
  And no carga modelos ni ejecuta nodos
```

## Criterios de aceptación

- La entrada se valida contra el contrato del nodo inicial.
- Una entrada inválida no inicia inferencia.
- El error identifica la entrada requerida sin exponer datos de la imagen.
