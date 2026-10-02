# US-113 — Restablecer el identificador de instalación

**Épica:** Observabilidad, telemetría y diagnóstico

## Historia de usuario

Como usuario de una app móvil, quiero poder restablecer el identificador de instalación para dejar de vincular mis futuras trazas con las anteriores.

## Happy path

```gherkin
Scenario: Restablecer identificador
  Given que el SDK tiene un identificador de instalación
  When la app solicita restablecerlo
  Then el SDK elimina el identificador anterior y genera uno nuevo
```

## Bad path

```gherkin
Scenario: Restablecer sin almacenamiento disponible
  Given que el SDK no puede guardar un identificador nuevo
  When la app solicita restablecerlo
  Then devuelve un error de almacenamiento
  And no envía trazas con un identificador parcialmente creado
```

## Criterios de aceptación

- El restablecimiento no usa ni revela identificadores de hardware.
- Las trazas futuras usan el nuevo identificador.
- Las trazas ya creadas, incluidas las pendientes de envío, conservan el identificador con el que se generaron; restablecer no las reasigna al UUID nuevo.
- Restablecer no elimina workflows ni modelos locales.
- `Recursos` → `Datos y privacidad` (US-147) describe, en el mismo cambio, los
  datos que esta historia agrega o cambia, la política que los habilita, el
  consentimiento que resulte aplicable (sin tratar `sdkImprovement` como consentimiento para la validación) y su retención.

## Criterios para validación técnica

- El nuevo UUID se genera y persiste antes de considerarse exitoso el restablecimiento; si falla el almacenamiento, no se envían trazas con un identificador parcial.
- La nueva identidad solo se aplica a trazas creadas después del restablecimiento y no permite vincularlas con las anteriores mediante el identificador de instalación.
