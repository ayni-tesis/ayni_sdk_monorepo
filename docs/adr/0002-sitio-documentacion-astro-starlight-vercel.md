# ADR 0002 — Construir el sitio de documentación con Astro y Starlight, desplegado en Vercel

- **Estado:** aceptado (2026-09-27, spike con US-137; ver "Resultado del spike")
- **Fecha:** 2026-09-27
- **HU relacionadas:** US-137 a US-150 (`docs/epicas/documentacion-sdk/`)
- **Investigación:** `docs/investigacion/documentacion-sdk.md` (sección 3)

## Contexto

La épica Documentación del SDK pide un sitio público con navegación lateral por
grupos, tabla `En esta página`, páginas anterior y siguiente, bloques de código
copiables, avisos, tema claro u oscuro, búsqueda y enlace `Editar esta página`.
La investigación comparó Fumadocs (Next.js) y Starlight (Astro). Fumadocs
encajaba mejor con el stack de `apps/web`, pero el equipo eligió Starlight el
2026-09-27 para reproducir la experiencia de docs.astro.build.

## Decisión

1. Crear la aplicación **`apps/docs`** con **Astro** y **Starlight**, en
   español (`locales.root.lang = "es"`), sin selector de idioma.
2. Generar el sitio como **estático** (modo por defecto de Astro). Vercel sirve
   `dist/` **sin adaptador**; `@astrojs/vercel` solo se agrega si una página
   necesita renderizado bajo demanda.
3. Desplegar en un proyecto de Vercel propio (`ayni-docs`) con `apps/docs` como
   raíz. Como en `apps/server`, `apps/docs/vercel.json` compila con Turborepo
   desde la raíz del monorepo (`bun run build --filter=docs`).
4. Compilar el sitio en la tarea `build` de Turborepo, que ya cachea `dist/**`,
   así que el paso `Build` de CI lo cubre sin cambios en el workflow.
5. Formar la barra lateral con los cinco grupos de la investigación
   (`apps/docs/src/navigation.ts`); cada grupo se autogenera desde su carpeta
   de contenido, así que ninguna página queda fuera.
6. Tomar colores y tipografía de `apps/web/DESIGN.md` y de los tokens de
   `apps/web/src/index.css` en `apps/docs/src/styles/theme.css`. El sitio no
   comparte componentes con `apps/web`.
7. Usar la búsqueda de Starlight (Pagefind), que se genera al compilar y no
   depende de servicios externos (US-138).

## Alternativas consideradas

- **Fumadocs en Next.js.** Reutiliza el stack y los tokens de `apps/web`, y su
  complemento OpenAPI es oficial. Se descartó por decisión del equipo a favor
  de la experiencia de Starlight.
- **Adaptador `@astrojs/vercel`.** No hace falta mientras todas las páginas
  sean estáticas.

## Consecuencias

- Se agrega un segundo framework web (Astro 7) y su cadena de compilación.
- Los textos de la interfaz salen de la traducción `es` de Starlight;
  `apps/docs/src/content/i18n/es.json` ajusta los que pide US-137 (`Editar esta
  página`, `Anterior`, `Siguiente`, `Advertencia`, `Copiar`, `Copiado` y
  `Sistema`).
- Starlight no trae migas de pan. Se agregan sustituyendo su componente
  `PageTitle` (`apps/docs/src/components/PageTitle.astro`).
- La interfaz de búsqueda de Starlight (Pagefind UI) no admite los estados,
  la ayuda, el atajo `/` ni la navegación con flechas de US-138. Se sustituye
  su componente `Search` (`apps/docs/src/components/Search.astro`) por un
  diálogo que usa la API JavaScript de Pagefind (`apps/docs/src/search/`);
  Starlight sigue generando el índice al compilar. La integración
  `searchIndexCoverage` hace fallar la compilación si una página de `dist`
  (salvo la 404) no está en el índice, así que las referencias Dart y HTTP
  (US-143, US-144) no pueden quedar fuera de la búsqueda sin que se note.
- **Referencia de la API HTTP (US-144).** Se genera con `starlight-openapi`
  desde `openapi.json`; ver "Referencia de la API HTTP (US-144)".
- `Última actualización` sale del historial de git. Vercel clona el
  repositorio con poca profundidad, así que en un archivo sin cambios recientes
  la fecha puede ser la del commit más antiguo clonado, no la real.
- Biome no ve el uso de variables en la plantilla de un archivo `.astro`;
  `biome.json` desactiva `noUnusedImports` y `noUnusedVariables` solo en esos
  archivos.
