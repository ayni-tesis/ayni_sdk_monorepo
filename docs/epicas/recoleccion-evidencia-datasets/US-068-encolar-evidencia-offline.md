# US-068 — Encolar evidencia offline

**Épica:** Recolección de evidencia para datasets

## Historia de usuario

Como SDK, quiero guardar la evidencia en una cola local para enviarla cuando haya conectividad permitida.

## Interfaz

La app puede presentar `Evidencia pendiente de envío` sin bloquear el resultado. Si falta espacio, evento `evidenceStorageFull` y texto `No se pudo guardar una imagen para el dataset; el análisis se completó normalmente.`

## Happy path

```gherkin
Scenario: Captura sin conexión
  Given que el SDK creó una evidencia local
  And el dispositivo no tiene conexión
  When termina el workflow
  Then el SDK deja la evidencia pendiente en una cola local
```

## Bad path

```gherkin
Scenario: Espacio insuficiente para encolar
  Given que el dispositivo no tiene espacio para guardar evidencia
  When el SDK intenta encolarla
  Then descarta esa evidencia
  And informa un error de almacenamiento sin fallar la inferencia
```

## Criterios de aceptación

- La cola conserva evidencia pendiente de forma local.
- La cola no bloquea la ejecución del workflow.
- Una evidencia no puede marcarse como enviada antes de confirmarse su carga.
