# US-080 — Revisar una evidencia de dataset

**Épica:** Gestión y exportación de datasets

## Historia de usuario

Como miembro de un workspace, quiero aprobar o rechazar una evidencia para controlar la calidad del dataset.

## Interfaz

En el detalle de evidencia se muestran la imagen, predicción original y estado `Pendiente`. Acciones: `Aprobar` y `Rechazar`; al rechazar pide `Motivo opcional`. Mensajes: `Evidencia aprobada.`, `Evidencia rechazada.` y estado visible `Pendiente`, `Aprobada` o `Rechazada`.

## Happy path

```gherkin
Scenario: Aprobar una evidencia
  Given que pertenezco al workspace de un dataset
  And existe una evidencia pendiente de revisión
  When la marco como aprobada
  Then el sistema registra su estado de aprobación
```

## Bad path

```gherkin
Scenario: Revisar una evidencia ajena
  Given que no pertenezco al workspace de un dataset
  When intento cambiar el estado de una evidencia
  Then el sistema rechaza la operación
  And conserva su estado
```

## Criterios de aceptación

- El estado de revisión distingue pendiente, aprobada y rechazada.
- La revisión conserva quién y cuándo realizó el cambio.
- Una evidencia rechazada no se exporta por defecto.
