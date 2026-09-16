# US-046 — Preservar la caché ante un fallo de actualización

**Épica:** Sincronización offline

## Historia de usuario

Como usuario de una app móvil, quiero conservar la última versión válida si una actualización falla para no perder la ejecución offline.

## Interfaz

La app recibe `previousVersionRetained` y puede mostrar `No se pudo instalar la actualización. Seguirás usando la última versión válida.` No existe una acción para borrar la caché automáticamente ante este fallo.

## Happy path

```gherkin
Scenario: Actualización completada
  Given que existe una versión local válida
  When el SDK descarga, valida e instala una versión nueva correctamente
  Then la nueva versión reemplaza a la anterior como versión disponible
```

## Bad path

```gherkin
Scenario: Actualización fallida
  Given que existe una versión local válida
  When falla la descarga, validación o instalación de una actualización
  Then el SDK conserva la versión local anterior disponible
  And informa el motivo del fallo
```

## Criterios de aceptación

- Una actualización no reemplaza la caché hasta completarse correctamente.
- El SDK conserva la última combinación consistente de workflow y modelos.
- Los archivos temporales fallidos no se consideran recursos disponibles.
