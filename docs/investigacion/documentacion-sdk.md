# Investigación — Documentación del SDK y de la API

Este documento respalda la épica **Documentación del SDK** (US-137 a US-150,
`docs/epicas/documentacion-sdk/`). Estudia dos sitios de referencia, inventaria
lo que hoy se puede documentar en el repositorio, compara herramientas y propone
la estructura del sitio. La elección final de herramienta se registra en un ADR
al iniciar US-137.

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
| API pública | `AyniSdk` (`serverUrl`, `credential`, `storageDirectory`, `syncTimeout`, `allowInsecureLoopback`, `onProgress`, `onWorkflowDownload`) y `sync()` | `lib/src/ayni_sdk.dart:76-107` |
| Resultado | `SyncResult` con `SyncStatus` (`updated`, `upToDate`, `offline`, `error`) y `SyncResourceResult` con `SyncResourceStatus` y `message` en español | `lib/src/ayni_sdk.dart:12-74` |
| Exportaciones | La librería exporta además `WorkflowVersionDownloader`, `ModelArtifactInstaller` y `ModelArtifactIntegrityVerifier` | `lib/ayni_sdk.dart` |
| Ejecución local | No implementada (US-049 a US-062); no hay API para ejecutar workflows | búsqueda en `lib/` |
| Comentarios de documentación | Parciales: algunos campos tienen `///` y la clase `AyniSdk` no | `lib/src/ayni_sdk.dart` |
| README del SDK | No existe (US-095 abierta, issue #58) | `packages/sdk_flutter/` |
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
| Superficie pública | `onBeforeInventoryPersist` y `workflowVersionDownloader` parecen puntos de prueba, pero son parámetros públicos del constructor; decidir qué es API pública corresponde a US-090, y la referencia debe reflejar esa decisión | US-143, US-090 |
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

### Recomendación

**Fumadocs en una aplicación nueva `apps/docs`.** Reutiliza el stack, las
dependencias del catálogo y el despliegue que ya existen, y genera la referencia
HTTP desde `packages/api/src/openapi.json` con un paquete oficial. Starlight
reproduce mejor el aspecto de la documentación de Astro, pero agrega un segundo
framework web al monorepo solo para contenido. Si el equipo prioriza ese aspecto
sobre la homogeneidad, Starlight es una alternativa válida: las historias
describen el comportamiento del sitio y no dependen de la herramienta.

La decisión se confirma en `docs/adr/0002-…` como primer paso de US-137, con un
spike que instale las versiones concretas y ejecute `build` en CI.

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
- Registro de npm: `fumadocs-core`/`fumadocs-ui` 16.15.15, `fumadocs-mdx` 15.4.5, `fumadocs-openapi` 12.0.4, `@astrojs/starlight` 0.42.4 y `starlight-openapi` 0.26.2, consultados el 2026-09-27.
