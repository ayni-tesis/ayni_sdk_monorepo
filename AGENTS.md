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
- UI Library: shadcn-ui, animate-ui
- Animation: motion
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
- SDK credentials: administrator- and owner-only generation, listing, revocation, and regeneration of credentials scoped to one application. The server stores only the SHA-256 hash of the secret and its display prefix, reveals the secret once at creation or regeneration, and rejects non-active credentials or archived applications. Listing exposes operational metadata only (prefix, status, creation date, last use) and never the secret; status reflects revocation ("active" or "revoked"). Revoking a credential marks it `revoked`: it can no longer authenticate or synchronize new resources (rejected with `credentialRevoked`), and revocation never deletes existing workflows, models, or versions nor removes resources already stored offline on devices. Regenerating an active credential immediately revokes the prior credential and issues a replacement without modifying the application or its resources.
- Model management: workspace administrator- and owner-only registration of on-device models (such as TensorFlow Lite) scoped to an active application, rejecting archived applications with the `applicationArchived` state. Any workspace member can list an application's models (name, id, runtime, and version count — metadata only, never `.tflite` files); non-members receive the same 404 as a missing application so listing never reveals model existence. Any member can also list a model's versions (id, SemVer, SHA-256, size, upload date — metadata only, never the artifact, storage key, or a download URL); a model outside the application is indistinguishable from a missing one. The dashboard links each model to `/dashboard/applications/:applicationId/models/:modelId`, where members can see model metadata and version metadata; missing and inaccessible models show the same not-found state.
- Model download manifest (SDK API): `GET /sdk/model-versions/:modelVersionId/manifest`, authenticated only with a `Bearer` SDK credential secret (never a dashboard session). The manifest carries version id, SemVer, SHA-256, size, and a short-lived presigned R2 download URL plus its expiry; the raw storage key never leaves the server. A valid authentication refreshes the credential's last-use record. The manifest is served only to active credentials whose application is active and owns the version; a missing version, a version of another application, and an archived application all answer the same 404 `modelVersionNotFound` ("La versión del modelo ya no está disponible.") and a revoked credential the `credentialRevoked` state, never revealing artifact information.
- Offline model installation (Flutter SDK): `ModelArtifactInstaller` accepts only artifacts backed by verifier-produced integrity results, stores each model version with its version id and SHA-256 metadata, reports installing/available/not-available states, and lets workflows check exact local version availability. A failed or conflicting installation does not replace an existing valid offline version.
- Workflow creation: `POST /applications/:applicationId/workflows`, restricted to workspace administrators and owners. A workflow is created with an empty `draft.nodes` and no published version, bound to exactly one active application; a missing or whitespace-only name is rejected with 400 and nothing is created, an archived application is rejected with 409 `applicationArchived`, a plain member with 403, and a non-member gets the same 404 as a missing application. The dashboard offers `Crear workflow` under Application → `Workflows` only to administrators of active applications. Any workspace member can list an application's workflows with `GET /applications/:applicationId/workflows` (id, name, status, and dates; the dashboard shows Nombre, Estado, Última versión, and Actualizado, where Última versión is the list's `latestVersion` (the most recently published version) or `Sin publicar`), including for archived applications; the list only contains workflows of the requested application, and a non-member gets the same 404 as a missing application so listing never reveals workflow existence. Any workspace member can open one workflow with `GET /applications/:applicationId/workflows/:workflowId`, which returns `{ workflow, draft, versions }` (also for archived applications); its draft stores nodes in JSONB. US-028 adds an admin-only `input.image` node through `POST /applications/:applicationId/workflows/:workflowId/nodes`; it has a typed `imagen: image` output and a second input is rejected with 409 without changing the draft. The dashboard detail route `/dashboard/applications/:id/workflows/:workflowId` shows `Workflows / <nombre>`, the name, ID, status, and `Borrador` and `Versiones publicadas` tabs; the draft tab offers the image input node to active-application administrators and renders its card. A missing or inaccessible workflow shows `No encontramos este workflow.`. Workspace administrators and owners can rename a workflow with `PATCH /applications/:applicationId/workflows/:workflowId`; the update touches only the `name` column (never the id, status, draft, or published versions), a missing or whitespace-only name is rejected with 400 `Ingresa un nombre para el workflow.` and nothing is written, an archived application is rejected with 409 `applicationArchived`, a plain member gets 403, and a workflow of another application answers the same 404 `notFound` as a missing workflow. The dashboard exposes this under the workflow detail's `Acciones` → `Editar nombre`, shown only to administrators of active applications; saving updates the header and breadcrumb without reloading.
- US-029 adds an admin-only TensorFlow Lite model node by selecting a contracted model version from the same application. The node stores the concrete `modelVersionId` and contract-derived input/output ports; versions without a contract and versions from another application are rejected without changing the draft. The dashboard displays the model name and version with its ports.
- US-030 adds an admin-only condition node for a classification model output. It stores a source node id, a declared label, one of `gte`, `gt`, `lte`, or `lt`, a threshold from 0 to 1, and explicit `Verdadero`/`Falso` branches; incompatible source outputs or labels are rejected without changing the draft. The dashboard exposes only compatible classification nodes and their labels, with no executable expressions.
- US-031 adds admin-only typed output nodes to workflow drafts. Each output has a name and references a compatible model result or a specific condition branch; multiple outputs support success and business-error results, and nodes contain no executable code.
- US-032 adds typed, administrator-only workflow connections. US-033 rejects any connection that creates a direct or indirect cycle before draft persistence; the dashboard blocks known cycles, shows `Esta conexión crearía un ciclo. Los workflows deben ser acíclicos.`, and highlights the involved nodes. The server rechecks the graph while locking the workflow row so concurrent connection writes preserve the DAG invariant.
- US-035 adds read-only draft validation through `GET /applications/:applicationId/workflows/:workflowId/validation`, restricted to workspace administrators and owners (a plain member gets 403, a non-member the same 404 as a missing application). The pure `validateWorkflowDraft` (`apps/server/src/workflow-validation.ts`) checks for an image input and at least one output, connected model image inputs, connections to or from missing nodes, type compatibility (sharing `isConditionSourceCompatible`/`isOutputSourceCompatible` with node creation), cycles, and outputs reachable from the input, and answers `{ publishable, errors }`, where each error names its `nodeId`, `nodeName`, and `port`. It never writes the draft. The dashboard's `Validar workflow` button (administrators of active applications) shows `Validando workflow…`, then either `El workflow está listo para publicarse.` or the `Errores de validación` panel with `Nodo`, `Puerto`, and `Descripción`. A result is hidden once the draft changes.
- US-036 publishes immutable workflow versions through `POST /applications/:applicationId/workflows/:workflowId/versions` (`{ version }`, strict SemVer such as `1.0.0`), restricted to workspace administrators and owners of an active application (403 for members, 409 `applicationArchived`, the same 404 as a missing application for non-members). `publishWorkflowVersion` (`apps/server/src/workflow-version-store.ts`) locks the workflow row, runs `validateWorkflowDraft` on that draft, and inserts a `workflow_version` row whose `definition` holds the validated DAG (`nodes` and `connections`, never the dashboard `layout`). An unpublishable draft answers 409 `workflowInvalid` with the validation `errors`; a version identifier already used by the workflow answers 409 `versionExists` (also enforced by a unique index on `workflow_id, version`). Nothing updates or deletes a published version. `getWorkflow` returns the versions (id, version, date; never the DAG) most recent first and `listWorkflows` adds `latestVersion`. The draft tab's `Publicar versión` (administrators of active applications) opens a dialog with `Versión` and `Se publicará una versión inmutable del workflow.`, shows `Publicando versión…`, then `Versión <versión> publicada.`; an invalid draft shows `Corrige los errores de validación antes de publicar.` and the `Errores de validación` panel. `Versiones publicadas` lists Versión and Publicada. SDK download of a version is US-041.
- US-037 archives a workflow through `POST /applications/:applicationId/workflows/:workflowId/archive`, restricted to workspace administrators and owners of an active application (403 `No tienes permiso para archivar este workflow.` for members, 409 `applicationArchived`, the same 404 as a missing application for non-members, 404 `notFound` for a workflow of another application). `archiveWorkflow` (`apps/server/src/workflow-store.ts`) updates only `status` to `archived` (`workflow.status` is `draft` or `archived`, migration 0013); the draft and published versions are kept, and nothing withdraws versions already stored offline. The detail's `Acciones` → `Archivar workflow` (hidden once archived) opens a dialog warning `El SDK dejará de recibir versiones nuevas de este workflow. El historial se conservará.`, then shows `Workflow archivado.`; list and detail label the status `Archivado`.
- Workflow canvas: the dashboard uses `@xyflow/react` (React Flow 12, ADR 0001) for draggable nodes, palette drops, and typed visual connections; administrators of active applications can delete a single selected draft node after confirmation, which removes incident connections and transitive condition/output dependents without changing published versions. US-121: administrators of active applications drag a node from any part of its card except its ports and buttons, select several nodes with a Shift + drag box, Ctrl/Cmd + click, or `Seleccionar todo` (a click on the background clears the selection), and move the selection together; dragged nodes snap to a 16 px grid when dropped (palette drops do not) unless `Alinear a la cuadrícula` is turned off, and Shift + arrows move the selection one grid cell, saved when Shift is released. Positions persist in `draft.layout` through `PATCH /applications/:applicationId/workflows/:workflowId/layout` (`{ positions: { <nodeId>: { x, y } } }`, coordinates from -100 000 to 100 000, also for new nodes), which `updateWorkflowNodePositions` writes all together or not at all (a missing node answers 404 `notFound` and writes nothing; 400 `No pudimos guardar las posiciones.`, 403 for members, 409 `applicationArchived`). The canvas shows `Guardando posiciones…` next to the zoom level and, if saving fails, restores the previous positions with `No pudimos guardar las posiciones. Se restauró la ubicación anterior.` Rejecting positions saved over a draft someone else changed is left to US-130. US-122: every node shows its labeled ports, inputs on the left (`Entrada de imagen`, `Origen`) and outputs on the right (`imagen`, `Resultado`, `Verdadero`, `Falso`). Administrators of active applications drag from an output (never from an input; members cannot start a connection) and, while dragging, every other port is marked `Compatible` with a cyan ring or `No compatible` and dimmed, following the pure `workflowPortCompatibility` (`workflow-canvas-ports.ts`), which mirrors the server rules: the image output only connects to a model's image input, which admits a single connection (the server now rejects a second one as `incompatible`). `Esc` cancels the drag or the output picked with `Salida <puerto>`; `Conectar <entrada> de <nodo>` is the keyboard alternative for every port. A drop on a compatible input saves through `POST …/connections` and shows `Conexión creada.` (or `No pudimos crear la conexión.`); an incompatible or repeated one is rejected in the browser with `Estos puertos no son compatibles.` or `Estos puertos ya están conectados.` without a request.
- Dashboard URL routing: the browser URL is the source of truth for the active view. The dashboard shell lives in `apps/web/src/app/dashboard/layout.tsx` (so navigation never remounts it); each application section (`overview`, `workflows`, `models`, `credentials`, `settings`) and the members view is a route whose page renders nothing and the shell derives the view from `usePathname()`. Sidebar navigation only calls `router.push()` (never raw `history.pushState`). Workspace, application-list, and application-detail data live in a zustand store (`src/stores/dashboard-store.ts`) and are fetched once per workspace, so switching sections never re-renders a loading list.

