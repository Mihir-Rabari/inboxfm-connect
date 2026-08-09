# Execution Domain Design — Headless AI Integration Runtime

## 1. Domain Principles
InboxFM Connect is an AI-native integration runtime. Execution represents a dynamic invocation of an AI agent or headless runtime request, resulting in runtime-discovered tool calls.

The model eliminates all legacy graph-oriented structures:
- NO `steps[]` array inside Execution
- NO `stepName`, `stepIndex`, `nodeId`, `flowId`, `flowVersionId`, `routerPath`, `loopIteration`
- NO DAG/graph execution state

---

## 2. Core Entities & Contracts

### 2.1 Execution
- **Purpose**: Represents a top-level invocation of the AI runtime / prompt execution.
- **Fields**:
  - `id`: `ApId` (Primary key)
  - `projectId`: `ProjectId`
  - `platformId`: `PlatformId`
  - `userId`: `UserId` (Optional, caller identity)
  - `status`: `ExecutionStatus`
  - `prompt`: `string` (Original user/system prompt or trigger context)
  - `metadata`: `Record<string, unknown>` (Trace ID, caller context)
  - `tokenUsage`: `{ promptTokens: number; completionTokens: number; totalTokens: number }`
  - `cost`: `number` (Estimated execution cost in USD)
  - `created`: `string` (ISO timestamp)
  - `updated`: `string` (ISO timestamp)
  - `finishTime`: `string | null` (ISO timestamp)
- **Lifecycle**: `CREATED` → `RUNNING` → `COMPLETED` | `FAILED` | `CANCELLED`
- **Owner**: `packages/server/api` / Execution Module
- **Persistence**: PostgreSQL `execution` table
- **API Exposure**: `POST /v1/executions`, `GET /v1/executions/:id`
- **Process Boundary**: API Server → Worker Node
- **Sandbox Boundary**: Orchestrates tool runs; does not enter sandbox directly.
- **MCP Boundary**: Triggered via MCP prompt invocation or API request.

### 2.2 ExecutionStatus (Enum)
- **Values**:
  - `CREATED`: Initialized, queued for processing.
  - `RUNNING`: Agent planner or direct tool execution active.
  - `COMPLETED`: Execution finished successfully.
  - `FAILED`: Execution terminated with error.
  - `CANCELLED`: Interrupted by caller or timeout.
- **Owner**: `@inboxfm-connect/shared`

### 2.3 ExecutionRequest
- **Purpose**: Transport DTO for initiating an execution.
- **Fields**:
  - `projectId`: `ProjectId`
  - `platformId`: `PlatformId`
  - `prompt`: `string`
  - `connectionIds`: `string[]` (Pre-authorized connections)
  - `metadata`: `Record<string, unknown>`
- **Owner**: `@inboxfm-connect/shared`
- **API Exposure**: Body of `POST /v1/execute` and `POST /v1/executions`

### 2.4 ExecutionResult
- **Purpose**: Final payload returned upon completion of an execution.
- **Fields**:
  - `executionId`: `ApId`
  - `status`: `ExecutionStatus`
  - `output`: `unknown` (Response content or summary)
  - `error`: `{ code: string; message: string } | null`
  - `tokenUsage`: `{ promptTokens: number; completionTokens: number; totalTokens: number }`
  - `durationMs`: `number`
- **Owner**: `@inboxfm-connect/shared`

### 2.5 ToolCall
- **Purpose**: Represents a single concrete tool call executed by the runtime.
- **Fields**:
  - `id`: `ApId`
  - `executionId`: `ApId`
  - `projectId`: `ProjectId`
  - `pieceName`: `string` (Integration identity)
  - `pieceVersion`: `string`
  - `actionName`: `string` (Tool identity)
  - `connectionId`: `string | null`
  - `input`: `Record<string, unknown>`
  - `output`: `unknown | null`
  - `status`: `ToolCallStatus`
  - `error`: `{ message: string; code?: string } | null`
  - `latencyMs`: `number | null`
  - `created`: `string`
  - `finished`: `string | null`
- **Lifecycle**: `PENDING` → `RUNNING` → `SUCCEEDED` | `FAILED`
- **Owner**: Execution Module / Sandbox
- **Persistence**: PostgreSQL `tool_call` table (Append-only)
- **API Exposure**: `GET /v1/executions/:id/tool-calls`

### 2.6 ToolCallStatus (Enum)
- **Values**: `PENDING`, `RUNNING`, `SUCCEEDED`, `FAILED`
- **Owner**: `@inboxfm-connect/shared`

### 2.7 ToolCallResult
- **Purpose**: Response from executing a single tool inside the engine/sandbox.
- **Fields**:
  - `toolCallId`: `ApId`
  - `status`: `ToolCallStatus`
  - `output`: `unknown`
  - `error`: `{ message: string; stack?: string } | null`
  - `latencyMs`: `number`
- **Owner**: `@inboxfm-connect/shared`

### 2.8 ExecutionEvent
- **Purpose**: Ephemeral stream payload for SSE progress updates.
- **Fields**:
  - `id`: `string` (Event sequence ID)
  - `executionId`: `ApId`
  - `type`: `ExecutionEventType`
  - `timestamp`: `string`
  - `payload`: `Record<string, unknown>`
- **Owner**: `@inboxfm-connect/shared`

---

## 3. Standard TypeScript Export Ordering Notice
In compliance with project standards, all exported types and constants are located at the end of module files following all runtime logic.
