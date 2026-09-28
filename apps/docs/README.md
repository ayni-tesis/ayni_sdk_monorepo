# Ayni Docs

The SDK documentation site: Astro + Starlight, built as a static site and
deployed on Vercel (see `docs/adr/0002-sitio-documentacion-astro-starlight-vercel.md`).

```sh
bun run dev      # http://localhost:3002
bun run build    # dist/, with the search index
bun run preview  # serves dist/ (search only works on a build)
```

## Verify the documentation

CI's `Verificar documentación` step runs every check of the site with one
command, which you can run locally from `apps/docs`:

```sh
bun run verify
```

It needs Bun, the repository's dependencies (`bun install`) and Flutter 3.44.8
(`dart` on the `PATH`). It runs every check even after one fails, and ends with
the list of failed checks:

| Check | What fails it |
| --- | --- |
| `Ejemplos Dart analizados (dart analyze)` | Code in `packages/sdk_flutter/example/` that does not compile, for example after an SDK symbol is renamed. The message names the page and line that show it: `Ejemplo roto: The method 'sincronizar' isn't defined for the type 'AyniSdk'. en comenzar/inicio-rapido.mdx:87 (example/quickstart.dart:23)`. |
| `Ejemplos de la API Dart y workflow JSON (dart test)` | A ```` ```dart ```` block of a `///` comment or of the SDK README that is not an example region (`test/doc_examples_test.dart`), or an `example/workflow_definition.json` that `WorkflowDefinitionValidator` rejects (`test/workflow_schema_example_test.dart`). |
| `Contratos citados en las páginas (vitest)` | This site's tests: a Dart snippet written in a page instead of taken from an example, the enums of `Estados y errores` against the SDK, and the other contracts the pages quote. |
| `Especificación OpenAPI al día (openapi:verify)` | A stale `packages/api/src/openapi.json`, or `/sdk/*` routes that the server and the specification do not share. |
| `Sitio compilado, enlaces internos y anclas (astro build)` | A build error, or a link to a page or anchor that does not exist: `Enlace roto: /referencia/estados-y-errores/#uptodate en comenzar/inicio-rapido.mdx:42 (la página no tiene el ancla #uptodate)`. |
| `Enlaces externos` | Nothing: a page's link to another site that does not answer is only a warning, so third-party sites never block a change. |

### Writing pages that pass

- Never write Dart code in a page. Put it between `// #region <name>` and
  `// #endregion <name>` in a file under `packages/sdk_flutter/example/`, read
  it in a module of `src/examples/` with `exampleRegion`, and render it with
  Starlight's `<Code code={…} lang="dart" />`.
- Link to other pages with their site path, such as
  `/comenzar/instalacion-y-configuracion/#requisitos`. An anchor is the
  heading's text in lower case, with spaces as hyphens and without most
  punctuation; accents stay (`#del-borrador-a-la-versión-publicada`).
