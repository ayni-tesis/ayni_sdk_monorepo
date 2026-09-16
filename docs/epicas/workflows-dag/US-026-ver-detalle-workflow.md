# US-026 — Ver el detalle de un workflow

**Épica:** Workflows DAG

## Historia de usuario

Como miembro de un workspace, quiero ver el detalle de un workflow para
comprender su borrador, estado y versiones publicadas.

## Interfaz

Dashboard → Workflows → selección de workflow. La ruta visible es `Workflows / <nombre>`; el encabezado muestra nombre, ID y estado. Las pestañas son `Borrador` y `Versiones publicadas`. Mientras carga muestra `Cargando workflow…`; ante inexistencia o falta de acceso muestra `No encontramos este workflow.`

## Happy path

```gherkin
Scenario: Consultar un workflow propio
  Given que pertenezco al workspace de un workflow
  When abro su detalle
  Then el sistema muestra su nombre, estado, borrador y versiones publicadas
```

## Bad path

```gherkin
Scenario: Consultar un workflow ajeno
  Given que no pertenezco al workspace de un workflow
  When intento abrir su detalle
  Then el sistema rechaza la solicitud
  And no revela su configuración
```

## Criterios de aceptación

- El detalle pertenece a una única aplicación.
- El borrador se distingue de las versiones publicadas.
- El detalle no es accesible fuera del workspace propietario.
