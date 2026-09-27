# US-148 — Consultar las notas de versión y la compatibilidad

**Épica:** Documentación del SDK

## Historia de usuario

Como desarrollador Flutter, quiero consultar qué cambió en cada versión del SDK y
con qué versiones del servidor y de los workflows es compatible para decidir
cuándo y cómo actualizar.

## Interfaz

### Ubicación

`Recursos` → `Notas de versión y compatibilidad`.

### Elementos y texto visible

- Lista de versiones de la más reciente a la más antigua. Cada versión muestra
  el número SemVer, la fecha, la insignia `Prerelease` o `Estable` y las
  secciones `Novedades`, `Correcciones`, `Cambios incompatibles` y `Cómo
  migrar`.
- Tabla `Compatibilidad`: versión del SDK, versión mínima del servidor, versión
  del esquema de workflow y tipos de nodo admitidos.
- Aviso `Advertencia` en cada versión con cambios incompatibles.

### Estados y mensajes

- Sin versiones publicadas: `Aún no hay versiones publicadas. El SDK se instala
  desde el repositorio.`

## Happy path

```gherkin
Scenario: Revisar una actualización
  Given que uso una versión anterior del SDK
  When consulto las notas de versión
  Then veo los cambios desde mi versión, los cambios incompatibles y cómo migrar
```

## Bad path

```gherkin
Scenario: Workflow que requiere un SDK más nuevo
  Given que un workflow usa un tipo de nodo que mi versión del SDK no admite
  When consulto la tabla de compatibilidad
  Then identifico la versión mínima del SDK que lo admite
```

## Criterios de aceptación

- Cada versión publicada (US-096, US-097) tiene su entrada antes de anunciarse.
- Las notas salen de un `CHANGELOG.md` versionado en `packages/sdk_flutter`, que
  también usa pub.dev; el sitio no mantiene una copia aparte.
- La tabla de compatibilidad usa la regla que define US-098.
- Los cambios incompatibles siempre incluyen instrucciones de migración.
