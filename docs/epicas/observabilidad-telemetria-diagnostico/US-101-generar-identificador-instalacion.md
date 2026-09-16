# US-101 — Generar un identificador de instalación

**Épica:** Observabilidad, telemetría y diagnóstico

## Historia de usuario

Como SDK, quiero generar un identificador único por instalación para relacionar sus trazas sin usar identificadores de hardware.

## Interfaz

Operación interna. La app no muestra el UUID; en configuración puede ofrecer `Restablecer identificador de diagnóstico` con explicación `Las trazas futuras no se vincularán con las anteriores.`

## Happy path

```gherkin
Scenario: Primera inicialización
  Given que la app no tiene un identificador de instalación
  When inicializa el SDK
  Then el SDK genera y guarda un UUID de instalación
```

## Bad path

```gherkin
Scenario: Identificador local inválido
  Given que el identificador local está dañado o no es válido
  When inicializa el SDK
  Then genera un identificador nuevo
  And no envía el identificador inválido
```

## Criterios de aceptación

- El identificador es único por instalación y generado localmente.
- El servidor lo trata como único dentro de la aplicación al registrar trazas.
- No usa IMEI, MAC, identificador publicitario ni otro identificador de hardware.
- Se restablece al desinstalar o borrar los datos de la app.
