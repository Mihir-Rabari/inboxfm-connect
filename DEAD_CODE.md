# Dead Code Analysis: Headless Integration Platform

This document outlines the dependency analysis for the migrated repository. Our goal is to catalog which packages, folders, modules, and database entities are obsolete, probably safe, need investigation, or are strictly required.

---

## 1. Safe to Delete

These packages, modules, and files are completely unreachable from the newly active `POST /v1/execute` REST API flow and `HeadlessRuntime` execution engine. They only support obsolete automation concepts (workflows, visual flow builders, queues, schedulers, and runs).

### Packages

#### `packages/web`
*   **Why**: This is the frontend web application (Angular/React) which provides the visual flow builder, runs dashboard, configurations screens, and template selectors. The target product is a headless API-first SDK; no web builder UI is needed.
*   **Dependency Chain**: Unused by server packages. Only listed in root workspace `package.json`.
*   **Files Importing It**: None.
*   **Potential Side Effects**: None. Web build configs can be pruned from `turbo.json` and Docker configurations.

#### `packages/server/worker`
*   **Why**: This is the BullMQ task worker process. The execution model is now synchronous (`API` → `Fork Sandbox` → `Engine`), completely bypassing background queues and workers.
*   **Dependency Chain**: Only referenced in deploy scripts, package.json workspaces, and workers bootstrap.
*   **Files Importing It**: None.
*   **Potential Side Effects**: The BullMQ queue runner service is disabled. The system will no longer require Redis to store or process jobs.

#### `packages/tests-e2e`
*   **Why**: These are Playwright end-to-end browser tests for the visual flow builder and multi-step workflow logic.
*   **Dependency Chain**: Independent test package.
*   **Files Importing It**: None.
*   **Potential Side Effects**: None.

---

### API Modules (`packages/server/api/src/app/*`)

#### `app/flows`
*   **Why**: Handles workflow creation, versioning, folders, draft-to-published transitions, and visual node structures.
*   **Dependency Chain**: Unused since route registrations were deactivated.
*   **Files Importing It**:
    *   Imports in `app-connection/app-connection-service/app-connection-service.ts` (references `flowService` to check if connections are utilized by active flows; can be stubbed to return 0).
    *   Imports in `app-connection/app-connection-service/app-connection.handler.ts` (references `flowService` to replace connection IDs inside flow steps; obsolete).
*   **Potential Side Effects**: Clean up the database connection entity list in `database-connection.ts` and stub the validation checks in `app-connection-service.ts` to prevent runtime type errors.

#### `app/tables`
*   **Why**: Provides internal data tables for visual flow variables and loop structures.
*   **Dependency Chain**: Unused since route registrations were commented out.
*   **Files Importing It**: None.
*   **Potential Side Effects**: Prune `TableEntity` registers from `database-connection.ts`.

#### `app/trigger`
*   **Why**: Manages webhook triggers and polling trigger intervals.
*   **Dependency Chain**: Unused.
*   **Files Importing It**: None.
*   **Potential Side Effects**: Prune trigger-related entities from database connections.

#### `app/webhooks`
*   **Why**: Listens to external webhook endpoints and schedules flow run executions.
*   **Dependency Chain**: Unused.
*   **Files Importing It**: None.
*   **Potential Side Effects**: None.

#### `app/variable`
*   **Why**: Manages user-configured flow variables.
*   **Dependency Chain**: Unused.
*   **Files Importing It**: None.
*   **Potential Side Effects**: None.

#### `app/knowledge-base`
*   **Why**: Provides chunking/indexing capabilities for workflow-integrated chatbot systems.
*   **Dependency Chain**: Unused.
*   **Files Importing It**: None.
*   **Potential Side Effects**: Prune knowledge base database tables.

#### `app/template`
*   **Why**: Pre-built flow templates catalog.
*   **Dependency Chain**: Unused.
*   **Files Importing It**: None.
*   **Potential Side Effects**: None.

#### `app/mcp`
*   **Why**: The MCP server wrapper in Activepieces was designed to expose flows to LLM engines as executable tools.
*   **Dependency Chain**: Unused since route registration was commented out.
*   **Files Importing It**: None.
*   **Potential Side Effects**: None.

#### `app/ee/chat`
*   **Why**: Enterprise LLM chatbot feature built on workflow execution.
*   **Dependency Chain**: Unused.
*   **Files Importing It**: None.
*   **Potential Side Effects**: None.

#### `app/ee/alerts`
*   **Why**: Notifications for failed flow runs.
*   **Dependency Chain**: Unused.
*   **Files Importing It**: None.
*   **Potential Side Effects**: None.

#### `app/workers`
*   **Why**: The worker manager module inside the API, including the BullMQ job-broker and engine-response-watcher.
*   **Dependency Chain**: Unused since route registration and setup calls were disabled.
*   **Files Importing It**:
    *   `app.ts` imports `engineResponseWatcher` (not called).
*   **Potential Side Effects**: Clean up imports in `app.ts`.

#### `app/ee/platform-webhooks`
*   **Why**: Dispatches webhook events on flow actions.
*   **Dependency Chain**: Unused.
*   **Files Importing It**: None.
*   **Potential Side Effects**: None.

