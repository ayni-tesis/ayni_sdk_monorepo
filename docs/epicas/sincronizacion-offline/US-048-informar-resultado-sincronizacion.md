# US-048 — Informar el resultado de una sincronización

**Épica:** Sincronización offline

## Historia de usuario

Como desarrollador de una app Flutter, quiero recibir un resultado de sincronización para informar a la app si se actualizó, estaba al día o falló.

## Interfaz

`SyncResult` contiene estado global, recursos instalados y errores por recurso. La interfaz de la app usa `Sincronización completada.`, `Ya estás al día.`, `Sin conexión.` o `No se completó la sincronización. Revisa los recursos afectados.`

## Happy path

```gherkin
Scenario: Sincronización con actualizaciones
  Given que el SDK tiene conexión y recursos actualizados disponibles
  When finaliza una sincronización correcta
  Then devuelve las versiones de workflows y modelos instaladas
```

```gherkin
Scenario: Sincronización sin cambios
  Given que los recursos locales coinciden con el manifiesto
  When finaliza una sincronización
  Then devuelve el estado upToDate
```

## Bad path

```gherkin
Scenario: Sincronización fallida
  Given que una actualización no puede completarse
  When el SDK termina el intento
  Then devuelve un error tipado con el recurso afectado
  And informa que la caché anterior se conserva cuando corresponda
```

## Criterios de aceptación

- El resultado distingue updated, upToDate, offline y error.
- Un error identifica el workflow o modelo afectado sin exponer secretos.
- La app puede decidir su interfaz sin inspeccionar errores internos del SDK.
