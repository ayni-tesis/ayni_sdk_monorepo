# US-040 — Detectar recursos actualizados

**Épica:** Sincronización offline

## Historia de usuario

Como SDK, quiero comparar el manifiesto remoto con el inventario local para descargar solo recursos nuevos o modificados.

## Interfaz

La respuesta de `sdk.sync()` expone por recurso `updated`, `upToDate` o `invalidRemoteResource`. La app puede mostrar `Comprobando actualizaciones…`; un recurso inválido informa `Se mantuvo la versión local porque la actualización no es válida.`

## Happy path

```gherkin
Scenario: Existe una versión nueva
  Given que el dispositivo tiene una versión local de un workflow
  And el manifiesto ofrece una versión más reciente
  When el SDK compara ambos inventarios
  Then marca esa versión como pendiente de descarga
```

## Bad path

```gherkin
Scenario: Manifiesto con una versión inválida
  Given que el manifiesto contiene una versión sin identificador o hash requerido
  When el SDK la procesa
  Then rechaza ese recurso
  And no reemplaza la versión local válida
```

## Criterios de aceptación

- La comparación usa identificador y versión del recurso.
- Los recursos sin cambios no se marcan para descarga.
- Un recurso remoto inválido no invalida el inventario local.
