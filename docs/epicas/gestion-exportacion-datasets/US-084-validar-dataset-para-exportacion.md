# US-084 — Validar un dataset para exportación

**Épica:** Gestión y exportación de datasets

## Historia de usuario

Como administrador, quiero validar un dataset antes de exportarlo para evitar generar archivos con evidencias o anotaciones incompletas.

## Interfaz

En `Exportaciones`, `Validar dataset` muestra `Validando dataset…`. Éxito: `El dataset está listo para exportarse.`; error abre `Ítems que requieren revisión` con imagen, causa y enlace `Revisar evidencia`.

## Happy path

```gherkin
Scenario: Dataset listo para exportar
  Given que un dataset contiene evidencias aprobadas con anotaciones válidas
  When solicito su validación
  Then el sistema confirma que puede exportarse
```

## Bad path

```gherkin
Scenario: Dataset con ítem aprobado sin etiqueta
  Given que un dataset contiene una evidencia aprobada sin anotación revisada requerida
  When solicito su validación
  Then el sistema identifica el ítem inválido
  And impide su exportación
```

## Criterios de aceptación

- La validación incluye solo ítems aprobados.
- Verifica etiquetas y cajas según el tipo de tarea.
- La validación no altera el dataset.
