# ayni

This file provides context about the project for AI assistants.

## Project Overview

- **Ecosystem**: Typescript

## Tech Stack

- **Runtime**: bun
- **Package Manager**: bun

### Frontend

- Framework: next
- CSS: tailwind
- UI Library: shadcn-ui
- State: zustand
- Workflow canvas: @xyflow/react (React Flow 12), see `docs/adr/0001-lienzo-workflows-con-xyflow-react.md`
- Workflow auto layout: @dagrejs/dagre (installed by the ADR 0001 spike; used from US-124)

### Documentation site

- `apps/docs`: Astro 7 + Starlight, static output deployed on Vercel (project `ayni-docs`, root `apps/docs`) without an adapter; see `docs/adr/0002-sitio-documentacion-astro-starlight-vercel.md`
- Sidebar groups live in `apps/docs/src/navigation.ts` and autogenerate from `src/content/docs/<group>/`; UI string overrides in `src/content/i18n/es.json`; theme tokens in `src/styles/theme.css` (contrast checked by `src/theme.test.ts`)
- Pages document only shipped behavior (epic rule, `docs/epicas/documentacion-sdk/README.md`)
- Dart snippets are never written in a page: they live between `// #region <name>` markers in `packages/sdk_flutter/example/*.dart` (checked by the SDK CI job's `dart analyze`), `src/examples/` exposes them through `exampleRegion`, and `.mdx` pages render them with Starlight's `<Code>` (US-139 quick start)
- Starlight components that render with `satteri` (such as `<Tabs>`) need it loaded from `node_modules`: `satteri` is a direct docs dependency and `astro.config.mjs` externalizes it for the `ssr` and `prerender` environments, because Bun's isolated linker hides its native binding from the bundled prerender chunks (US-140)
- `Instalación y configuración` (US-140): `src/sdk/installation-page.test.ts` checks the `AyniSdk` parameter table (name, type, required, default) against the constructor in `packages/sdk_flutter/lib/src/ayni_sdk.dart` (parsed by `src/sdk/dart-constructor.ts`) and the requirements against `pubspec.yaml`
- Concepts (US-141): `src/glossary/glossary.ts` is the Spanish translation of every `CONTEXT.md` term (its test parses `CONTEXT.md` with `contextTerms` and fails when a term or avoided term is missing), so add a term to `CONTEXT.md` first; concept pages quote it with `<Definition term="…" />`, `Glosario` renders it with `<Glossary />`, and `comingSoon` shows the `Próximamente` badge. Diagrams use `src/components/Diagram.astro`, whose `alt` must describe the whole flow
- Dashboard guide (US-142): `Guías` → `Preparar una aplicación en el dashboard` quotes dashboard texts between `«` and `»`; `src/guides/dashboard-guide.test.ts` parses `apps/web/src`, `apps/server/src` and `packages/api/src` with the TypeScript compiler and fails when a quoted text is not a whole string literal, JSX text or fixed part of a template literal there, so a dashboard change that renames a button or message updates the guide in the same change. Its screenshots are still pending: `src/components/Screenshot.astro` renders a visible `Captura pendiente` box described by `alt`
- Dart API reference (US-143): `Referencia` → `API del SDK (Dart)` is `dart doc` output committed in `apps/docs/public/referencia/api-dart/` (Vercel has no Flutter; ADR 0002). After changing the SDK's public API or its `///` comments, run `dart pub get` in `packages/sdk_flutter` and `bun run reference:dart` in `apps/docs` with Flutter 3.44.8, and commit the output: CI's `sdk` job regenerates it and fails on any difference. `packages/sdk_flutter/analysis_options.yaml` makes `public_member_api_docs` an error, and `dartdoc_options.yaml` fails `dart doc` on a broken `[symbol]` reference. A ```` ```dart ```` block in a `///` comment or in `packages/sdk_flutter/README.md` (the reference's package page) must be a `// #region` of a file under `packages/sdk_flutter/example/` (`test/doc_examples_test.dart`). Deprecate with `@Deprecated('Use X instead.')` and name the replacement in the `///`; the generator adds the `Obsoleto` badge
- HTTP API reference (US-144): `Referencia` → `API HTTP del SDK` is generated at build time by `starlight-openapi` from the `/sdk/*` part of `packages/api/src/openapi.json` (`src/reference/http-reference.ts` writes it to `.astro/sdk-openapi.json`; `/health` and dashboard routes stay out). Describe SDK routes in `packages/api/src/sdk-openapi.ts` (Zod schemas, error list, `curl` sample), then run `bun run openapi:generate` in `packages/api`. CI's `openapi:verify` fails when `openapi.json` is stale or when a `/sdk/*` route in `apps/server/src` and the spec differ; `apps/server/src/sdk-openapi-contract.test.ts` checks the real handlers' bodies against the spec's schemas and error examples
- Workflow schema (US-145): `Referencia` → `Esquema de workflow` documents the published definition. `src/reference/workflow-schema-page.test.ts` checks its node and field tables against `_nodeFields` in `packages/sdk_flutter/lib/src/workflow_definition_validator.dart` (which `src/reference/workflow-schema.test.ts` checks against the server's `WorkflowNode`), wants one `Reglas de validación` row per `WorkflowValidationStatus` rejection, and wants each type's `Desde la versión del SDK` to be a version in `Notas de versión y compatibilidad`, so a new node type or rule updates the page in the same change. The JSON example is `packages/sdk_flutter/example/workflow_definition.json`, which `test/workflow_schema_example_test.dart` runs through the validator
- States and errors (US-146): `src/reference/status-page.test.ts` checks `Referencia` → `Estados y errores` against the SDK: one row per `InitializationStatus`, `SyncStatus` and `SyncResourceStatus` value (`src/sdk/dart-enum.ts` reads Dart enums), every `SyncResourceResult.message` text quoted exactly (`src/sdk/sync-messages.ts` reads the getter; `$name` is `<nombre>` and `$dependencyName` is `<modelo>`), and one row per error `code` of the `/sdk/*` routes in `openapi.json`. `src/guides/sync-troubleshooting.test.ts` wants every `Solucionar problemas de sincronización` entry as `Síntoma`, `Causas probables` and `Cómo resolverlo`, symptoms free of HTTP codes the app never receives, and its «…» quotes checked against the dashboard like the US-142 guide (`src/guides/dashboard-texts.ts`). A new state, message or error code updates these pages in the same change
- Data and privacy (US-147): `src/resources/privacy-page.test.ts` checks `Recursos` → `Datos y privacidad` against the files an app runs, those `lib/ayni_sdk.dart` reaches through imports (`src/sdk/sdk-data.ts`; the package validator stays out): one `Datos que el SDK envía` row per `getUrl`/`postUrl` request (a socket, `openUrl`, host-and-port call or HTTP package fails the test), the credential only on `/sdk/*` requests, no redirects, no request body and no header but `Authorization` (what backs `Lo que el SDK no hace`), and every fixed name and extension of the paths the SDK builds in `storageDirectory`. A `## Datos opcionales` section must exist exactly when a sent datum is optional. The telemetry and evidence stories that change sent or stored data list the page update in their acceptance criteria, which the test also checks
- Release notes (US-148): `Recursos` → `Notas de versión y compatibilidad` renders `packages/sdk_flutter/CHANGELOG.md` (the file pub.dev shows) at build time through the `releases` collection (`src/resources/changelog-loader.ts`), so the site keeps no copy of the notes. Each entry is `## <SemVer> - <YYYY-MM-DD>` with `###` sections among `Novedades`, `Correcciones`, `Cambios incompatibles` and `Cómo migrar`, in that order; `parseChangelog` (`src/resources/changelog.ts`) fails the build on another heading, versions out of order, or incompatible changes without `Cómo migrar`. Before publishing a version, add its entry at the top (the test wants `pubspec.yaml`'s version to be the newest one) and its row in `sdkCompatibility` (`src/resources/compatibility.ts`: minimum HTTP API `info.version` and workflow schema version, `null` until US-098). A new node type also goes in `nodeTypeSince`, which the `Esquema de workflow` page's `Desde la versión del SDK` column must match
- Product links (US-149): the landing (`Documentación` in the navigation and the search dialog) and the dashboard (`Ayuda` → `Documentación`, the new-credential dialogs, a published workflow's `Versiones publicadas` tab, the empty applications list) link to the site through `DocsLink` (`apps/web/src/components/docs-link.tsx`), which opens a new tab and joins `NEXT_PUBLIC_DOCS_URL` (validated in `packages/env/src/web.ts`) with a path from `docsPages` (`apps/web/src/lib/docs-pages.ts`). The `productLinkCoverage` integration (`src/links/product-links.ts`) fails `astro build` when one of those pages or anchors is missing, so a page that moves or renames a linked heading updates `docsPages` in the same change. Keep `docs-pages.ts` free of imports: `astro.config.mjs` imports it
- Search (US-138): `src/components/Search.astro` overrides Starlight's `Search` with a dialog over Pagefind's JS API (`src/search/`); the `searchIndexCoverage` integration fails `astro build` when a built page (except the 404) is missing from the Pagefind index. The dialog tests run in jsdom (`// @vitest-environment jsdom`, a docs devDependency), which lacks `showModal()`, so they stub it

### Backend

- Framework: hono
- API: openapi
- Validation: zod

### Database

- Database: postgres
- ORM: drizzle

### Authentication

- Provider: better-auth-organizations

### Additional Features

- Testing: vitest
- Caching: upstash-redis
- Logging: pino
- Application management: workspace-scoped applications with administrator- and owner-only create, rename, and archive actions
- Workspace member management: workspace-scoped member listing and role updating (admin and member) restricted to workspace administrators and owners
- Workspace invitation links: administrator- and owner-only creation of single-use, expiring links bound to one workspace and role (`admin` or `member`). The server stores only the SHA-256 hash of the token, the system never sends e-mail, and accepting a link grants membership only to the invited workspace.
- SDK credentials: administrator- and owner-only generation, listing, and revocation of credentials scoped to one application. The server stores only the SHA-256 hash of the secret and its display prefix, and reveals the secret once at creation. Listing exposes operational metadata only (prefix, status, creation date, last use) and never the secret; status reflects revocation ("active" or "revoked") while last use remains a placeholder ("never used") until SDK telemetry lands. Generation rejects archived applications with the `applicationArchived` state, while listing stays available to administrators and owners. Revoking a credential marks it `revoked`: it can no longer authenticate or synchronize new resources (rejected with `credentialRevoked`), and revocation never deletes existing workflows, models, or versions nor removes resources already stored offline on devices.
- Model management: workspace administrator- and owner-only registration of on-device models (such as TensorFlow Lite) scoped to an active application, rejecting archived applications with the `applicationArchived` state.

## Project Structure

```
ayni/
├── apps/
│   ├── web/         # Frontend application
│   ├── docs/        # SDK documentation site (Astro + Starlight)
│   └── server/      # Backend API
├── packages/
│   ├── api/         # API layer
│   ├── auth/        # Authentication
│   └── db/          # Database schema
```

## Common Commands

- `bun install` - Install dependencies
- `bun dev` - Start development server
- `bun build` - Build for production
- `bun test` - Run tests
- `bun db:push` - Push database schema
- `bun db:studio` - Open database UI

## Better Fullstack project context

`bts.jsonc` is the authority for the current Stack Graph. Its `stackParts` array owns role selection and `ownerPartId` bindings. Top-level option fields are a compatibility projection and must not become a second mutation path.

### Stack Parts, ownership, and evidence

- `backend.api:typescript:openapi`. It belongs to `backend:typescript:hono`. Evidence is `listed` with `unverified` freshness. Verification maintainer: @Marve10s.
- `backend.auth:typescript:better-auth-organizations`. It belongs to `backend:typescript:hono`. Evidence is `listed` with `unverified` freshness. Verification maintainer: @Marve10s.
- `backend.caching:typescript:upstash-redis`. It belongs to `backend:typescript:hono`. Evidence is `listed` with `unverified` freshness. Verification maintainer: @Marve10s.
- `backend.deploy:typescript:vercel`. It belongs to `backend:typescript:hono`. Evidence is `listed` with `unverified` freshness. Verification maintainer: @Marve10s.
- `backend.fileStorage:typescript:r2`. It belongs to `backend:typescript:hono`. Evidence is `listed` with `unverified` freshness. Verification maintainer: @Marve10s.
- `backend.logging:typescript:pino`. It belongs to `backend:typescript:hono`. Evidence is `listed` with `unverified` freshness. Verification maintainer: @Marve10s.
- `backend.orm:typescript:drizzle`. It belongs to `backend:typescript:hono`. Evidence is `listed` with `unverified` freshness. Verification maintainer: @Marve10s.
- `backend.rateLimit:typescript:upstash-ratelimit`. It belongs to `backend:typescript:hono`. Evidence is `listed` with `unverified` freshness. Verification maintainer: @Marve10s.
- `backend.runtime:typescript:bun`. It belongs to `backend:typescript:hono`. Evidence is `listed` with `unverified` freshness. Verification maintainer: @Marve10s.
- `backend.testing:typescript:vitest`. It belongs to `backend:typescript:hono`. Evidence is `listed` with `unverified` freshness. Verification maintainer: @Marve10s.
- `backend.validation:typescript:zod`. It belongs to `backend:typescript:hono`. Evidence is `listed` with `unverified` freshness. Verification maintainer: @Marve10s.
- `backend:typescript:hono`. Its generated target is `apps/server`. Evidence is `listed` with `unverified` freshness. Verification maintainer: @Marve10s.
- `codeQuality:universal:biome`. Evidence is `listed` with `unverified` freshness. Verification maintainer: @Marve10s.
- `continuousIntegration:universal:github-actions`. Evidence is `listed` with `unverified` freshness. Verification maintainer: @Marve10s.
- `database.dbSetup:universal:neon`. It belongs to `database:universal:postgres`. Evidence is `listed` with `unverified` freshness. Verification maintainer: @Marve10s.
- `database:universal:postgres`. Its generated target is `packages/db`. Evidence is `listed` with `unverified` freshness. Verification maintainer: @Marve10s.
- `frontend.css:typescript:tailwind`. It belongs to `frontend:typescript:next`. Evidence is `listed` with `unverified` freshness. Verification maintainer: @Marve10s.
- `frontend.deploy:typescript:vercel`. It belongs to `frontend:typescript:next`. Evidence is `listed` with `unverified` freshness. Verification maintainer: @Marve10s.
- `frontend.forms:typescript:react-hook-form`. It belongs to `frontend:typescript:next`. Evidence is `listed` with `unverified` freshness. Verification maintainer: @Marve10s.
- `frontend.httpClient:typescript:axios`. It belongs to `frontend:typescript:next`. Evidence is `listed` with `unverified` freshness. Verification maintainer: @Marve10s.
- `frontend.stateManagement:typescript:zustand`. It belongs to `frontend:typescript:next`. Evidence is `listed` with `unverified` freshness. Verification maintainer: @Marve10s.
- `frontend.ui:typescript:shadcn-ui`. It belongs to `frontend:typescript:next`. Evidence is `listed` with `unverified` freshness. Verification maintainer: @Marve10s.
- `frontend:typescript:next`. Its generated target is `apps/web`. Evidence is `listed` with `unverified` freshness. Verification maintainer: @Marve10s.
- `mobile:dart:flutter`. Its generated target is `apps/native`. Evidence is `listed` with `unverified` freshness. Verification maintainer: @Marve10s.
- `workspaceRunner:universal:turborepo`. Evidence is `listed` with `unverified` freshness. Verification maintainer: @Marve10s.

### Installed-version authority

Use `bts.jsonc` for the generator and schema version. Use local package manifests and lockfiles for installed dependency versions. Do not assume that documentation for a newer Better Fullstack release matches this project.

### Compatibility and lifecycle safety

Run `create-better-fullstack context --json` for bounded roles, capabilities, evidence, compatibility issues, and safe next actions. Run `create-better-fullstack doctor --json` before repairing graph drift. Existing-project writes must start with a plan and use the exact review token. Use `create-better-fullstack recipes check --json` before editing recipe-owned paths or managed regions, and use recipe history plus project recovery commands to undo a reviewed operation.

User code outside an explicit Better Fullstack managed region is not generator-owned. Missing or changed managed-region hashes stop recipe planning for manual review.

<!-- <better-fullstack:recipes sha256=e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855> -->

<!-- </better-fullstack:recipes> -->

## Maintenance

Keep CLAUDE.md updated when:

- Adding/removing dependencies
- Changing project structure
- Adding new features or services
- Modifying build/dev workflows

AI assistants should suggest updates to this file when they notice relevant changes.
