# US-143 — Consultar la referencia de la API Dart del SDK

**Épica:** Documentación del SDK

## Historia de usuario

Como desarrollador Flutter, quiero una referencia completa de cada clase, método,
propiedad y enum público del SDK para usarlo sin leer su código fuente.

## Interfaz

### Ubicación

`Referencia` → `API del SDK (Dart)`, generada con `dart doc` desde
`packages/sdk_flutter`.

### Elementos y texto visible

- Índice de la librería `ayni_sdk` con clases, enums y funciones públicas.
- Página por símbolo: firma, descripción, parámetros con tipo y valor por
  defecto, valor de retorno, excepciones o estados de error, y un ejemplo
  cuando el uso no es evidente.
- Enums (`SyncStatus`, `SyncResourceStatus`, `SyncResourceType`, entre otros)
  con la descripción de cada valor y cuándo ocurre.
- Encabezado con la versión del paquete documentada, por ejemplo `ayni_sdk
  0.1.0`.

### Estados y mensajes

- Símbolo obsoleto: insignia `Obsoleto` y el reemplazo recomendado.
- Enlace roto a un símbolo: la compilación de la documentación falla (US-150).

## Happy path

```gherkin
Scenario: Consultar un parámetro del cliente
  Given que abro la referencia de AyniSdk
  When busco el parámetro syncTimeout
  Then veo su tipo Duration, su valor por defecto y el resultado cuando se agota
```

## Bad path

```gherkin
Scenario: Símbolo público sin documentar
  Given que un cambio agrega un símbolo público sin comentario ///
  When CI analiza el paquete
  Then el análisis falla por la regla public_member_api_docs
  And el cambio no se puede integrar hasta documentar el símbolo
```

## Criterios de aceptación

- Todos los símbolos exportados por `package:ayni_sdk/ayni_sdk.dart` tienen
  comentarios `///` con descripción, parámetros y resultado.
- `packages/sdk_flutter` habilita la regla `public_member_api_docs` en
  `analysis_options.yaml` y `dart analyze` pasa en CI.
- La referencia se genera con `dart doc` en la compilación del sitio; no se
  escribe a mano.
- La referencia documenta la superficie pública que fije US-090; lo que US-090
  declare interno deja de exportarse o se marca como tal.
- Cuando el paquete se publique en pub.dev (US-096), el sitio enlaza también a
  la referencia de pub.dev para la misma versión.
