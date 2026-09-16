# US-038 — Iniciar una sincronización

**Épica:** Sincronización offline

## Historia de usuario

Como desarrollador de una app Flutter, quiero solicitar una sincronización del SDK para actualizar los recursos de mi aplicación cuando haya conexión.

## Interfaz

API: `sdk.sync()`. La app recibe `updated`, `upToDate`, `offline` o `error`; puede mostrar `Sincronizando recursos…`, `Recursos actualizados.`, `Ya tienes la última versión.` o `No hay conexión. Se usará la última versión disponible.` No se expone la credencial.

## Happy path

```gherkin
Scenario: Iniciar sincronización con conexión
  Given que el SDK tiene una credencial activa y conexión a internet
  When la app solicita una sincronización
  Then el SDK consulta los recursos disponibles para su aplicación
```

## Bad path

```gherkin
Scenario: Iniciar sincronización sin conexión
  Given que el dispositivo no tiene conexión
  When la app solicita una sincronización
  Then el SDK devuelve el estado offline
  And conserva los recursos locales válidos
```

## Criterios de aceptación

- La sincronización requiere una credencial SDK activa.
- La llamada no elimina recursos locales válidos al fallar.
- El resultado informa si hubo actualización, si ya estaba al día o si falló.
