# PR8 Implementation Plan — Headless Runtime Architecture

## 1. Staged Execution Plan Overview

PR8 establishes the full implementation blueprint to transition InboxFM Connect to a headless AI integration runtime across 10 sequential PR phases (PR8A through PR8J).

---

## 2. Detailed PR Breakdown

### Phase 1: PR8A — Execution Domain Core
- **Objective**: Introduce `Execution`, `ExecutionStatus`, `ExecutionRequest`, and `ExecutionResult` entities and database schemas.
- **Files Affected**:
  - `packages/core/shared/src/lib/execution/` (New)
  - `packages/server/api/src/app/database/migration/` (New migration)
  - `packages/server/api/src/app/execution/` (New service/controller)
- **Database Changes**: Create `execution` table.
- **API Changes**: Add `POST /v1/executions`, `GET /v1/executions/:id`.
- **Tests**: Vitest entity & integration tests.
- **Rollback**: Drop `execution` table.

### Phase 2: PR8B — ToolCall Persistence
- **Objective**: Implement append-only `ToolCall` entity and repository.
- **Files Affected**:
  - `packages/core/shared/src/lib/tool-call/` (New)
  - `packages/server/api/src/app/tool-call/` (New)
- **Database Changes**: Create `tool_call` table.
- **API Changes**: `GET /v1/executions/:id/tool-calls`.
- **Tests**: Append-only lock verification tests.

### Phase 3: PR8C — Execution Events & SSE Streaming
- **Objective**: Implement real-time SSE streaming for execution progress.
- **Files Affected**:
  - `packages/server/api/src/app/execution/execution-event.service.ts` (New)
  - `packages/server/api/src/app/execution/execution-sse.controller.ts` (New)
- **API Changes**: `GET /v1/executions/:id/events` (SSE).
- **Verification**: Local SSE stream benchmark.

### Phase 4: PR8D — TriggerBinding & Integration Lifecycle Rework
- **Objective**: Decouple `trigger-helper.ts` from `FlowVersion`; introduce `TriggerBinding`.
- **Files Affected**:
  - `packages/server/api/src/app/triggers/trigger-binding.service.ts`
  - `packages/server/api/src/app/helper/trigger-helper.ts`
- **Database Changes**: Create `trigger_binding` table.
- **Tests**: Test `ON_ENABLE`, `ON_DISABLE`, `RENEW`, `RUN` hooks with `TriggerBinding`.

### Phase 5: PR8E — 3-Plane Scheduler Rework
- **Objective**: Partition scheduler into System Jobs, User Tasks, and Trigger Schedules. Remediation of Defect B.
- **Files Affected**:
  - `packages/server/api/src/app/scheduler/`
  - `packages/server/api/src/app/helper/system-jobs.ts`
- **Verification**: Verify error logging in `LocalScheduler` / `BullMQScheduler`.

### Phase 6: PR8F — Sandbox FlowVersion Decoupling
- **Objective**: Replace legacy `FlowVersion` sandbox params with `ToolExecutionRequest` / `ToolExecutionResult`.
- **Files Affected**:
  - `packages/server/engine/src/lib/helper/piece-helper.ts`
  - `packages/runtime/src/index.ts`
  - `packages/sandbox/src/`
- **Remediation**: Fix Defect A worker index serialization in `user-interaction-watcher.ts`.

### Phase 7: PR8G — Evaluator Extraction (ExpressionEvaluator)
- **Objective**: Extract `ExpressionEvaluator` from V8 sandbox isolate for property interpolation; delete arbitrary code execution pipeline.
- **Files Affected**:
  - `packages/server/engine/src/lib/handler/context/props-resolver.ts`
  - Delete legacy code sandbox bundler files.

### Phase 8: PR8H — Knowledge Search Promotion
- **Objective**: Promote Knowledge Search to first-class planner/runtime component.
- **Files Affected**:
  - `packages/server/api/src/app/knowledge-search/`
- **Verification**: Test pgvector + semantic search + tau gate.

### Phase 9: PR8I — MCP Headless Finalization
- **Objective**: Ensure all MCP tool calls route directly through `HeadlessRuntime.execute()`.
- **Files Affected**:
  - `packages/server/api/src/app/mcp/`

### Phase 10: PR8J — Core Execution Legacy Cleanup
- **Objective**: Remove obsolete contracts, dead router/loop/flow types from `@inboxfm-connect/execution` and `@inboxfm-connect/shared`.
- **Files Affected**:
  - `packages/core/execution/src/`
  - `packages/core/shared/src/`
- **Verification**: `npm run lint-dev`, `npm run test-unit`, `npm run test-api`.
