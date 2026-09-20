# ayni

This file provides context about the project for AI assistants.

## Project Overview

- **Ecosystem**: Typescript and Dart

## Tech Stack

- **Runtime**: bun
- **Package Manager**: bun

### Frontend

- Framework: next
- CSS: tailwind
- UI Library: shadcn-ui
- State: zustand

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
- SDK credentials: administrator- and owner-only generation of credentials scoped to one application. The server stores only the SHA-256 hash of the secret, reveals the secret once at creation, and rejects archived applications with the `applicationArchived` state.
- Model management: workspace administrator- and owner-only registration of on-device models (such as TensorFlow Lite) scoped to an active application, rejecting archived applications with the `applicationArchived` state.

## Project Structure

```
ayni/
├── apps/
│   ├── web/         # Frontend application
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

## Thesis SDK direction

The thesis product is an offline-first Flutter SDK for integrating on-device
models into mobile apps through a versioned workflow DAG managed from the web
dashboard.

- An existing Better Auth organization is the workspace. A workspace owns many
  applications; it is not necessary to create a duplicate workspace entity.
- The dashboard currently distinguishes administrators (resource management)
  from members (resource consultation and dataset review); there is no separate
  reviewer role.
- Each application owns its SDK credentials, workflows, workflow versions,
  models, and model versions. SDK credentials are scoped to one application so
  it cannot synchronize another application's resources.
- The dashboard publishes versioned workflow JSON and model manifests; it does
  not send executable code to the device.
- The Flutter app synchronizes workflows and models when online, verifies model
  integrity, stores the last valid version locally, and executes it without a
  network connection.
- The SDK executes a directed acyclic graph (DAG), allowing workflows to branch,
  share intermediate results, and combine model outputs.
- Initial supported node types are image input, image transform, TensorFlow Lite
  classification, TensorFlow Lite detection, condition, `dataset.capture`, and
  output. New node types or runtimes are added only for a demonstrated use case.
- `dataset.capture` is optional: it queues an image and inference result for
  upload only with explicit consent and a configured collection policy. Without
  this node, telemetry contains only permitted execution metadata, never images.
- Telemetry uses a locally generated, per-installation UUID rather than hardware
  identifiers. It may include only permitted technical metadata (device model,
  platform, OS/app/SDK versions, RAM range, execution timings, and sanitized
  errors) and must be governed by an application-level policy and retention.
- TensorFlow Lite is the first on-device runtime. The coffee-leaf flow
  (validate leaf, then diagnose disease or pest) is an example workflow, not a
  product limitation.
- The SDK must validate graph structure, node inputs and outputs, and model
  versions before execution. It must not evaluate arbitrary expressions or code
  received from a workflow.

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

Keep AGENTS.md updated when:

- Adding/removing dependencies
- Changing project structure
- Adding new features or services
- Modifying build/dev workflows

AI assistants should suggest updates to this file when they notice relevant changes.
