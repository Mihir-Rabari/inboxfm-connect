# CORE_EXECUTION_AUDIT.md

**Date:** 2026-08-04  
**PR:** PR4E — Core Execution Package Cleanup

---

## Phase 1 — Package Structure

### packages/core/execution/src/lib/

| Directory | Purpose | Initial Classification |
|-----------|---------|------------------------|
| `agents/` | Agent-related (MCP tools) | KEEP |
| `engine/` | Engine runtime contracts | KEEP |
| `flow-run/` | Flow execution | DELETE |
| `flows/` | Flow models and operations | DELETE |
| `workers/` | Worker contracts | AUDIT |

### packages/core/shared/src/lib/

| Directory | Purpose | Initial Classification |
|-----------|---------|------------------------|
| `automation/` | Core automation concepts | KEEP |
| `core/` | Core platform concepts | KEEP |
| `ee/` | Enterprise features | KEEP (except git-repo) |
| `management/` | Management features | KEEP |

---

## Phase 2 — Dependency Analysis

### exports/packages/core/execution/src/index.ts

```
flow
sample-data
flow-version
test-trigger
properties
operations
note
```

### exports/packages/core/execution/src/lib/flows/index.ts

```
flows/actions/action
flows/operations
flows/operations/paste-operations
flows/triggers/trigger
flows/triggers/trigger-events/trigger-events-dto
flows/triggers/trigger-events/trigger-event
flows/triggers/trigger-run
flows/flow-version
flows/flow
flows/dto/count-flows-request
flows/dto/create-flow-request
flows/dto/list-flows-request
flows/dto/flow-mcp.requests
flows/sample-data
flows/folders/folder
flows/folders/folder-requests
flows/util/flow-structure-util
flows/util/flow-piece-util
flows/util/flow-canvas-util
flow-run/dto/list-flow-runs-request
flow-run/execution
flow-run/flow-run
flow-run/test-flow-run-request
flow-run/log-serializer
flow-run/waitpoint
engine
engine/rpc
workers/chat-agent-events
workers/job-data
workers/worker-contract
workers
agents
```

### exports/packages/core/execution/src/lib/agents/index.ts

Types: `AgentOutputField`, `AgentResult`, `AgentPieceProps`, `AgentProviderModel`, `MarkdownContentBlock`, `ToolCallBase`, `ToolCallContentBlock`, `AgentStepBlock`

Enums: `AgentOutputFieldType`, `AgentTaskStatus`, `ContentBlockType`, `ToolCallStatus`, `ExecutionToolStatus`, `ToolCallType`

**Issue:** `ToolCallType.FLOW` is flow-specific and should be removed.

---

## 🚨 STOP CONDITION DETECTED

### Blocker: Flow Types Imported by Strategic Modules

The following strategic modules import flow-specific types from `@inboxfm-connect/core-execution`:

#### 1. MCP (`packages/core/shared/src/lib/automation/mcp/mcp.ts`)

```typescript
import { PopulatedFlow } from '@inboxfm-connect/core-execution'
...
export const PopulatedMcpServer = McpServer.extend({
    flows: z.array(PopulatedFlow),
})
```

**Issue:** MCP cannot be modified (except dead imports). `PopulatedFlow` is flow-specific (REMOVE per task). Cannot delete without breaking MCP.

#### 2. Template (`packages/core/shared/src/lib/management/template/template.ts`)

```typescript
import { FlowVersion, Note } from '@inboxfm-connect/core-execution'
...
export const FlowVersionTemplate = FlowVersion.omit({...})
export const Template = z.object({
    flows: z.array(FlowVersionTemplate).optional(),
})
```

**Issue:** Template imports `FlowVersion` which is flow-specific (REMOVE per task). Cannot delete without breaking Template.

#### 3. Websocket (`packages/core/shared/src/lib/automation/websocket/index.ts`)

```typescript
import { StepRunResponse, UpdateStepProgressRequest } from '@inboxfm-connect/core-execution'
...
export enum WebsocketClientEvent {
    TEST_FLOW_RUN_STARTED = 'TEST_FLOW_RUN_STARTED',
    MANUAL_TRIGGER_RUN_STARTED = 'MANUAL_TRIGGER_RUN_STARTED',
    ...
}
```

**Issue:** Websocket has flow-specific events and imports execution types. May need audit.

### Classification Matrix

| Type | Module | Can Delete? | Reason |
|------|--------|-------------|--------|
| `FlowVersion` | Template | ❌ NO | Breaks Template |
| `PopulatedFlow` | MCP | ❌ NO | Breaks MCP |
| `FlowStatus` | Analytics | ⚠️ UNKNOWN | Needs audit |
| `FlowRunStatus` | Health | ⚠️ UNKNOWN | Needs audit |
| `StepRunResponse` | Websocket | ⚠️ UNKNOWN | Needs audit |
| `RunEnvironment` | Telemetry | ✅ OK | Not flow-specific |

---

## Phase 3 — Safe Deletion Candidates

The following files/directories are NOT referenced by strategic modules and could be deleted:

### packages/core/execution/src/lib/flow-run/

| File/Directory | Status |
|----------------|--------|
| `flow-run.ts` | DELETE candidate |
| `log-serializer.ts` | DELETE candidate |
| `test-flow-run-request.ts` | DELETE candidate |
| `dto/` | DELETE candidate |
| `execution/` | DELETE candidate |
| `waitpoint/` | DELETE candidate - **Waitpoint is explicitly in REMOVE list** |

### packages/core/execution/src/lib/flows/

| File/Directory | Status |
|----------------|--------|
| `flow.ts` | DELETE candidate |
| `flow-version.ts` | DELETE candidate |
| `form.ts` | DELETE candidate |
| `note.ts` | DELETE candidate |
| `test-trigger.ts` | DELETE candidate |
| `actions/` | DELETE candidate |
| `dto/` | DELETE candidate |
| `folders/` | DELETE candidate - **Folders in REMOVE list** |
| `operations/` | DELETE candidate |
| `properties/` | DELETE candidate |
| `sample-data/` | DELETE candidate |
| `triggers/` | DELETE candidate - **Triggers in REMOVE list** |
| `util/` | DELETE candidate |

### packages/core/execution/src/lib/workers/

| File/Directory | Status |
|----------------|--------|
| `chat-agent-events.ts` | ⚠️ AUDIT - May be used by chat |
| `job-data.ts` | ⚠️ AUDIT - Worker payload |
| `worker-contract.ts` | ⚠️ AUDIT - Worker contract |

---

## Phase 4 — Engine Contracts Analysis

### packages/core/execution/src/lib/engine/index.ts

```
engine-operation
engine-contract
requests
engine-constants
execution-errors
ExecutionMode enum
```

**Classification:** ✅ KEEP - These are runtime engine contracts

### packages/core/execution/src/lib/engine/engine-constants.ts

Contains `DEFAULT_MCP_DATA` with flow-related