## Project Structure

```
ayni/
├── apps/
│   ├── web/         # Frontend application
│   └── server/      # Backend API
├── packages/
│   ├── api/         # API layer
│   ├── auth/        # Authentication
│   ├── db/          # Database schema
│   └── sdk_flutter/ # Reusable offline-first Flutter SDK primitives
```

## Common Commands

- `bun install` - Install dependencies
- `bun dev` - Start development server
- `bun build` - Build for production
- `bun test` - Run tests
- `bun db:migrate` - Apply versioned database migrations
- `bun db:studio` - Open database UI

## Required pre-PR checks

Before opening or updating a PR, run `bun run check` and `bun run check-types` from the repository root and fix any failures before pushing. When a change touches Flutter/Dart files, also run `dart format .` from `packages/sdk_flutter` and `flutter analyze` there; fix formatting and analyzer failures before pushing.

For database schema changes, generate and commit a versioned migration, then apply it with `bun db:migrate`. Do not use `bun db:push`.

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

## Pending work and follow-ups

Known gaps left open on purpose. Remove an entry when it is resolved and name its
user story in the commit or PR that closes it. Story IDs refer to `docs/epicas/`.

- **Dashboard wiring of the workflow detail is untested (technical debt)**:
  `dashboard.tsx` passes `workflowId`, `onOpenWorkflow`, and `onBackToWorkflows`
  to `ApplicationDetailPanel` and extends `pathForView`/`go` with the workflow
  segment. The agreed US-026 test seams stop at `parseDashboardRoute`,
  `ApplicationDetailPanel`, and the server, so only the type-check covers that
  glue. Add a `Dashboard`-level test (deep link renders the detail; clicking a row
  pushes `/dashboard/applications/:id/workflows/:workflowId`) if it regresses.
