# Flow Runtime Removal Plan

This document outlines the staged sequence (PR4A through PR4E) for removing the legacy Flow Runtime from the codebase while ensuring high reviewability and safety.

---

## 1. Safety Rules & Verification

Before deleting any file:
1. It must progress through the lifecycle: **ACTIVE** → **DISCONNECTED** → **QUARANTINED** → **REMOVED**.
2. It must pass the **Deletion Evidence Checklist**:
   - [ ] **Not registered**: Disconnected from Fastify (`app.ts` / modules).
   - [ ] **Not reachable**: Unreachable from `POST /execute` endpoint.
   - [ ] **Not imported by Runtime**: Zero imports in `@inboxfm-connect/runtime`.
   - [ ] **Not imported by Sandbox**: Zero imports in `@inboxfm-connect/sandbox`.
   - [ ] **Not imported by MCP**: Zero imports in active `mcp` handlers.
   - [ ] **Not exported**: Not exported by any public-facing SDK/package.
   - [ ] **Migration prepared**: Database migration ready if it declares an entity.
   - [ ] **Tests updated**: Associated tests skipped, refactored, or quarantined.

---

## 2. Five-Phase PR Blueprint

### PR4A: API Flow Subsystem Removal (Flows & Runs)
- **Stubs first**:
  - Stub flow-count metrics to `0` in `platform-project-service.ts`.
  - Stub connection check to `false` in `app-connection-service.ts`.
  - Remove/Deactivate `/platforms/runs/retry` endpoint in `admin-platform.controller.ts`.
- **Target Folder**: Delete `packages/server/api/src/app/flows/` (68 files).
- **Verify**: API compiles and tests pass.

### PR4B: Trigger Runtime Removal (Triggers & Webhooks)
- **Target Folders**: Delete `packages/server/api/src/app/trigger/` (16 files) and `packages/server/api/src/app/webhooks/` (5 files).
- **Verify**: Server boots and executes tool API functions correctly.

### PR4C: Engine Flow Executors Removal (Engine Executors)
- **Target Files**:
  - Delete `packages/server/engine/src/lib/handler/{flow,loop,router,base}-executor.ts`.
  - Delete `packages/server/engine/src/lib/operations/flow.operation.ts`.
- **Verify**: Engine build compiles and executes pieces/tools successfully.

### PR4D: Database Schema Cleanup (Entities & Migrations)
- **ORM Config**: Unregister flow/run/trigger entities in `database-connection.ts`.
- **Migration**: TypeORM schema migration dropping `flow`, `flow_version`, `flow_run`, `waitpoint`, `folder`, `trigger_event`, `trigger_source`, `app_event_routing`, `project_release`, and `git_repo` tables.
- **Verify**: Database starts, schema synchronizes correctly, and migrations run successfully.

### PR4E: Core Package Cleanup (Shared Types)
- **Target Folders**: Delete `packages/core/execution/src/lib/{flows,flow-run,workers,agents}/`.
- **Shared Index**: Modify `packages/core/execution/src/index.ts` and `packages/core/shared/src/index.ts` to remove references to pruned types.
- **Verify**: Workspace build completes with zero errors.
