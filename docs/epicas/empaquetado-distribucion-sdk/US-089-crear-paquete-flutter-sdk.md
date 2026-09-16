# US-089 — Crear el paquete Flutter del SDK

**Épica:** Empaquetado y distribución del SDK

## Historia de usuario

Como equipo de desarrollo, quiero crear un paquete Flutter independiente para distribuir el SDK sin copiar su código en cada aplicación.

## Interfaz

Artefacto de desarrollo: paquete `ayni_sdk` con README y librería pública. La consola muestra `Paquete ayni_sdk creado.` o `El paquete no puede incluir configuración específica de una aplicación.`

## Happy path

```gherkin
Scenario: Crear el paquete
  Given que el repositorio contiene la implementación del SDK
  When se crea el paquete ayni_sdk
  Then tiene su propio pubspec, librería pública y pruebas
```

## Bad path

```gherkin
Scenario: Empaquetar código dependiente de una app concreta
  Given que el SDK se está preparando como paquete
  When una dependencia requiere configuración de una aplicación específica
  Then el proceso rechaza esa dependencia
  And el paquete mantiene una configuración genérica
```

## Criterios de aceptación

- El SDK se consume como paquete Flutter/Dart.
- El paquete no contiene secretos ni configuración de una aplicación concreta.
- El paquete se compila sin depender del dashboard en tiempo de compilación.
