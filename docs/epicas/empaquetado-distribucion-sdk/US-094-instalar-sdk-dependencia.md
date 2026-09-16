# US-094 — Instalar el SDK como dependencia

**Épica:** Empaquetado y distribución del SDK

## Historia de usuario

Como desarrollador Flutter, quiero agregar ayni_sdk a pubspec.yaml para usarlo como dependencia de mi aplicación.

## Interfaz

La guía muestra `dependencies:` y `flutter pub get`. Éxito: `Dependencias resueltas.`; error: `No se pudo resolver la versión solicitada de ayni_sdk.`

## Happy path

```gherkin
Scenario: Resolver una versión compatible
  Given que declaro una versión compatible de ayni_sdk en pubspec.yaml
  When ejecuto la resolución de dependencias
  Then la aplicación puede importar la API pública del SDK
```

## Bad path

```gherkin
Scenario: Solicitar una versión inexistente
  Given que declaro una versión de ayni_sdk que no está disponible
  When resuelvo dependencias
  Then la herramienta informa que no puede resolver el paquete
  And la aplicación no compila con una dependencia ambigua
```

## Criterios de aceptación

- El paquete se instala mediante los mecanismos estándar de Dart/Flutter.
- La versión solicitada queda registrada en el archivo de dependencias de la app.
- Una versión no resoluble no deja una instalación parcial.
