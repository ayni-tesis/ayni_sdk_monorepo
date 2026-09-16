# US-081 — Corregir una etiqueta de clasificación

**Épica:** Gestión y exportación de datasets

## Historia de usuario

Como miembro de un workspace, quiero corregir la etiqueta de clasificación de una evidencia para que el dataset contenga la verdad de terreno.

## Interfaz

En una evidencia de clasificación, el panel `Etiqueta revisada` muestra la predicción original como solo lectura y un selector o campo obligatorio `Etiqueta correcta`. Acciones `Guardar etiqueta`/`Cancelar`; éxito `Etiqueta revisada guardada.`; error `Ingresa una etiqueta para una evidencia aprobada.`

## Happy path

```gherkin
Scenario: Reemplazar la etiqueta predicha
  Given que una evidencia de clasificación pertenece a un dataset
  When asigno una etiqueta válida
  Then el sistema guarda la etiqueta revisada sin alterar la predicción original
```

## Bad path

```gherkin
Scenario: Asignar una etiqueta vacía
  Given que una evidencia de clasificación pertenece a un dataset
  When intento guardar una etiqueta vacía
  Then el sistema rechaza el cambio
  And conserva la etiqueta revisada anterior si existe
```

## Criterios de aceptación

- La etiqueta revisada se diferencia de la predicción del modelo.
- Una etiqueta revisada es obligatoria para exportar clasificación aprobada.
- El historial de predicción original se conserva.
