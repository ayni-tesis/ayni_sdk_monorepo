# US-079 — Retirar evidencia de un dataset

**Épica:** Gestión y exportación de datasets

## Historia de usuario

Como administrador, quiero retirar una evidencia de un dataset para excluirla de futuras exportaciones sin borrar la evidencia recolectada.

## Interfaz

Cada evidencia del dataset ofrece `Retirar del dataset`. El diálogo dice `La evidencia se conservará, pero no se incluirá en futuras exportaciones.` y botones `Retirar evidencia`/`Cancelar`; éxito `Evidencia retirada del dataset.`

## Happy path

```gherkin
Scenario: Retirar un ítem del dataset
  Given que soy administrador de un dataset con una evidencia incluida
  When retiro esa evidencia
  Then el sistema elimina el ítem del dataset
  And conserva la evidencia recolectada original
```

## Bad path

```gherkin
Scenario: Retirar un ítem inexistente
  Given que soy administrador de un dataset
  When intento retirar una evidencia que no pertenece al dataset
  Then el sistema informa que el ítem no fue encontrado
```

## Criterios de aceptación

- Solo administradores pueden retirar ítems.
- Retirar un ítem no borra la evidencia fuente.
- El ítem retirado no aparece en futuras exportaciones.
