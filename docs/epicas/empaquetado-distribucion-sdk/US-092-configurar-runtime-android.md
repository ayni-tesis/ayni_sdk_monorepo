# US-092 — Configurar el runtime en Android

**Épica:** Empaquetado y distribución del SDK

## Historia de usuario

Como desarrollador Flutter, quiero que el paquete configure las dependencias necesarias en Android para ejecutar modelos TensorFlow Lite.

## Interfaz

La guía contiene `Configuración Android`; compilación correcta indica `Runtime Android listo.` y fallo de versión `Este dispositivo Android no cumple el requisito mínimo del SDK.`

## Happy path

```gherkin
Scenario: Compilar una app Android compatible
  Given que una app declara ayni_sdk
  When compila para una versión Android compatible
  Then el runtime TensorFlow Lite queda disponible para el SDK
```

## Bad path

```gherkin
Scenario: Dispositivo Android no compatible
  Given que la app se ejecuta en una versión Android inferior al mínimo admitido
  When intenta iniciar el runtime
  Then el SDK informa unsupportedPlatform
  And no ejecuta inferencias
```

## Criterios de aceptación

- El paquete declara las dependencias Android que requiere el runtime.
- Una versión Android no compatible falla antes de ejecutar un modelo.
- La configuración no requiere modificar el código del workflow.
