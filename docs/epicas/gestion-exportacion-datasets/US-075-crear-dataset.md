# US-075 — Crear un dataset

**Épica:** Gestión y exportación de datasets

## Historia de usuario

Como administrador, quiero crear un dataset de clasificación o detección en una
aplicación para organizar evidencias destinadas a revisión y entrenamiento.

## Interfaz

Dashboard → Aplicación → `Datasets` → `Crear dataset`. Campos: `Nombre del dataset` y `Tipo de tarea` con opciones `Clasificación` y `Detección`; acciones `Crear dataset`/`Cancelar`. Mensajes: `Creando dataset…`, `Dataset creado.`, `Ingresa un nombre para el dataset.` y `Selecciona el tipo de tarea.`

## Happy path

```gherkin
Scenario: Crear dataset con nombre válido
  Given que soy administrador de una aplicación activa
  When creo un dataset con un nombre válido y el tipo de tarea clasificación
  Then el sistema crea un dataset vacío de clasificación dentro de esa aplicación
```

## Bad path

```gherkin
Scenario: Crear dataset sin nombre
  Given que soy administrador de una aplicación
  When intento crear un dataset sin nombre
  Then el sistema rechaza la operación
  And no crea el dataset

```gherkin
Scenario: Crear dataset sin tipo de tarea
  Given que soy administrador de una aplicación
  When intento crear un dataset sin seleccionar clasificación o detección
  Then el sistema rechaza la operación
  And no crea el dataset
```
```

## Criterios de aceptación

- Un dataset pertenece a una única aplicación.
- Solo administradores pueden crearlo.
- Un dataset nuevo no contiene evidencias ni exportaciones.
- El tipo de tarea clasificación o detección es obligatorio e inmutable.
