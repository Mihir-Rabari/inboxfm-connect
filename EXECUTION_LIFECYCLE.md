# Execution Lifecycle — Headless AI Integration Runtime

## 1. Lifecycle State Machine

The headless execution model follows a lean state machine:

```
[ CREATED ] ──> [ RUNNING ] ──┬──> [ COMPLETED ]
                    │         ├──> [ FAILED ]
                    │         └──> [ CANCELLED ]
                    │
           (Tool Calls emit ExecutionEvents,
            no DB status mutation per tool call)
```

### 1.1 State Definitions
1. **CREATED**: The execution request is validated and persisted in PostgreSQL. An execution ID is assigned.
2. **RUNNING**: The AI agent / planner or direct headless execution loop is actively discovering and invoking tools.
3. **COMPLETED**: All planner turns or tool calls completed successfully, and final output is returned.
4. **FAILED**: Execution encountered an unrecoverable failure (e.g. timeout, unhandled error, authorization failure).
5. **CANCELLED**: Execution was explicitly terminated by user request or system backpressure threshold.

---

## 2. State Transition Rules & Persistence

- **State Persistence**: Only primary execution status transitions (`CREATED` → `RUNNING` → `COMPLETED` | `FAILED` | `CANCELLED`) write to the `execution` database table.
- **Tool Call Execution**: Intermediate tool execution states (`ToolStarted`, `ToolFinished`) are recorded in the append-only `tool_call` log and broadcast via SSE `ExecutionEvent` streams without mutating the parent `Execution.status`.
- **Idempotency**: Retrying an execution spawns a new `Execution` record with a `parentExecutionId` trace metadata reference, preserving append-only auditability.

---

## 3. Operational Aspects

### 3.1 Timeout
- Default tool execution timeout: 60 seconds (per sandbox run).
- Default total execution timeout: 300 seconds (configurable per platform/project).
- Upon timeout expiry, sandbox terminates process, updates `Execution.status` to `FAILED` with code `EXECUTION_TIMEOUT`.

### 3.2 Cancellation
- Executions can be cancelled via `POST /v1/executions/:id/cancel`.
- Cancellation posts an abort signal to active sandbox instances and updates status to `CANCELLED`.

### 3.3 Partial Failure Handling
- Individual `ToolCall` failures do NOT immediately fail the entire `Execution` if the AI Planner is configured to handle tool errors gracefully.
- The planner receives the `ToolCallResult` with `status: FAILED` and decides whether to retry, pick an alternative tool, or abort execution.

### 3.4 Token Usage, Cost, and Observability
- Each execution records total consumed LLM tokens (`promptTokens`, `completionTokens`).
- Cost estimation is computed post-execution based on model pricing metadata and stored on the `Execution` entity.
- OpenTelemetry spans are generated across API, Planner, Sandbox, and Engine boundaries using `executionId` as trace root.
