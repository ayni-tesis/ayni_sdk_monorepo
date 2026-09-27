# US-146 — Diagnosticar un error de sincronización

**Épica:** Documentación del SDK

## Historia de usuario

Como desarrollador Flutter, quiero una referencia de estados y errores y una
guía de solución de problemas para saber por qué falló una sincronización y
cómo corregirla.

## Interfaz

### Ubicación

- `Referencia` → `Estados y errores`.
- `Guías` → `Solucionar problemas de sincronización`.

### Elementos y texto visible

- `Estados y errores`:
  - Tabla de `SyncStatus` (`updated`, `upToDate`, `offline`, `error`): qué
    significa cada uno y qué debería mostrar la app.
  - Tabla de `SyncResourceStatus` con el texto exacto de `message` para cada
    caso y si se conservó la versión anterior.
  - Tabla de códigos HTTP del servidor (`invalidCredential`,
    `credentialRevoked`, `workflowVersionNotFound`, `modelVersionNotFound`)
    con el síntoma que ve la app.
- `Solucionar problemas de sincronización`: una entrada por síntoma, con el
  formato `Síntoma`, `Causas probables` y `Cómo resolverlo`. Por ejemplo:
  `sync() devuelve error en cada intento` (credencial revocada o mal copiada,
  URL insegura, tiempo agotado) y `sync() devuelve offline`.

### Estados y mensajes

- Aviso `Nota`: `El SDK no expone el código HTTP a la app: ante una credencial
  revocada devuelve SyncStatus.error.`

## Happy path

```gherkin
Scenario: Resolver una credencial revocada
  Given que sync() devuelve SyncStatus.error en cada intento
  When sigo la entrada "sync() devuelve error en cada intento"
  Then compruebo en el dashboard si la credencial está revocada
  And genero una nueva credencial y la sincronización vuelve a funcionar
```

## Bad path

```gherkin
Scenario: Síntoma no documentado
  Given que mi síntoma no aparece en la guía
  When llego al final de la página
  Then encuentro cómo reportar el problema con los datos que debo incluir
  And la página me recuerda no compartir la credencial
```

## Criterios de aceptación

- Cada valor de `SyncStatus` y `SyncResourceStatus` de la versión documentada
  aparece en la referencia; una prueba compara la lista con los enums del SDK
  (US-150).
- Los textos de `message` se citan tal como los devuelve
  `SyncResourceResult.message`.
- La guía describe el síntoma que ve la app, no un código interno que la app no
  recibe.
- Cuando US-061 agregue errores de ejecución, se incorporan a esta referencia en
  el mismo cambio.
