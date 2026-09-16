# US-025 — Listar workflows de una aplicación

**Épica:** Workflows DAG

## Historia de usuario

Como miembro de un workspace, quiero listar los workflows de una aplicación
para elegir cuál deseo consultar o editar.

## Interfaz

Dashboard → Aplicación → `Workflows`. El título es `Workflows`; la tabla muestra `Nombre`, `Estado`, `Última versión` y `Actualizado`. Los administradores ven `Crear workflow`. Los estados son `Cargando workflows…`, `Aún no hay workflows en esta aplicación.` y `No pudimos cargar los workflows. Inténtalo nuevamente.`

## Happy path

```gherkin
Scenario: Aplicación con workflows
  Given que pertenezco al workspace de una aplicación con workflows
  When consulto su lista de workflows
  Then el sistema muestra sus nombres, identificadores y estados
```

```gherkin
Scenario: Aplicación sin workflows
  Given que pertenezco al workspace de una aplicación sin workflows
  When consulto su lista de workflows
  Then el sistema muestra un estado vacío
```

## Bad path

```gherkin
Scenario: Consultar workflows de una aplicación ajena
  Given que no pertenezco al workspace de una aplicación
  When intento listar sus workflows
  Then el sistema rechaza la solicitud
  And no revela si existen workflows
```

## Criterios de aceptación

- La lista solo contiene workflows de la aplicación solicitada.
- Los miembros del workspace pueden consultarla.
- Las solicitudes no autorizadas no revelan workflows ajenos.
