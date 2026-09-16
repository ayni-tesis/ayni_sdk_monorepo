# US-076 — Listar datasets de una aplicación

**Épica:** Gestión y exportación de datasets

## Historia de usuario

Como miembro de un workspace, quiero listar los datasets de una aplicación para elegir cuál revisar o exportar.

## Interfaz

Dashboard → Aplicación → `Datasets`. Tabla `Nombre`, `Tipo`, `Evidencias`, `Aprobadas` y `Actualizado`; administradores ven `Crear dataset`. Estados: `Cargando datasets…`, `Aún no hay datasets en esta aplicación.` y `No pudimos cargar los datasets.`

## Happy path

```gherkin
Scenario: Aplicación con datasets
  Given que pertenezco al workspace de una aplicación con datasets
  When consulto la lista
  Then el sistema muestra nombre, identificador y cantidad de evidencias de cada dataset
```

## Bad path

```gherkin
Scenario: Consultar datasets de otra aplicación
  Given que no pertenezco al workspace de una aplicación
  When intento consultar sus datasets
  Then el sistema rechaza la solicitud
  And no revela si existen datasets
```

## Criterios de aceptación

- Solo se listan datasets de la aplicación solicitada.
- Un workspace sin datasets recibe un estado vacío.
- Las solicitudes no autorizadas no revelan datasets ajenos.
