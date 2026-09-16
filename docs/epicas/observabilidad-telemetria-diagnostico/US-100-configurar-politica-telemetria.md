# US-100 — Configurar la política de telemetría

**Épica:** Observabilidad, telemetría y diagnóstico

## Historia de usuario

Como administrador, quiero habilitar y configurar la telemetría de una aplicación para controlar las trazas técnicas que envía el SDK.

## Interfaz

Dashboard → Aplicación → `Privacidad y telemetría`. Interruptor `Permitir telemetría técnica`, selector `Retención` y aviso `La telemetría no incluye imágenes ni entradas crudas.` Botones `Guardar política`/`Cancelar`; éxito `Política de telemetría actualizada.`

## Happy path

```gherkin
Scenario: Habilitar telemetría
  Given que soy administrador de una aplicación activa
  When guardo una política de telemetría válida
  Then el sistema habilita la recolección de eventos técnicos para esa aplicación
```

## Bad path

```gherkin
Scenario: Configurar telemetría sin permisos
  Given que pertenezco al workspace sin permisos de administración
  When intento cambiar la política
  Then el sistema rechaza la operación
  And conserva la política anterior
```

## Criterios de aceptación

- La política pertenece a una aplicación y solo la editan administradores.
- La política define habilitación y retención de telemetría.
- La telemetría no autoriza recolección de imágenes.
