# PR4 Deletion Decisions & Stage Plan

This document establishes the evidence-driven audit checklist, staging blueprint, and safety rules for removing the legacy Flow Runtime from InboxFM Connect across five distinct, reviewable pull requests (PR4A through PR4E).

---

## 1. Safety Rules & Lifecycle Stages

To prevent accidental deletions of strategic capabilities, all targeted files must progress through the following lifecycle stages:

```
ACTIVE (In Code) 
      ↓
DISCONNECTED (Commented out in app.ts, routes deactivated)
      ↓
QUARANTINED (Imports & active code references stubbed/removed; verify zero compilation references)
      ↓
REMOVED (Physical file deletion; git status verification)
```

### Strategic Capabilities (ALWAYS RETAIN)
The following are **Strategic Capabilities** (formerly Roadmap Features) and must **NEVER** be deleted:
- **Headless Runtime**: Core execute pathways.
- **OAuth & Connections**: Authenticated integration tool callers.
- **Sandbox Environment**: Secure executor workspace.
- **Scheduler**: System maintenance jobs.
- **Integrations (Pieces)**: Library of community/official tools.
- **MCP Module**: AI-Agent direct integration (to be refactored to Headless).
- **Knowledge Base**: Semantic tool search and vector indexing (to be refactored to tool search).
- **Shared Execution Contracts**: Standard RPC payloads, error boundaries, and tool operation metadata.

---

## 2. Deletion Evidence Checklist

Before any file is physically removed, it must satisfy all of the following:

- [ ] **Not registered**: Disconnected from Fastify (`app.ts` / modules).
- [ ] **Not reachable**: Unreachable from `POST /execute` endpoint.
- [ ] **Not imported by Runtime**: Zero imports in `@inboxfm-connect/runtime`.
- [ ] **Not imported by Sandbox**: Zero imports in `@inboxfm-connect/sandbox`.
- [ ] **Not imported by MCP**: Zero imports in active `mcp` handlers.
- [ ] **Not exported**: Not exported by any public-facing SDK/package.
- [ ] **Migration prepared**: Database migration ready if it declares an entity.
- [ ] **Tests updated**: Associated tests skipped, refactored, or quarantined.

---

## 3. Pull Request Staging Blueprint

The deletion is split into five distinct pull requests:

### PR4A: API Flow Subsystem Removal
- **Goal**: Remove flow and flow run CRUD modules from the API server.
- **Deactivations/Stubs first**:
  - Stub active flow-count metrics in `platform-project-service.ts`.
  - Stub active connection check in `app-connection-service.ts`.
  - Deactivate platform run retry controller inside `admin-platform.controller.ts`.
- **Target Folder**: `packages/server/api/src/app/flows/` (68 files).
- **Evidence**: All REST entrypoints are commented out in `app.ts`.

### PR4B: Trigger Runtime Removal
- **Goal**: Remove webhook routing and polling engines.
- **Target Folder**: `packages/server/api/src/app/trigger/` (16 files) and `packages/server/api/src/app/webhooks/` (5 files).
- **Evidence**: Outbound event loops and webhook endpoints are disconnected.

### PR4C: Engine Flow Executors Removal
- **Goal**: Delete looping, branching, and sequential executors from the runner sandbox.
- **Target Files**:
  - `packages/server/engine/src/lib/handler/{flow,loop,router,base}-executor.ts`
  - `packages/server/engine/src/lib/operations/flow.operation.ts`
- **Evidence**: `HeadlessRuntime` runs actions/pieces directly via `EXECUTE_TOOL`, bypassing step executors.

### PR4D: Database Schema Cleanup
- **Goal**: Unregister entities from the ORM and execute table drops.
- **Target File**: `packages/server/api/src/app/database/database-connection.ts` (unregister flow/run/trigger schemas).
- **Migration**: SQL script dropping `flow`, `flow_version`, `flow_run`, `waitpoint`, `folder`, `trigger_event`, `trigger_source`, `app_event_routing`, `project_release`, and `git_repo` tables.
- **Evidence**: Code referencing these schemas has been deleted in PR4A-C.

### PR4E: Core Package Cleanup
- **Goal**: Prune visual flow/run definitions from shared libraries.
- **Target Folders**: `packages/core/execution/src/lib/{flows,flow-run,workers,agents}/` (53 files).
- **Files to Modify**: `packages/core/execution/src/index.ts` and `packages/core/shared/src/index.ts`.
- **Evidence**: Unused typings once all APIs and engine executors are deleted.
