# US-082 — Corregir anotaciones de detección

**Épica:** Gestión y exportación de datasets

## Historia de usuario

Como miembro de un workspace, quiero corregir etiquetas y cajas de detección para exportar ejemplos de detección confiables.

## Interfaz

El detalle de detección muestra la imagen con cajas editables. El panel `Anotaciones revisadas` permite `Agregar caja`, editar `Etiqueta` y eliminar caja; botón `Guardar anotaciones`. Error de límites: `La caja debe permanecer dentro de la imagen.`; éxito `Anotaciones revisadas guardadas.`

## Happy path

```gherkin
Scenario: Corregir una caja de detección
  Given que una evidencia de detección pertenece a un dataset
  When guardo una etiqueta y una caja dentro de los límites de la imagen
  Then el sistema registra la anotación revisada
```

## Bad path

```gherkin
Scenario: Guardar una caja fuera de la imagen
  Given que una evidencia de detección pertenece a un dataset
  When intento guardar una caja fuera de sus límites
  Then el sistema rechaza la anotación
  And conserva la anotación anterior
```

## Criterios de aceptación

- Una anotación incluye etiqueta y caja válida.
- Las cajas se validan contra las dimensiones de la imagen.
- Las anotaciones revisadas no reemplazan la predicción original.
