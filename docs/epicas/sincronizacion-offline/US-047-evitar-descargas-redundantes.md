# US-047 — Evitar descargas redundantes

**Épica:** Sincronización offline

## Historia de usuario

Como SDK, quiero omitir recursos cuya versión y hash ya están disponibles localmente para reducir datos y tiempo de sincronización.

## Interfaz

La respuesta muestra `upToDate` para recursos coincidentes. Si detecta inconsistencia, devuelve `invalidRemoteResource` con `La actualización no coincide con la versión instalada; se conservará la copia local.`

## Happy path

```gherkin
Scenario: Recurso local idéntico al manifiesto
  Given que el dispositivo tiene un recurso con la misma versión y hash del manifiesto
  When el SDK sincroniza
  Then no descarga el recurso nuevamente
  And lo mantiene disponible localmente
```

## Bad path

```gherkin
Scenario: Misma versión con hash diferente
  Given que el manifiesto declara el mismo identificador de versión con un hash diferente
  When el SDK sincroniza
  Then rechaza el recurso como inconsistente
  And conserva la copia local válida
```

## Criterios de aceptación

- La deduplicación compara versión y hash.
- El SDK no confía únicamente en el nombre del recurso.
- Una inconsistencia remota no sobrescribe la caché local válida.
