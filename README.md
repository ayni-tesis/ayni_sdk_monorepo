# ayni

Created with [Better Fullstack](https://github.com/Marve10s/Better-Fullstack).

## Applications and resources

- **next** (typescript, frontend): `apps/web`; part `frontend:typescript:next`
- **hono** (typescript, backend): `apps/server`; part `backend:typescript:hono`
- **postgres** (universal, database): `packages/db`; part `database:universal:postgres`
- **flutter** (dart, mobile): `apps/native`; part `mobile:dart:flutter`
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

## Local development

Start the selected web applications and backend services together:

```sh
bun run dev
```

The supervisor stops the other services when one exits. Native mobile applications run separately so you can choose a simulator or device. Open Kotlin applications in Android Studio.

### flutter

Run independently from the project root:

```sh
cd 'apps/native' && flutter run
```

## Connections

See each application's README and environment file for its local endpoint.

Cross-language clients communicate over HTTP. Framework-specific clients such as tRPC are used only with compatible backends. Generated connection files identify the default backend; additional services retain their own paths and endpoints.
