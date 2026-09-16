# US-093 — Configurar el runtime en iOS

**Épica:** Empaquetado y distribución del SDK

## Historia de usuario

Como desarrollador Flutter, quiero que el paquete configure las dependencias necesarias en iOS para ejecutar modelos TensorFlow Lite.

## Interfaz

La guía contiene `Configuración iOS`; compilación correcta indica `Runtime iOS listo.` y fallo de versión `Este dispositivo iOS no cumple el requisito mínimo del SDK.`

## Happy path

```gherkin
Scenario: Compilar una app iOS compatible
  Given que una app declara ayni_sdk
  When compila para una versión iOS compatible
  Then el runtime TensorFlow Lite queda disponible para el SDK
```

## Bad path

```gherkin
Scenario: Dispositivo iOS no compatible
  Given que la app se ejecuta en una versión iOS inferior al mínimo admitido
  When intenta iniciar el runtime
  Then el SDK informa unsupportedPlatform
  And no ejecuta inferencias
```

## Criterios de aceptación

- El paquete declara las dependencias iOS requeridas por el runtime.
- Una versión iOS no compatible falla antes de ejecutar un modelo.
- La configuración de plataforma se documenta para quien integra el paquete.
