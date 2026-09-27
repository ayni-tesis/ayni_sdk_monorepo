# US-144 — Consultar la referencia de la API HTTP del SDK

**Épica:** Documentación del SDK

## Historia de usuario

Como desarrollador que integra o depura el SDK, quiero una referencia de los
endpoints HTTP que usa el SDK para conocer su autenticación, solicitudes,
respuestas y errores.

## Interfaz

### Ubicación

`Referencia` → `API HTTP del SDK`, generada desde
`packages/api/src/openapi.json`.

### Elementos y texto visible

- Sección `Autenticación`: encabezado `Authorization: Bearer ayni_sk_…`, dónde
  se genera la credencial y qué pasa cuando se revoca.
- Una página por endpoint:
  - `POST /sdk/sync`: manifiesto de workflows y modelos de la aplicación.
  - `GET /sdk/workflow-versions/{workflowVersionId}`: definición inmutable de
    una versión publicada.
  - `GET /sdk/model-versions/{modelVersionId}/manifest`: manifiesto de descarga
    de una versión de modelo.
- En cada página: método y ruta, parámetros, esquema de respuesta, ejemplos de
  respuesta, tabla de errores (`401` con `invalidCredential` o
  `credentialRevoked`, `404` con su código) y ejemplo de solicitud con `curl`.
- Aviso `Nota`: `El SDK llama a estos endpoints por ti. Úsalos directamente solo
  para depurar o para integraciones sin Flutter.`

### Estados y mensajes

- Los ejemplos usan el marcador `ayni_sk_…`; si el sitio ofrece un panel para
  probar solicitudes, advierte `La credencial que escribas aquí se envía al
  servidor indicado.` y no la guarda.

## Happy path

```gherkin
Scenario: Consultar el manifiesto de sincronización
  Given que abro la página de POST /sdk/sync
  When reviso la respuesta 200
  Then veo el esquema con las listas workflows y models y un ejemplo
```

## Bad path

```gherkin
Scenario: Endpoint sin documentar
  Given que un cambio agrega o modifica una ruta /sdk/* sin actualizar la especificación
  When CI ejecuta la verificación de OpenAPI
  Then la verificación falla
  And el cambio no se puede integrar hasta actualizar openapi.json
```

## Criterios de aceptación

- `openapi.json` describe las tres rutas `/sdk/*` con sus esquemas de respuesta
  y de error; hoy solo describe `GET /health`.
- El esquema de seguridad de estas rutas describe una credencial opaca con
  prefijo `ayni_sk_`, no un JWT.
- `openapi:verify` se amplía para detectar rutas `/sdk/*` del servidor que no
  estén en la especificación, y corre en CI.
- La referencia del sitio se genera desde la especificación; no se copian
  esquemas a mano.
- Las rutas internas del dashboard (autenticadas por sesión) quedan fuera; solo
  se documenta el contrato que usa el SDK.
