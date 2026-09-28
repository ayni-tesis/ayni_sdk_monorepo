# ayni

Created with [Better Fullstack](https://github.com/Marve10s/Better-Fullstack).

## Applications and resources

- **next** (typescript, frontend): `apps/web`; part `frontend:typescript:next`
- **hono** (typescript, backend): `apps/server`; part `backend:typescript:hono`
- **postgres** (universal, database): `packages/db`; part `database:universal:postgres`
- **flutter** (dart, mobile): `apps/native`; part `mobile:dart:flutter`
- **astro + starlight** (typescript, documentation site): `apps/docs`; see `docs/adr/0002-sitio-documentacion-astro-starlight-vercel.md`
- **biome** (universal, codeQuality): `.`; part `codequality:universal:biome`
- **github-actions** (universal, continuousIntegration): `.`; part `continuousintegration:universal:github-actions`
- **turborepo** (universal, workspaceRunner): `.`; part `workspacerunner:universal:turborepo`

## Setup

Install the SDKs for the selected languages before preparing dependencies. SwiftUI needs macOS, Xcode, and XcodeGen; Kotlin Android apps need a JDK and Android SDK; Flutter needs the Flutter SDK. Rust web apps also need the WebAssembly target and Trunk or Dioxus CLI.

JavaScript dependencies are installed at the workspace root. Each native application keeps its own toolchain. Native package scripts require `bash` on PATH; install Git Bash on Windows. Run the shell commands below in Bash.

If dependencies were not prepared during creation, run:

```sh
bun install
(cd 'apps/native' && flutter create --platforms=android,ios . && flutter pub get)
```

Copy each application's `.env.example` to `.env` when present and configure database credentials before starting database-backed services.

For local PostgreSQL, run the included container and set `DATABASE_URL` in `apps/server/.env` to `postgres://ayni:ayni@localhost:5432/ayni`:

```sh
docker compose up -d postgres
```

## Local development

Start the selected web applications and backend services together:

```sh
bun run dev
```

The supervisor stops the other services when one exits. Native mobile applications run separately so you can choose a simulator or device. Open Kotlin applications in Android Studio.

### docs

The SDK documentation site (Astro + Starlight) runs on port 3002. Search only works on a production build (`bun run build`, then `bun run preview` in `apps/docs`).

```sh
bun run --filter docs dev
```

The landing and the dashboard link to it through `NEXT_PUBLIC_DOCS_URL` (default `http://localhost:3002`). Set it to the published site's URL when deploying `apps/web`. The linked pages and anchors live in `apps/web/src/lib/docs-pages.ts`, and the docs build fails when one of them no longer exists.

`bun run verify` in `apps/docs` runs every documentation check of CI's `Verificar documentación` step (Dart examples, contracts, OpenAPI, internal links and anchors, and a non-blocking check of external links); see `apps/docs/README.md`.

### flutter

Run independently from the project root:

```sh
cd 'apps/native' && flutter run
```

## Connections

See each application's README and environment file for its local endpoint.

Cross-language clients communicate over HTTP. Framework-specific clients such as tRPC are used only with compatible backends. Generated connection files identify the default backend; additional services retain their own paths and endpoints.
