# US-041 — Descargar una versión de workflow

**Épica:** Sincronización offline

## Historia de usuario

Como SDK, quiero descargar una versión publicada de workflow para poder ejecutarla localmente.

## Interfaz

Durante `sdk.sync()`, la app puede mostrar `Descargando workflow <nombre>…`. Los resultados son `downloaded` o `workflowUnavailable`; este último muestra `El workflow ya no está disponible. Se mantuvo la versión anterior.`

## Happy path

```gherkin
Scenario: Descargar un workflow publicado
  Given que el manifiesto indica una versión nueva de workflow
  When el SDK solicita su definición
  Then recibe el JSON inmutable de esa versión como archivo temporal
```

## Bad path

```gherkin
Scenario: Workflow archivado durante la sincronización
  Given que el SDK detectó una versión nueva de workflow
  When el workflow deja de estar disponible antes de descargarlo
  Then el SDK informa que el recurso ya no está disponible
  And conserva la última versión local válida
```

## Criterios de aceptación

- Solo se descargan versiones publicadas y disponibles para la aplicación.
- El workflow descargado no se ejecuta ni reemplaza la caché antes de validarse.
- Una descarga fallida conserva la versión local válida anterior.