- **Referencia de la API Dart (US-143).** La imagen de compilación de Vercel no
  incluye Dart, así que `dart doc` debe correr en GitHub Actions o instalarse en
  el `installCommand`. US-143 eligió la primera opción; ver "Referencia de la
  API Dart (US-143)".

## Referencia de la API Dart (US-143)

**Decisión (2026-09-27):** la salida de `dart doc` se genera fuera de Vercel y
se versiona en `apps/docs/public/referencia/api-dart/`; el job `sdk` de CI la
regenera y falla si difiere de la versionada. Vercel sirve esos archivos
estáticos sin instalar nada.

- **Por qué no instalar Dart en Vercel.** `ayni_sdk` depende de
  `tflite_flutter`, que depende del SDK de Flutter, así que `dart pub get` y
  `dart doc` necesitan Flutter completo, no solo Dart. Instalarlo en el
  `installCommand` descarga cerca de 1 GB en cada despliegue, obliga a
  instalarlo también en el job `ci` (que compila el sitio) y no se puede probar
  fuera de Vercel.
- **Generación.** `bun run reference:dart` (en `apps/docs`) borra
  `packages/sdk_flutter/doc/api`, ejecuta `dart doc` y copia la salida a
  `public/referencia/api-dart/`, adaptando cada página con
  `prepareReferencePage` (`src/reference/dart-reference.ts`): `lang="es"`,
  `data-pagefind-body` en el contenido (salvo la página de búsqueda de
  `dart doc`), las migas `Ayni Docs` y `ayni_sdk <versión>` en el encabezado, y
  la insignia `Obsoleto` en los símbolos obsoletos, que `dart doc` solo tacha.
  Omite la 404 de `dart doc` y la redirección `ayni_sdk-library.html`.
- **Frescura.** El job `sdk` fija Flutter 3.44.8 (Dart 3.12.2), porque la
  salida cambia con la versión de dartdoc, ejecuta el generador y falla si
  `git status` muestra cambios en `public/referencia/api-dart/`. Quien cambie
  la API pública o sus `///` debe regenerar con esa versión de Flutter.
- **Búsqueda.** Pagefind indexa cada página de la referencia en el mismo índice
  `es` del sitio; `searchIndexCoverage` excluye solo los fragmentos
  `*-sidebar.html` y la página `search.html` de `dart doc`.
- **Navegación.** `Referencia` → `API del SDK (Dart)` enlaza a
  `/referencia/api-dart/ayni_sdk/`, el índice de la librería. La interfaz propia
  de `dart doc` (`Properties`, `Methods`, su buscador) queda en inglés.
- **Idioma de los `///`.** Se escriben en inglés, como el resto de los
  comentarios del paquete y como los lee pub.dev; los mensajes en español que
  devuelve el SDK se citan tal cual. Cada página declara `lang="es"`, para que
  Pagefind la ponga en el índice del sitio, y su contenido principal
  `lang="en"`, para que los lectores de pantalla lo pronuncien en inglés.
- **Ejemplos.** El analizador de Dart 3.12 marca `{@example}` como directiva
  desconocida, así que los ejemplos son bloques ```` ```dart ```` en los `///`
  y en el `README.md` del paquete (que `dart doc` publica como página del
  paquete). `test/doc_examples_test.dart` exige que cada bloque sea una
  `// #region` de un archivo en `packages/sdk_flutter/example/`, que
  `dart analyze` comprueba (US-150).
- **Superficie pública (US-090).** US-090 aún no decide qué es interno, así
  que la referencia documenta lo que exporta hoy `package:ayni_sdk/ayni_sdk.dart`,
  incluidos los descargadores, el instalador y el verificador; sus `///` y los
  de los parámetros de prueba (`onBeforeInventoryPersist`,
  `workflowVersionDownloader`, `resetForTesting`) dicen que son de uso interno
  o de prueba. Cuando US-090 fije la superficie, se dejan de exportar y se
  regenera la referencia.
- **Costo asumido.** Unos 170 archivos generados (1,8 MB) en el repositorio;
  Biome los ignora.
- **pub.dev (US-096).** El paquete aún no se publica (`publish_to: none`);
  cuando se publique, el sitio enlazará también a la referencia de pub.dev de
  la misma versión.

## Referencia de la API HTTP (US-144)

**Decisión (2026-09-27):** `Referencia` → `API HTTP del SDK` se genera al
compilar con el complemento `starlight-openapi` 0.26.2 (compatible con
Starlight 0.42 y Astro 7) desde `packages/api/src/openapi.json`. El complemento
representa bien las tres rutas `/sdk/*` (método y ruta, parámetros, esquemas,
ejemplos y el ejemplo `curl`), así que no hace falta enlazar la referencia
Scalar que el servidor publica en `/docs`.

