# PR8B Implementation Record — ToolCall Persistence & Append-Only Execution Ledger

## 1. Executive Summary

PR8B implements the append-only **ToolCall** persistence layer for InboxFM Connect. A `ToolCall` represents a single, concrete invocation of an integration tool during an `Execution`. It models dynamic AI tool discovery and execution, completely independent of legacy visual workflow graphs or static DAG steps.

---

## 2. Files Created & Modified

### Created Files
1. [`packages/core/shared/src/lib/execution/tool-call.ts`](file:///K:/Projects/activepieces/packages/core/shared/src/lib/execution/tool-call.ts): `ToolCall` schema, `ExecutionToolCallStatus` enum, `ToolCallError` schema, and transition validator `toolCallUtils`.
2. [`packages/core/shared/src/lib/execution/dto/tool-call-requests.ts`](file:///K:/Projects/activepieces/packages/core/shared/src/lib/execution/dto/tool-call-requests.ts): DTO schemas for ToolCall creation, state transitions, and querying.
3. [`packages/server/api/src/app/execution/tool-call/tool-call-entity.ts`](file:///K:/Projects/activepieces/packages/server/api/src/app/execution/tool-call/tool-call-entity.ts): TypeORM `ToolCallEntity` definition with foreign-key relations to `Execution` and `Project`.
4. [`packages/server/api/src/app/execution/tool-call/tool-call.service.ts`](file:///K:/Projects/activepieces/packages/server/api/src/app/execution/tool-call/tool-call.service.ts): Domain service enforcing append-only lifecycle transitions (`createPending`, `markRunning`, `markSucceeded`, `markFailed`, `listForExecution`).
5. [`packages/server/api/src/app/database/migration/postgres/1809000000000-AddToolCallTable.ts`](file:///K:/Projects/activepieces/packages/server/api/src/app/database/migration/postgres/1809000000000-AddToolCallTable.ts): TypeORM migration creating `tool_call` table.
6. [`packages/server/api/test/unit/app/execution/tool-call.service.test.ts`](file:///K:/Projects/activepieces/packages/server/api/test/unit/app/execution/tool-call.service.test.ts): Unit tests verifying status transition state machine and forbidden-field policy.

### Modified Files
1. [`packages/core/shared/src/lib/execution/index.ts`](file:///K:/Projects/activepieces/packages/core/shared/src/lib/execution/index.ts): Re-exported `tool-call` and `tool-call-requests`.
2. [`packages/server/api/src/app/execution/execution.controller.ts`](file:///K:/Projects/activepieces/packages/server/api/src/app/execution/execution.controller.ts): Exposed `GET /v1/executions/:id/tool-calls`.
3. [`packages/server/api/src/app/database/database-connection.ts`](file:///K:/Projects/activepieces/packages/server/api/src/app/database/database-connection.ts): Registered `ToolCallEntity` in `getEntities()`.

### Files Deliberately Untouched
- `1807000000000-DropWorkflowTables.ts` (Immutable historical migration)
- `1808000000000-AddExecutionTable.ts` (PR8A migration)
- MCP, Sandbox, Scheduler, Trigger, and AI Planner files (scoped for later PR8 phases)

---

## 3. ToolCall Schema & Forbidden-Fields Confirmation

```ts
export type ToolCall = {
    id: ApId
    created: string
    updated: string
    executionId: string
    projectId: string
    pieceName: string
    pieceVersion: string
    actionName: string
    connectionId: string | null
    input: Record<string, unknown>
    output: unknown | null
    status: ExecutionToolCallStatus // PENDING, RUNNING, SUCCEEDED, FAILED
    error: ToolCallError | null
    latencyMs: number | null
    finished: string | null
}
```

### Forbidden-Fields Audit
Verified that `ToolCall` contains **NONE** of the following legacy graph fields:
- ❌ `flowId`
- ❌ `flowVersionId`
- ❌ `flowRunId`
- ❌ `stepName`
- ❌ `stepIndex`
- ❌ `nodeId`
- ❌ `routerPath`
- ❌ `loopIteration`

---

## 4. Lifecycle & Transition Rules

Allowed Transitions:
- `PENDING` → `RUNNING`, `SUCCEEDED`, `FAILED`
- `RUNNING` → `SUCCEEDED`, `FAILED`

Terminal States:
- `SUCCEEDED` → None (Terminal)
- `FAILED` → None (Terminal)

Arbitrary historical CRUD (e.g. `DELETE /tool-calls/:id` or arbitrary `PATCH`) is strictly forbidden and unexposed.

---

## 5. Database Schema & Migration

```sql
CREATE TABLE IF NOT EXISTS "tool_call" (
    "id" character varying(21) NOT NULL,
    "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    "executionId" character varying(21) NOT NULL,
    "projectId" character varying(21) NOT NULL,
    "pieceName" character varying NOT NULL,
    "pieceVersion" character varying NOT NULL,
    "actionName" character varying NOT NULL,
    "connectionId" character varying(21),
    "input" json NOT NULL DEFAULT '{}',
    "output" json,
    "status" character varying NOT NULL,
    "error" json,
    "latencyMs" numeric,
    "finished" TIMESTAMP WITH TIME ZONE,
    CONSTRAINT "pk_tool_call_id" PRIMARY KEY ("id")
);

CREATE INDEX "idx_tool_call_execution_id" ON "tool_call" ("executionId");
CREATE INDEX "idx_tool_call_project_id" ON "tool_call" ("projectId");
CREATE INDEX "idx_tool_call_created" ON "tool_call" ("created");
```

---

## 6. API Endpoint

- **Endpoint**: `GET /v1/executions/:id/tool-calls`
- **Security**: `securityAccess.project(...)` requiring `Permission.READ_RUN`.
- **Response**: Array of `ToolCall` objects sorted chronologically (`created ASC`).

---

## 7. Security & Sanitization
- Credentials (OAuth tokens, API keys, passwords) are **never** persisted in `tool_call`. `connectionId` references are stored instead.
- `input` and `output` JSON payloads are sanitized via `sanitizeObjectForPostgresql()` prior to persistence to strip PostgreSQL incompatible characters.

---

## 8. Verification Results
- `@inboxfm-connect/shared` built clean (100% success).
- `tool-call.service.test.ts` verified state transitions & forbidden field policy.
- Zero legacy migrations were modified.
