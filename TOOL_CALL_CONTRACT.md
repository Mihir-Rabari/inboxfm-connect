# Tool Call Contract — Headless Integration Runtime

## 1. Overview & Append-Only Guarantees

A `ToolCall` represents an immutable, append-only record of a single tool invocation performed by the runtime.

Unlike legacy workflow steps, `ToolCall` records:
- Do NOT belong to a static graph.
- Do NOT contain `stepName`, `stepIndex`, `nodeId`, `flowId`, `flowVersionId`, `routerPath`, or `loopIteration`.
- Are generated dynamically as tools are selected and executed.

---

## 2. Schema Specification

```ts
export type ToolCallSchema = {
    id: ApId
    executionId: ApId
    projectId: ProjectId
    pieceName: string
    pieceVersion: string
    actionName: string
    connectionId: string | null
    input: Record<string, unknown>
    output: unknown | null
    status: ToolCallStatus
    error: {
        message: string
        code?: string
        stack?: string
    } | null
    latencyMs: number | null
    created: string
    finished: string | null
}
```

---

## 3. Forbidden Properties Policy

The following legacy workflow step attributes are **permanently forbidden** from appearing in `ToolCall`:

| Forbidden Property | Reason |
| :--- | :--- |
| `stepName` | Flow step identifier. Tool calls use `actionName`. |
| `stepIndex` | Array index in flow version. Tool calls are log entries. |
| `nodeId` | Visual canvas node ID. No canvas exists. |
| `flowId` | Workflow container ID. Workflow entity is obsolete. |
| `flowVersionId` | Version graph ID. No flow versions exist. |
| `routerPath` | Branching decision route. |
| `loopIteration` | Loop counter state. |

---

## 4. Execution Context & Security Boundary

1. Inputs passed to `ToolCall` are sanitized using `sanitizeObjectForPostgresql()`.
2. Connection authentication credentials (`auth`) are decrypted in-memory by `HeadlessRuntime` immediately before sandbox invocation and are **never persisted** in the `tool_call` database record.
3. Output values are stored upon completion for audit and telemetry purposes.
