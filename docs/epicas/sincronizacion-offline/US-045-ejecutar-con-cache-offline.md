# US-045 — Usar la caché local sin conexión

**Épica:** Sincronización offline

## Historia de usuario

Como usuario de una app móvil, quiero que la app use el último workflow válido y sus modelos locales cuando no hay internet.

## Interfaz

Antes de ejecutar, `sdk.run()` puede devolver `usingOfflineCache`; la app muestra `Usando recursos guardados en este dispositivo.` Si faltan recursos, muestra `Este workflow necesita una sincronización antes de poder ejecutarse.`

## Happy path

```gherkin
Scenario: Ejecutar sin conexión con recursos disponibles
  Given que el dispositivo no tiene conexión
  And existe un workflow local válido con todos sus modelos instalados
  When la app solicita ejecutarlo
  Then el SDK lo ejecuta sin solicitar recursos remotos
```

## Bad path

```gherkin
Scenario: Ejecutar sin conexión sin recursos locales
  Given que el dispositivo no tiene conexión
  And el workflow o una dependencia no está disponible localmente
  When la app solicita ejecutarlo
  Then el SDK devuelve workflowNotAvailable o modelNotAvailable
  And no inicia una inferencia parcial
```

## Criterios de aceptación

- La ejecución offline no depende de la red cuando los recursos existen localmente.
- La caché solo contiene versiones previamente validadas.
- Un recurso faltante produce un error tipado y no un resultado parcial.
