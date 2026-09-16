# US-037 — Archivar un workflow

**Épica:** Workflows DAG

## Historia de usuario

Como administrador de un workspace, quiero archivar un workflow que ya no uso
para impedir nuevas sincronizaciones sin borrar su historial.

## Interfaz

Dashboard → Workflow → `Acciones` → `Archivar workflow`. El diálogo avisa `El SDK dejará de recibir versiones nuevas de este workflow. El historial se conservará.` y ofrece `Archivar workflow` y `Cancelar`. Después muestra `Workflow archivado.` y la etiqueta `Archivado`; sin permiso, `No tienes permiso para archivar este workflow.`

## Happy path

```gherkin
Scenario: Archivar un workflow activo
  Given que soy administrador de un workflow activo
  When confirmo que deseo archivarlo
  Then el sistema cambia su estado a archivado
  And deja de entregarlo en sincronizaciones futuras
```

## Bad path

```gherkin
Scenario: Miembro sin permisos de administración
  Given que pertenezco al workspace sin permisos de administración
  When intento archivar un workflow
  Then el sistema rechaza la operación
  And el workflow conserva su estado
```

## Criterios de aceptación

- Solo los administradores pueden archivar workflows.
- Archivar conserva el borrador y las versiones publicadas.
- Un workflow archivado no se entrega en nuevas sincronizaciones.
- Las versiones ya almacenadas offline no se retiran retroactivamente.
