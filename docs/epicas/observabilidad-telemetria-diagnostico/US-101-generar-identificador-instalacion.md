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
- El identificador es un UUID v4 guardado en `storageDirectory/installation-id`; `AyniSdk.initialize()` lo crea si falta y reemplaza un valor local corrupto.
- El identificador agrupa trazas dentro de la aplicación autenticada; no es una clave de deduplicación de trazas.
- No usa IMEI, MAC, identificador publicitario ni otro identificador de hardware.
- El identificador no se envía por sí solo; se incorpora a registros de ejecución únicamente cuando la telemetría está habilitada.
- Se restablece al desinstalar o borrar los datos de la app.

## Criterios para validación técnica

- El UUID se conserva entre reinicios de la app y es el identificador de instalación que agrupa sus trazas.
- La agrupación por instalación se limita a la aplicación autenticada. La idempotencia de trazas usa `(applicationId, traceId)`, no `installationId`.
- Al restablecerlo, las trazas ya creadas conservan el identificador con que se crearon; solo las trazas futuras usan el nuevo UUID.
- Si no se puede persistir durante la inicialización, esta falla sin conservar un SDK parcialmente inicializado.
- `Recursos` → `Datos y privacidad` (US-147) describe, en el mismo cambio, los
  datos que esta historia agrega o cambia, la política que los habilita, el
  consentimiento que resulte aplicable (sin tratar `sdkImprovement` como consentimiento para la validación) y su retención.
