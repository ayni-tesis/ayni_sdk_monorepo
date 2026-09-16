# US-049 — Inicializar el SDK

**Épica:** Ejecución local del SDK

## Historia de usuario

Como desarrollador Flutter, quiero inicializar el SDK con la configuración de mi aplicación para sincronizar y ejecutar workflows.

## Interfaz

API: `AyniSdk.initialize(config)`. Éxito: `SDK listo.`; configuración incompleta: `Revisa la configuración del SDK antes de continuar.` El resultado nunca contiene la credencial.

## Happy path

```gherkin
Scenario: Inicialización válida
  Given que la app proporciona una credencial y configuración válidas
  When inicializa AyniSdk
  Then el SDK queda listo para sincronizar y ejecutar recursos locales
```

## Bad path

```gherkin
Scenario: Configuración incompleta
  Given que falta un dato obligatorio de configuración
  When la app inicializa el SDK
  Then el SDK devuelve un error de configuración
  And no inicia operaciones de red ni inferencia
```

## Criterios de aceptación

- La inicialización valida la configuración obligatoria.
- El SDK no expone la credencial en errores o registros.
- Una inicialización fallida no deja un SDK parcialmente operativo.
