# US-091 — Declarar plataformas compatibles del SDK

**Épica:** Empaquetado y distribución del SDK

## Historia de usuario

Como desarrollador Flutter, quiero conocer las plataformas y versiones mínimas compatibles antes de integrar el SDK.

## Interfaz

README y metadatos muestran `Plataformas compatibles: Android e iOS` y sus mínimos. En plataforma no admitida: `Esta plataforma no es compatible con ayni_sdk.`

## Happy path

```gherkin
Scenario: Consultar compatibilidad del paquete
  Given que deseo instalar ayni_sdk
  When reviso sus metadatos y documentación
  Then encuentro las plataformas Android e iOS y sus requisitos mínimos
```

## Bad path

```gherkin
Scenario: Ejecutar en una plataforma no compatible
  Given que una app intenta ejecutar el SDK en una plataforma no soportada
  When inicializa el runtime
  Then el SDK devuelve unsupportedPlatform
  And no intenta cargar un modelo
```

## Criterios de aceptación

- El paquete declara explícitamente sus plataformas soportadas.
- El SDK falla con un error claro en plataformas no compatibles.
- Los requisitos del runtime se documentan junto con la versión del paquete.
