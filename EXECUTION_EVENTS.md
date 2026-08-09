# Execution Events & SSE Architecture — Headless AI Integration Runtime

## 1. Overview & Event Stream Model

Execution progress is streamed in real-time to clients using Server-Sent Events (SSE). It replaces legacy polling of mutable flow run steps with a lightweight event stream.

```
Execution Subsystem ──> Redis / Memory Event Bus ──> SSE Controller ──> Client Stream
```

---

## 2. Event Catalog & Schemas

| Event Type | Trigger | Payload Schema |
| :--- | :--- | :--- |
| `ExecutionStarted` | Prompt execution initiated | `{ executionId, prompt, timestamp }` |
| `PlannerStarted` | AI agent begins planning step | `{ executionId, model, timestamp }` |
| `ToolStarted` | Tool execution dispatched | `{ executionId, toolCallId, pieceName, actionName, input }` |
| `ToolFinished` | Tool execution completed | `{ executionId, toolCallId, output, latencyMs }` |
| `ToolFailed` | Tool execution errored | `{ executionId, toolCallId, error }` |
| `ExecutionCompleted` | Execution finished | `{ executionId, output, totalTokens, durationMs }` |
| `ExecutionFailed` | Execution failed | `{ executionId, error }` |
| `ExecutionCancelled` | Execution cancelled | `{ executionId, reason }` |

---

## 3. Streaming Transport & Guarantees

1. **Ordering & Event IDs**: Every event has a monotonically increasing sequence ID (`id: <executionId>:<seq>`).
2. **Reconnection & Last-Event-ID**: SSE clients pass `Last-Event-ID` header on reconnect. Events are replayed from Redis buffer up to retention window (1 hour).
3. **Backpressure**: High-throughput streams buffer events up to 1,000 items per execution before dropping non-critical progress events (`ToolStarted`).
4. **Idempotency**: Clients use `toolCallId` to deduplicate tool output rendering.
