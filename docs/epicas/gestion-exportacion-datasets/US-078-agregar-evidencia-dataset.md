# US-078 — Agregar evidencia a un dataset

**Épica:** Gestión y exportación de datasets

## Historia de usuario

Como administrador, quiero agregar evidencia recolectada a un dataset para prepararla para revisión y entrenamiento.

## Interfaz

En `Dataset` → `Evidencias`, el botón `Agregar evidencia` abre un selector con solo evidencia compatible de la aplicación. Acciones `Agregar seleccionadas`/`Cancelar`; éxito `Evidencia agregada al dataset.`; incompatibilidad `Esta evidencia no coincide con el tipo de tarea del dataset.`

## Happy path

```gherkin
Scenario: Agregar evidencia propia
  Given que soy administrador de un dataset
  And existe evidencia recolectada en la misma aplicación
  When la agrego al dataset
  Then el sistema crea un ítem de dataset con la predicción original
```

## Bad path

```gherkin
Scenario: Agregar evidencia de otra aplicación
  Given que soy administrador de un dataset
  When intento agregar evidencia de otra aplicación
  Then el sistema rechaza la operación
  And no crea el ítem de dataset

```gherkin
Scenario: Agregar evidencia de tipo incompatible
  Given que un dataset es de clasificación
  When intento agregar una evidencia de detección
  Then el sistema rechaza la operación
  And no crea el ítem de dataset
```
```

## Criterios de aceptación

- Un ítem de dataset referencia evidencia de la misma aplicación.
- Agregar evidencia no modifica el archivo original ni su predicción registrada.
- La misma evidencia no se agrega dos veces al mismo dataset.
- El tipo de tarea de la evidencia debe coincidir con el del dataset.
