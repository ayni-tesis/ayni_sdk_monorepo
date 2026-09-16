# US-044 — Sincronizar las dependencias de modelo de un workflow

**Épica:** Sincronización offline

## Historia de usuario

Como SDK, quiero sincronizar las versiones de modelo requeridas por un workflow para dejarlo listo para ejecución offline.

## Interfaz

`sdk.sync()` informa `workflowReady` solo después de instalar todas las dependencias. La app puede mostrar `Descargando modelos para <workflow>…`; si falta uno: `No se pudo preparar <workflow>: falta el modelo <versión>.`

## Happy path

```gherkin
Scenario: Workflow con modelos faltantes
  Given que un workflow validado requiere una versión de modelo no instalada
  When el SDK sincroniza sus dependencias
  Then obtiene su manifiesto, descarga el archivo, verifica su integridad y lo instala
```

## Bad path

```gherkin
Scenario: Una dependencia no puede instalarse
  Given que un workflow validado requiere varias versiones de modelo
  When una de ellas no puede verificarse o instalarse
  Then el SDK informa cuál dependencia falló
  And no marca el workflow como ejecutable con recursos incompletos
```

## Criterios de aceptación

- Cada modelo requerido se sincroniza mediante US-016, US-017 y US-023.
- Un workflow solo está listo offline si todas sus dependencias están disponibles.
- Una dependencia fallida no elimina modelos locales válidos.
