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
- `Última actualización` sale del historial de git. Vercel clona el
  repositorio con poca profundidad, así que en un archivo sin cambios recientes
  la fecha puede ser la del commit más antiguo clonado, no la real.
- Biome no ve el uso de variables en la plantilla de un archivo `.astro`;
  `biome.json` desactiva `noUnusedImports` y `noUnusedVariables` solo en esos
  archivos.
- **Referencia de la API Dart (US-143).** La imagen de compilación de Vercel no
  incluye Dart, así que `dart doc` debe correr en GitHub Actions o instalarse en
  el `installCommand`. Esta decisión queda para US-143, que actualiza este ADR;
  US-137 no publica la referencia Dart.

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
