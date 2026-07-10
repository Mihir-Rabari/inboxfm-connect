# Migration Plan (MIGRATION_PLAN.md)

To ensure the repository compiles successfully at every step, the migration is structured in four consecutive phases.

---

## Phase 1: Disable Workflow-Related Features

### Step 1.1: Prune Webserver Routes
Remove endpoints handling flows, runs, folders, and webhooks in [`packages/server/api/src/app.ts`](file:///K:/Projects/activepieces/packages/server/api/src/app/app.ts) and comment out references. Replace imports with stub handlers if needed to prevent compile breaks.

### Step 1.2: Disable Workers & Queues
- Disable BullMQ initialization.
- Stub out [`userInteractionWatcher`](file:///K:/Projects/activepieces/packages/server/api/src/app/workers/user-interaction-watcher.ts) to throw errors temporarily or resolve synchronously.
- Retain compilation of core schemas in `@activepieces/shared`.

---

## Phase 2: Introduce the new Runtime API & Framework Rename

### Step 2.1: Redesign SDK (Piece -> Integration, Action -> Tool)
- Refactor [`packages/pieces/framework`](file:///K:/Projects/activepieces/packages/pieces/framework):
  - Rename `Piece` class/types to `Integration`.
  - Rename `Action` class/types to `Tool`.
  - Remove all definitions, triggers parameters, and webhook handling code.
- Rewrite the `createPiece` macro to `createIntegration`.

### Step 2.2: Implement `packages/runtime`
Create a new library module `packages/runtime` exposing:
- `execute({ integration, tool, connectionId, input })`
- `connect({ integration, value, displayName })`
- `disconnect({ connectionId })`
- `refreshToken({ connectionId })`
- `listTools({ integration })`
- `getConnection({ connectionId })`

### Step 2.3: Implement Synchronous Fork Sandbox Runner
- Rework [`packages/server/sandbox`](file:///K:/Projects/activepieces/packages/server/sandbox) to support synchronous execute operations.
- The runtime launches the sandbox ([`fork.ts`](file:///K:/Projects/activepieces/packages/server/sandbox/src/lib/sandbox/fork.ts)) to start the Engine, sends the execution command directly, awaits the execution result, shuts down the process, and returns the response.

---

## Phase 3: Switch Existing Execution to the New Runtime

### Step 3.1: API Integrations
- Point `POST /execute` directly to the new `packages/runtime` `execute()` method.
- Refactor OAuth claim/refresh callback flows to invoke `connect()` and `refreshToken()` in the new runtime synchronously instead of enqueuing BullMQ jobs.

### Step 3.2: Re-structure Pieces to `providers/`
Create a migration script to restructure the community pieces into the new SDK structure:
- Path: `providers/<integrationName>/manifest.ts` (defines name, auth type, tools).
- Path: `providers/<integrationName>/auth.ts` (auth validation & parameters).
- Path: `providers/<integrationName>/tools/<toolName>.ts` (individual tool files).

---

## Phase 4: Delete Obsolete Modules

### Step 4.1: Code Purging
Delete files, configurations, and packages marked for removal:
- Remove `packages/web`, `packages/ee/embed-sdk`, `packages/tests-e2e`, `packages/server/worker`.
- Delete folder files like `packages/server/api/src/app/flows`, `packages/server/api/src/app/trigger`.

### Step 4.2: Database Migrations
- Clean up [`database-connection.ts`](file:///K:/Projects/activepieces/packages/server/api/src/app/database/database-connection.ts) to export only the keeper models.
- Run a TypeORM migration to drop the removed tables.
- Run tests (`npm run test-unit`) and lint checks (`npm run lint-dev`) to verify.