- **Archived workflows and sync (US-037 → US-039/US-041)**: no SDK sync endpoint
  exists yet, so "an archived workflow is not delivered in new synchronizations"
  is only recorded as `workflow.status = 'archived'`. The sync manifest (US-039)
  and version download (US-041) must exclude workflows whose status is
  `archived`.
- **Editing an archived workflow (US-037, spec silent)**: archiving blocks no
  other action. Administrators can still rename, edit the draft, and publish
  versions of an archived workflow, and there is no unarchive. Decide whether an
  archived workflow becomes read-only (server-side, in every draft/publish
  mutation) before the SDK consumes versions.
- **Overview counts (no story yet)**: the Overview cards in
  `apps/web/src/app/dashboard/panels/application/overview-view.tsx` hard-code
  `0 workflows configurados` and `0 modelos registrados`, and
  `application-detail-panel.test.tsx` asserts those strings. They contradict the
  real lists under Workflows and Models. No story requires them (US-003 lists the
  sections but no counts), so amend US-003 or add a story before implementing.
- **English 401 message (no story yet)**: `errorMessage()`
  (`apps/web/src/lib/api-error.ts`) passes the server `message` through and the
  routes answer 401 with `Authentication required`, so an expired session shows
  that English text when loading the workflow and model lists and when
  generating, revoking, or regenerating credentials.
  `apps/web/src/lib/http-client.ts` has no global 401 handling and no story in
  `docs/epicas` covers session expiry. Decide, app-wide, between translating the
  server message and mapping 401 in the client.
