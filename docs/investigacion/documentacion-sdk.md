# Investigación — Documentación del SDK y de la API

Este documento respalda la épica **Documentación del SDK** (US-137 a US-150,
`docs/epicas/documentacion-sdk/`). Estudia dos sitios de referencia, inventaria
lo que hoy se puede documentar en el repositorio, compara herramientas y propone
la estructura del sitio. Decisión del equipo (2026-09-27): el sitio se construye
con Astro y se despliega en Vercel (sección 3); el ADR 0002 la registra al
iniciar US-137.

Fecha de la investigación: 2026-09-27.

## 1. Referencias

### 1.1 Documentación del SDK de Google Cloud

[docs.cloud.google.com/sdk/docs](https://docs.cloud.google.com/sdk/docs?hl=es):

- Navegación lateral en cuatro grupos: `Introducción`, `Guías`, `Referencia`
  y `Recursos`.
- Las guías empiezan por un inicio rápido de instalación, siguen con la
  instalación detallada y una hoja de referencia rápida.
- La referencia cubre configuración, autenticación y tareas por producto.
- En recursos están las notas de versión, el soporte y los tutoriales.
- Cada página tiene migas de pan y selector de idioma, y ofrece tarjetas de
  recursos relacionados.

### 1.2 Documentación de Astro

[docs.astro.build/es/getting-started](https://docs.astro.build/es/getting-started/):

- Barra lateral en cuatro grupos: `Tutorial`, `Guías y recetas`, `Referencia`
  (API, CLI y sintaxis) y `Ecosistema`.
- La portada lleva a instalar con un único comando y ofrece rutas de
  aprendizaje en tarjetas.
- Tiene búsqueda de texto completo, selector de idioma y tema claro, oscuro o
  automático.
- Está construida con Starlight, el tema de documentación de Astro.

### 1.3 Patrón común que se adopta

Ambos sitios separan cuatro tipos de contenido, en la línea del marco Diátaxis:

| Tipo | Pregunta que responde | En Ayni |
| --- | --- | --- |
| Comenzar (tutorial) | ¿Cómo logro mi primer resultado? | Inicio rápido e instalación (US-139, US-140) |
| Guías (tareas) | ¿Cómo hago X? | Preparar una aplicación en el dashboard (US-142), resolver errores (US-146) |
| Conceptos (explicación) | ¿Cómo funciona? | Workspace, aplicación, credencial, workflow DAG, sincronización offline (US-141) |
| Referencia | ¿Cuál es el contrato exacto? | API Dart (US-143), API HTTP (US-144), esquema de workflow (US-145), estados y errores (US-146) |

Recursos (notas de versión, compatibilidad y privacidad) completan el sitio
(US-147, US-148).

Se adoptan de las referencias estos elementos de página: búsqueda, navegación
lateral por grupos, migas de pan, tabla `En esta página`, páginas
anterior y siguiente, bloques de código copiables, avisos (nota, advertencia,
peligro), tema claro u oscuro y enlace `Editar esta página`.

No se adoptan en esta épica:

- **Selector de idioma.** El producto y las historias están en español; mantener
  una traducción duplicaría cada página. Se puede proponer después.
- **Encuesta `¿Te resultó útil?`.** Necesita almacenamiento y moderación de
  respuestas que hoy no existen.
- **Tutoriales en video y comunidad.** No hay contenido ni canal propio.

## 2. Qué se puede documentar hoy

La documentación solo describe comportamiento que existe (regla de la épica).
Estado del código el 2026-09-27:

| Tema | Estado real | Fuente |
| --- | --- | --- |
| Paquete Dart | `ayni_sdk` 0.1.0, `publish_to: none`, Dart `>=3.8.0 <4.0.0`, única dependencia `crypto` | `packages/sdk_flutter/pubspec.yaml` |
| Instalación | No está en pub.dev; se instala como dependencia `path` o `git` hasta US-096 | `pubspec.yaml`, `apps/native/pubspec.yaml` |
| API pública | `AyniSdk` (`serverUrl`, `credential`, `storageDirectory`, `syncTimeout`, `allowInsecureLoopback`, `onProgress`, `onBeforeInventoryPersist`) y `sync()` | `lib/src/ayni_sdk.dart` |
| Resultado | `SyncResult` con `SyncStatus` (`updated`, `upToDate`, `offline`, `error`) y `SyncResourceResult` con `SyncResourceStatus` y `message` en español | `lib/src/ayni_sdk.dart:12-74` |
| Exportaciones | `lib/ayni_sdk.dart` exporta solo el contrato de US-090 (`AyniConfig`, `AyniSdk`, `initialize`/`sync`/`run`, los tipos de inicialización y sincronización, y `WorkflowResult`/`WorkflowError` con sus valores tipados); `WorkflowVersionDownloader`, `ModelArtifactInstaller` y `ModelArtifactIntegrityVerifier` ya no se exportan | `lib/ayni_sdk.dart` |
| Ejecución local | Implementada: `AyniSdk.run(workflowId, imagen)` ejecuta el workflow instalado sin conexión y devuelve `WorkflowResult` con valores tipados; el README la documenta | `lib/src/ayni_sdk.dart`, `packages/sdk_flutter/README.md` |
| Comentarios de documentación | Parciales: algunos campos tienen `///` y la clase `AyniSdk` no | `lib/src/ayni_sdk.dart` |
| README del SDK | Existe e documenta la API pública (`initialize`/`sync`/`run`, `WorkflowResult`/`WorkflowError`) y la regla de no importar archivos `src/`; US-095 sigue abierta para la guía de integración completa (issue #58) | `packages/sdk_flutter/README.md` |
| API HTTP del SDK | `POST /sdk/sync`, `GET /sdk/workflow-versions/:workflowVersionId`, `GET /sdk/model-versions/:modelVersionId/manifest`, con `Authorization: Bearer ayni_sk_…` | `apps/server/src/sdk-sync.ts`, `sdk-workflow-versions.ts`, `sdk-model-versions.ts` |
| Errores HTTP | `401` con `invalidCredential` o `credentialRevoked`; `404` con `workflowVersionNotFound` o `modelVersionNotFound`; cuerpo `{ message, code }` | mismos archivos |
| Descarga de modelos | El archivo `.tflite` se descarga de `downloadUrl`, una URL firmada del almacenamiento de objetos (R2), sin la credencial | `lib/src/model_artifact_downloader.dart:109`, `apps/server/src/model-version-storage.ts` |
| OpenAPI | `packages/api/src/openapi.json` solo describe `GET /health`; el servidor publica `/openapi.json` y Scalar en `/docs` | `packages/api/src/index.ts`, `apps/server/src/hono-app.ts:692-699` |
| Esquema de workflow | Nodos `input.image`, `model.tflite`, `condition`, `output`; definición `{ nodes, connections }` | `lib/src/workflow_definition_validator.dart:38-43` |
| Glosario | Términos del dominio y términos a evitar, en inglés; faltan entradas para la versión publicada de un workflow y para la sincronización offline | `CONTEXT.md` |

### Brechas que la documentación deja al descubierto

| Brecha | Detalle | HU |
| --- | --- | --- |
| Especificación OpenAPI incompleta | Las tres rutas `/sdk/*` no están en `openapi.json`; la referencia HTTP no puede generarse sin ellas. `verify-openapi.ts` (script `openapi:verify` de `packages/api`) compara el documento generado con el versionado, pero `.github/workflows/ci.yml` no lo ejecuta | US-144 |
| Esquema de seguridad | `securitySchemes.bearerAuth` declara `bearerFormat: "JWT"`, pero la credencial del SDK es un secreto opaco `ayni_sk_…` | US-144 |
| Comentarios `///` | La mayoría de los símbolos públicos, empezando por `AyniSdk` y `sync()`, no tienen `///`; sus páginas de `dart doc` quedan sin descripción. La regla `public_member_api_docs` del analizador puede exigirlos | US-143 |
| Superficie pública | US-090 resolvió la duda: los puntos de prueba `onWorkflowDownload` y `workflowVersionDownloader` salieron del constructor y de `AyniConfig` hacia `createAyniSdkForTesting` (solo en `lib/src/`), y `onBeforeInventoryPersist` se queda público porque su tipo es exportable; la referencia debe seguir esa decisión | US-143, US-090 |
| Manifiesto de modelo desalineado (defecto de código) | El servidor responde `{ manifest: {...} }` (`apps/server/src/sdk-model-versions.ts:55`), pero el SDK lee los campos en la raíz (`ModelDownloadManifest.fromJson`, `lib/src/model_artifact_downloader.dart:14-24`; su servidor de prueba devuelve el manifiesto sin envolver). Contra el servidor real, cada workflow con un modelo termina en `dependencyFailed`. Se corrige en el issue #258 antes de documentar el contrato | US-144, US-044 |
| Códigos no visibles en el SDK | Ante un `401` el SDK devuelve `SyncStatus.error` sin distinguir `credentialRevoked`; la guía de errores debe explicar el síntoma real, no un código que la app no recibe | US-146 |

## 3. Herramientas evaluadas

Versiones consultadas en el registro de npm el 2026-09-27.

| Criterio | Fumadocs (Next.js) | Starlight (Astro) |
| --- | --- | --- |
| Paquetes | `fumadocs-core` y `fumadocs-ui` 16.15.15, `fumadocs-mdx` 15.4.5 | `@astrojs/starlight` 0.42.4 |
| Requisitos | `next` 16.x, `react` ^19.2, `zod` 4.x | `astro` ^7.2.10 |
| Encaje con el monorepo | Mismo stack que `apps/web` (Next 16.3, React 19.2.8, Tailwind 4, zod 4 del catálogo); Turborepo ya cachea `.next/**`; despliegue en Vercel ya configurado | Añade Astro 7 y su cadena de compilación; salida estática desplegable en cualquier host |
| Estilo | Tailwind y componentes al estilo shadcn; puede reutilizar los tokens de `apps/web` | Tema propio, personalizable con CSS |
| Búsqueda | Integrada en el núcleo con `zbsearch` (dependencia de `fumadocs-core`), autoalojada; admite modo estático con `staticGET` | Pagefind, estática y sin servicios externos |
| OpenAPI | Oficial: `fumadocs-openapi` 12.0.4 genera páginas desde la especificación, con ejemplos de solicitud y playground (usa `@scalar/api-client-react`, del mismo proveedor que la referencia actual del servidor) | Complemento comunitario `starlight-openapi` 0.26.2 |
| Contenido | MDX | Markdown y MDX |
| Parecido con las referencias | Estructura equivalente | Es el motor de docs.astro.build |

Referencia de la API Dart, independiente de la herramienta del sitio:
`dart doc .` genera HTML en `doc/api` a partir de los comentarios `///`
(requiere `dart pub get` y `dart analyze` sin errores). pub.dev genera la misma
referencia al publicar, pero el paquete aún no se publica (`publish_to: none`),
así que el sitio debe alojar la salida de `dart doc` hasta US-096.

### Decisión

**Astro con Starlight en una aplicación nueva `apps/docs`, desplegada en
Vercel.** El equipo la eligió el 2026-09-27, por encima de la recomendación
inicial de Fumadocs, para reproducir la experiencia de docs.astro.build.

- **Herramienta:** Starlight es el tema de documentación oficial de Astro y el
  motor de docs.astro.build. Trae de fábrica la navegación lateral, la tabla
  `En esta página`, el tema claro u oscuro, los avisos, las pestañas y la
  búsqueda con Pagefind, sin servicios externos (US-138).
- **Referencia HTTP:** el complemento `starlight-openapi` genera las páginas
  desde `packages/api/src/openapi.json` (US-144). Es comunitario, así que el
  spike confirma que genera las tres rutas `/sdk/*`; si no alcanza, la
  alternativa es enlazar la referencia Scalar que ya publica el servidor.
- **Despliegue:** el sitio es estático, que es el modo por defecto de Astro, y
  Vercel lo despliega sin adaptador. `@astrojs/vercel` (11.0.11) solo hace falta
  si alguna página necesita renderizado bajo demanda, y hoy ninguna lo necesita.
  Como `apps/server`, el proyecto de Vercel usa `apps/docs` como raíz y compila
  con Turborepo desde la raíz del monorepo.
- **Monorepo:** Astro compila en `dist/`, que ya figura en los `outputs` de
  `turbo.json`. Astro 7 (7.3.5 en npm) cumple el requisito `astro` ^7.2.10 de
  Starlight 0.42.4.
- **Referencia Dart en Vercel:** la imagen de compilación de Vercel (Amazon
  Linux 2023) incluye Node.js, Python, Ruby y Go, pero no Dart. Por eso
  `dart doc` se ejecuta en CI (GitHub Actions ya instala Dart) o instalando Dart
  en el `installCommand` de `vercel.json`. El ADR elige
  una de las dos (US-143).
- **Costo asumido:** se añade un segundo framework web. El estilo no comparte
  componentes con `apps/web`; reutiliza sus tokens de color y tipografía en
  CSS.

`docs/adr/0002-…` registra la decisión como primer paso de US-137, con un spike
que instale las versiones concretas, ejecute `bun run build` y haga un
despliegue de vista previa en Vercel.

## 4. Estructura propuesta del sitio

```
Ayni Docs                                  [Buscar  Ctrl K]   [☾]  [GitHub]
├─ Comenzar
│  ├─ ¿Qué es Ayni?                        US-141
│  ├─ Inicio rápido                        US-139
│  └─ Instalación y configuración          US-140
├─ Guías
│  ├─ Preparar una aplicación en el dashboard   US-142
│  │   (aplicación → credencial → modelo → workflow → publicar)
│  └─ Solucionar problemas de sincronización    US-146
├─ Conceptos
│  ├─ Workspaces y aplicaciones             US-141
│  ├─ Credenciales del SDK                  US-141
│  ├─ Modelos y versiones                   US-141
│  ├─ Workflows DAG                         US-141
│  └─ Sincronización offline                US-141
├─ Referencia
│  ├─ API del SDK (Dart)                   US-143
│  ├─ API HTTP del SDK                     US-144
│  ├─ Esquema de workflow                  US-145
│  └─ Estados y errores                    US-146
└─ Recursos
   ├─ Datos y privacidad                   US-147
   └─ Notas de versión y compatibilidad    US-148
```

Acceso y calidad: enlaces desde la landing y el dashboard (US-149), y
verificación de ejemplos y enlaces en CI (US-150). La búsqueda es US-138.

## 5. Orden sugerido de implementación

1. US-137: ADR, spike y esqueleto del sitio con navegación y despliegue.
2. US-150: verificación de ejemplos y enlaces antes de escribir contenido, para
   que cada página nazca verificada.
3. US-141 y US-140: conceptos e instalación, que no dependen de API nueva.
4. US-139, apoyada en el contenido de US-095.
5. US-144, que primero completa `openapi.json` con las rutas `/sdk/*`.
6. US-143, que agrega comentarios `///` y la regla `public_member_api_docs`,
   después de US-090 si esta cambia la superficie pública.
7. US-145, US-146 y US-142.
8. US-147, US-148, US-138 y US-149.

Cuando lleguen la ejecución local (US-049 a US-062), la telemetría (US-100 a
US-113) o la recolección de evidencia (US-063 a US-074), cada una actualiza las
páginas afectadas en su propio cambio; así lo exige el criterio de US-150.

## Fuentes

- Google Cloud, [SDK de Google Cloud](https://docs.cloud.google.com/sdk/docs?hl=es).
- Astro, [Primeros pasos](https://docs.astro.build/es/getting-started/).
- Starlight, [Getting started](https://starlight.astro.build/es/getting-started/) y [Site search](https://starlight.astro.build/guides/site-search/) (Pagefind).
- Fumadocs, [Documentación](https://www.fumadocs.dev/docs) y [OpenAPI](https://www.fumadocs.dev/docs/integrations/openapi).
- Dart, [dart doc](https://dart.dev/tools/dart-doc) y [public_member_api_docs](https://dart.dev/tools/linter-rules/public_member_api_docs).
- Registro de npm: `fumadocs-core`/`fumadocs-ui` 16.15.15, `fumadocs-mdx` 15.4.5, `fumadocs-openapi` 12.0.4, `@astrojs/starlight` 0.42.4, `starlight-openapi` 0.26.2, `astro` 7.3.5 y `@astrojs/vercel` 11.0.11, consultados el 2026-09-27.
- Vercel, [Build image overview](https://vercel.com/docs/builds/build-image): runtimes preinstalados e instalación de paquetes con `dnf` desde `installCommand`.
- Astro, [Deploy your Astro Site to Vercel](https://docs.astro.build/en/guides/deploy/vercel/): un sitio estático no necesita configuración adicional; el adaptador solo se usa para renderizado bajo demanda.
