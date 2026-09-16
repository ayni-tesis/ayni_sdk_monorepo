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
- Restablecer no elimina workflows ni modelos locales.