---

### Core Execution Modules (`packages/core/execution/src/lib/*`)

#### `core-execution/src/lib/flows`
*   **Why**: Visual flow AST builders and trigger structures.
*   **Dependency Chain**: Only referenced in legacy flow services.
*   **Files Importing It**:
    *   Re-exported by `@activepieces/shared`.
*   **Potential Side Effects**: Can be pruned from `@activepieces/core-execution`.

#### `core-execution/src/lib/agents`
*   **Why**: LLM tool agent orchestrators.
*   **Dependency Chain**: Only referenced in legacy chat services.
*   **Files Importing It**:
    *   Re-exported by `@activepieces/shared`.
*   **Potential Side Effects**: None.

#### `core-execution/src/lib/workers`
*   **Why**: Job queue contract definitions.
*   **Dependency Chain**: Only referenced in legacy workers.
*   **Files Importing It**:
    *   Re-exported by `@activepieces/shared`.
*   **Potential Side Effects**: None.

---

## 2. Probably Safe (Action Required First)

These modules are unused in the active execution paths but require pruning minor import hook links inside active files before deletion.

#### `app/tool-search` (API)
*   **Why**: Performs vector search using embeddings to find matching actions/pieces.
*   **Dependency Chain**: Unused by public API paths, but referenced in piece installation and sync services.
*   **Files Importing It**:
    *   `app/pieces/piece-install-service.ts` (rebuilds search indices on installations).
    *   `app/pieces/piece-sync-service.ts` (rebuilds search indices on catalog changes).
*   **Potential Side Effects**: Pruning requires editing `piece-install-service.ts` and `piece-sync-service.ts` to remove references to `isToolSearchEnabled` and `toolSearchReindexJob`.

#### `packages/core/shared/src/lib/core/tag` (and `app/tags` in API)
*   **Why**: Allows tagging flows with categories.
*   **Dependency Chain**: Unused by the active execution routes.
*   **Files Importing It**:
    *   `app.ts` imports but does not register `tagsModule`.
    *   Re-exported by `@activepieces/shared` index.
*   **Potential Side Effects**: Safe to remove after cleaning up the `tags` imports in `app.ts` and `packages/core/shared/src/index.ts`.

---

## 3. Needs Investigation

These folders are part of Enterprise or utility features. Although their routes are currently commented out or unused, they may contain configurations or metrics schemas we want to retain for licensing or auditing.

#### `app/ee/audit-logs`
*   **Why**: Records system audit trails. In a headless environment, keeping track of connection creations, API key generations, and configuration updates is still highly valuable for compliance.
*   **Status**: Keep for now; investigate if active logging is desired.

#### `packages/cli`
*   **Why**: CLI workspace utility.
*   **Status**: Investigate whether piece developers or users still require the CLI for developer sync tasks.

#### `packages/core/formula`
*   **Why**: Evaluates custom dynamic expressions (e.g. `{{step_1.value}}`). While direct tool runs only pass static JSON values, some piece authentication structures or properties might rely on underlying formula syntax evaluators.
*   **Status**: Keep until dynamic property evaluation dependency chains are fully audited.

#### `app/ee/appsumo`
*   **Why**: Validates licensing for AppSumo promotional campaign users.
*   **Status**: Likely obsolete for the headless platform, but requires confirming commercial business requirements.

---

## 4. Required

These packages and modules form the core of the **Headless Integration Platform**. Under no circumstances should they be modified or deleted.

### Required Packages
*   `packages/runtime`: Public integration SDK API layer (`HeadlessRuntime`).
*   `packages/server/engine`: The engine code executing tools, processing validations, and running piece operations.
*   `packages/server/sandbox`: Process isolate spawning library.
*   `packages/server/api`: The Fastify REST API, security middle-tier, and platform orchestrator.
*   `packages/server/utils`: Shared SSRF filtering and utility library.
*   `packages/pieces`: All integration integrations and third-party tools.
*   `packages/core/utils`: Essential framework utility routines.
*   `packages/core/piece-types`: Strict TypeScript definitions for pieces.
*   `packages/core/shared` (excluding commented exports): Shared types, connection models, and user schemas.

### Required API Modules (`packages/server/api/src/app/*`)
*   `app/execute`: Execution REST routes wrapping `HeadlessRuntime.execute`.
*   `app/app-connection`: Manages credentials, tokens, and OAuth2/Custom Auth handshakes.
*   `app/store-entry`: Holds piece state / database store logs.
*   `app/project`: Manages database projects, workspaces, and memberships.
*   `app/user` and `app/authentication`: Platform session and member auth controls.
*   `app/pieces`: Catalog sync and custom piece installations.
*   `app/flags`: Resolves feature gates and server environmental configs.
*   `app/file`: Storage bucket/database logs uploader.
*   `app/health`: Verifies database, cache, and sandbox status.
*   `app/ai`: Controls LLM provider definitions.
*   `app/ee/api-keys`: API-key authorizations for programmatic execution.
*   `app/ee/license-keys`: Gated EE licensing validators.