- **Una sola fuente.** `packages/api/src/sdk-openapi.ts` describe las rutas con
  esquemas Zod (`@asteasolutions/zod-to-openapi`); `bun run openapi:generate`
  escribe `openapi.json`. De la misma lista de errores de cada ruta salen sus
  respuestas `401`/`404`, sus ejemplos y la tabla `Errores` de su descripción.
  Las pruebas de `apps/server` (`sdk-openapi-contract.test.ts`) ejecutan los
  controladores reales y comparan sus respuestas con esos esquemas y ejemplos.
- **Verificación en CI.** `openapi:verify` (job `ci`) falla si `openapi.json`
  no coincide con el generado o si las rutas `/sdk/*` que declara
  `apps/server/src` (leídas con el compilador de TypeScript) y las de la
  especificación difieren en cualquiera de los dos sentidos. Solo reconoce
  rutas declaradas con una cadena literal (`app.get("/sdk/…")`, `app.on`,
  `app.all`); una subaplicación montada en `/sdk` con `app.route` no se ve.
- **Solo el contrato del SDK.** `astro.config.mjs` escribe en
  `apps/docs/.astro/sdk-openapi.json` la especificación sin las rutas que no
  empiezan por `/sdk/` (`sdkContract`, `src/reference/http-reference.ts`),
  porque el complemento no filtra rutas: `GET /health` y cualquier ruta del
  dashboard quedan fuera. `apps/docs/turbo.json` agrega `openapi.json` a las
  entradas de `build`, para que Turborepo no reutilice un sitio compilado con
  una especificación anterior.
- **Credencial.** El esquema de seguridad `sdkCredential` es `http` `bearer`
  con formato `ayni_sk_…`; ya no se declara un JWT. Los ejemplos `curl` son
  `x-codeSamples` escritos en la especificación, porque los que genera el
  complemento usan `Bearer <token>`. El sitio no ofrece un panel para probar
  solicitudes.
- **Interfaz en inglés.** El complemento no traduce sus textos (`Overview`,
  `Authorizations`, `Responses`, `Examples`), como la interfaz de `dart doc`.
  El contenido de la especificación está en español; la sección
  `Autenticación` va en `info.description` y el aviso `Nota` lo agrega
  `PageTitle.astro` en las páginas bajo `/referencia/api-http/`.
- **zod-to-openapi 8.5.** Pierde `null` en un `$ref` con `.nullable()` y
  genera `enum: [1]` para `z.literal([1, 3, 4])`; el esquema usa uniones
  explícitas en esos dos casos.

## Resultado del spike (2026-09-27, US-137)

1. **Versiones.** `apps/docs/package.json` fija `astro` 7.3.5,
   `@astrojs/starlight` 0.42.4, `@astrojs/check` 0.9.10,
   `@fontsource-variable/geist` 5.3.0 y `@fontsource-variable/geist-mono` 5.3.0,
   y `bun.lock` las registra.
2. **Build.** `bun run build` desde la raíz compila `web`, `server` y `docs`.
   Una segunda ejecución sin `apps/docs/dist` responde `cache hit` y restaura la
   salida desde la caché de Turborepo.
3. **Tipos, lint y pruebas.** `astro check` (tarea `check-types`), Biome y
   `vitest run` de `apps/docs` pasan. Las pruebas cubren los cinco grupos,
   que ninguna página quede fuera de la barra lateral ni vacía, las migas de pan
   y el contraste WCAG AA de la paleta en ambos temas.
4. **Despliegue.** El proyecto `ayni-docs` de Vercel (raíz `apps/docs`,
   preset Astro) instaló con `bun install`, ejecutó
   `turbo build --filter=docs` y publicó el sitio en
   `https://ayni-docs.vercel.app`; una ruta inexistente responde `404` con la
   página `No encontramos esta página.`. Al ser el primer despliegue del
   proyecto, Vercel lo publicó como producción.
5. **Navegador.** Con la vista previa local se comprobó que `Inicio rápido` →
   `Siguiente` lleva a `Instalación y configuración` y que la barra lateral y
   las migas de pan marcan la página actual; que el botón `Copiar` funciona con
   teclado, copia el código y anuncia `Copiado`; y que ninguna página tiene
   desplazamiento horizontal a 360 px.

Pendiente fuera del código: conectar el repositorio de GitHub al proyecto
`ayni-docs` en Vercel, para que cada pull request tenga su vista previa y
`main` publique en producción.