- **Workflow list order (US-025)**: `listWorkflows` orders oldest first
  (`asc(createdAt)`), matching `listModels`; the spec is silent. If most recently
  updated first is preferred, change the `orderBy` and the
  `returns the oldest workflows first` test in `apps/server/src/workflows.test.ts`.
- **Duplicated list plumbing (technical debt)**: `WorkflowsView` and
  `WorkflowDetailView` (`loadDetail`) copy the load/abort/error/retry logic of
  `ModelsView` (`loadModels`), and the server repeats
  `ListWorkflowsExecutor`/`GetWorkflowExecutor`/`ListModelsExecutor`, the
  six-column workflow projection in `getWorkflow` and `listWorkflows`, and the
  session → application → membership → uniform 404 guard across `workflows.ts`
  (twice), `models.ts`, and `model-versions.ts`. Extract a shared hook and a shared type/helper, keeping the guard
  in one place because it carries the guarantee that non-members never learn
  whether an application or its resources exist.
- **Stale reload after switching application (technical debt; read from the code,
  not tested)**: `WorkflowsView` is keyed by application id. If the user switches
  application while `POST /applications/:applicationId/workflows` is in flight,
  the unmounted instance still calls `loadWorkflows` for the old application (one
  wasted GET, no effect on the new view).
- **Connection drops that belong to later stories (US-122 → US-128/US-131)**:
  dropping a connection on the canvas background does nothing yet; US-128 opens
  `Agregar nodo` filtered to compatible types there. The `Origen` input of a
  condition or an output accepts no connection yet (it is always `No compatible`
  and `Conectar origen de …` answers `Estos puertos no son compatibles.`); US-131
  adds its reassignment rules to `workflowPortCompatibility` and the server.
- **Port rules written twice (technical debt, US-122)**: the web's
  `workflowPortCompatibility` (`workflow-canvas-ports.ts`) repeats the server's
  `areWorkflowPortsCompatible` plus the single-connection-per-input check in
  `changeWorkflowConnection` (`workflow-store.ts`); only parallel unit tests keep
  them aligned. Move them into the shared domain utility US-130 creates for edge
  derivation (ADR 0001), before US-131 adds the `Origen` rules to both.
- **Root `CLAUDE.md` is stale**: it still omits workflow creation and listing and
  model listing (last updated around US-012). `AGENTS.md` is the maintained copy;
  decide whether to sync `CLAUDE.md`.

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
