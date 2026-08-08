# EXECUTION_MODEL

**Companion to `ADR-001_HEADLESS_RUNTIME.md` — Decisions 1, 4, 7.**
The `Execution` abstraction, the event system, and what replaces Sample Data.
Design document. No code changed.

---

## 1. Why `FlowRun` cannot become `Execution` by renaming

`FlowRun` encodes the assumption of a known graph *structurally*, not incidentally:

| `FlowRun` construct | Assumption it encodes | Status in an AI-native runtime |
|---|---|---|
| `steps: Record<string, StepOutput>` | Steps have stable, author-assigned names (`step_1`, `trigger`) that exist before execution | **No referent.** No human named anything |
| `ExecutionPath: readonly [string, number][]` | A position inside nested loops must be addressable | **No referent.** No graph, no position |
| `pauseMetadata` keyed to a step | Resumption re-enters the graph at a known node | **Wrong shape.** Resumption re-enters the *planner*, after an approved tool call |
| `tasks: number` | Billing counts steps executed | **Wrong unit.** Cost is dominated by tokens |
| `FlowRunStatus.PAUSED` | The graph is parked mid-traversal | **Wrong meaning.** Needs `AWAITING_APPROVAL` |
| `flowVersionId` | The run is an instance of an authored definition | **No referent.** Nothing was authored |

Six of six load-bearing fields are wrong. A rename would preserve the graph assumption inside a new
word and, worse, would look finished.

**What must be preserved** is the set of *services* FlowRun provided — identity, retry, cancel,
timeout, progress, accounting, audit. Those are all real, and several are more important here than
they were in a workflow product, because the user did not author the actions being taken against
their real accounts.

---

## 2. `Execution` — the turn

One `Execution` is **one prompt-to-result turn**, or one direct tool invocation.

```ts
type Execution = {
    id: string
    projectId: string
    platformId: string

    trigger: ExecutionTrigger        // what caused this turn
    input: ExecutionInput            // prompt text, or a direct ToolInvocation

    status: ExecutionStatus
    output?: unknown                 // final answer or tool result
    error?: ExecutionError

    // control
    idempotencyKey?: string          // dedupes retried submissions
    deadlineAt: string               // absolute, not a duration
    cancelledAt?: string
    parentExecutionId?: string       // sub-agent / delegated turns

    // accounting
    usage: ExecutionUsage

    startedAt: string
    finishedAt?: string
}

type ExecutionTrigger =
    | { kind: 'api' }                            // POST /v1/execute or /v1/prompt
    | { kind: 'mcp', clientId: string }
    | { kind: 'trigger', triggerId: string }     // see TRIGGER_MODEL.md
    | { kind: 'schedule', triggerId: string }

type ExecutionInput =
    | { kind: 'prompt', text: string, agentId?: string, history?: MessageRef[] }
    | { kind: 'tool', invocation: ToolInvocation }

type ExecutionStatus =
    | 'QUEUED'
    | 'PLANNING'
    | 'EXECUTING'
    | 'AWAITING_APPROVAL'
    | 'SUCCEEDED'
    | 'FAILED'
    | 'CANCELLED'
    | 'TIMED_OUT'

type ExecutionUsage = {
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    toolCallCount: number
    plannerRoundTrips: number
    durationMs: number
}
```

**Design notes.**

- `deadlineAt` is absolute, not a duration. A duration cannot survive a queue delay or a suspension
  for approval; every retry silently extends the budget. An absolute deadline propagates correctly
  into per-tool timeouts (`min(toolTimeout, deadlineAt - now)`).
- `idempotencyKey` is not optional in practice. A planner retry, a webhook redelivery, and a
  double-tapped mobile button all produce the same "send the invoice" request. In a workflow product
  a duplicate run was an annoyance; here it is a duplicate real-world side effect.
- `usage` is flat and additive so it aggregates cheaply for billing without touching `ToolCall`.
- `parentExecutionId` reserves sub-agent delegation without designing it now. It costs one nullable
  column and avoids a migration later.

---

## 3. `ToolCall` — the decision

Each planner decision to invoke a tool is one append-only row.

```ts
type ToolCall = {
    id: string
    executionId: string
    seq: number                      // monotonic within the execution; the ordering key

    integration: string
    integrationVersion: string
    tool: string
    connectionId?: string

    input: Record<string, unknown>   // resolved arguments, post-validation
    output?: unknown
    error?: ToolCallError

    status: 'PENDING' | 'AWAITING_APPROVAL' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED'

    attempt: number                  // retries of the same logical call
    approval?: { requestedAt: string, resolvedAt?: string, by?: string, decision?: 'allow' | 'deny' }

    startedAt: string
    finishedAt?: string
    durationMs?: number
}
```

**Why a separate table, not a JSON column on `Execution`.**

1. `Execution.output` would grow unboundedly, and every progress write would rewrite the whole row —
   the exact O(n²) pathology of `UpdateRunProgressRequest` (`requests.ts:73`), reproduced in the
   database instead of on the wire.
2. Tool calls are the unit of every question worth asking: *which integrations does this project
   actually use? what is the p95 latency of the Slack post action? which tools fail most? what did
   this agent do to my Gmail last week?* Those are indexed queries against rows, not JSON scans.
3. Approval is per-call, not per-execution. An execution may read three things freely and need
   consent for the fourth.
4. Retention differs. `Execution` rows are cheap and worth keeping long; `ToolCall.output` can hold
   large payloads and needs its own truncation and TTL policy.

**Ordering by `seq`, not timestamp.** Parallel tool calls (a planner fanning out three reads) share a
wall-clock instant. `seq` is the stable ordering and the cursor for event replay.

---

## 4. The event system

### 4.1 Envelope

```ts
type ExecutionEvent = {
    executionId: string
    seq: number                  // monotonic, gapless, per execution — the resume cursor
    at: string
    type: ExecutionEventType
    data: unknown                // discriminated by `type`
}
```

### 4.2 Taxonomy

| Event | Emitted when | Payload |
|---|---|---|
| `ExecutionStarted` | Execution accepted | `{ trigger, inputSummary, deadlineAt }` |
| `PlannerThought` | Planner emits reasoning | `{ text }` — streamed, user-visible |
| `PlannerPlanned` | Planner commits to a tool | `{ toolCallId, integration, tool, rationale }` |
| `ApprovalRequested` | Policy requires consent | `{ toolCallId, integration, tool, input, reason }` |
| `ApprovalResolved` | Consent given or refused | `{ toolCallId, decision, by }` |
| `ToolStarted` | Invocation dispatched | `{ toolCallId, integration, tool, connectionId }` |
| `ToolFinished` | Invocation succeeded | `{ toolCallId, durationMs, outputSummary }` |
| `ToolFailed` | Invocation failed | `{ toolCallId, durationMs, error, retryable }` |
| `OutputDelta` | Final answer streaming | `{ text }` |
| `ExecutionFinished` | Sealed successfully | `{ output, usage }` |
| `ExecutionFailed` | Terminal failure | `{ error, usage }` |
| `ExecutionCancelled` | Cancelled by caller | `{ at, by }` |

`PlannerThought` is what makes the UX literally match the brief — *"Executing Gmail tool…",
"Searching Notion…", "Generating response…"* are `PlannerThought` and `ToolStarted` rendered.

**Payload discipline.** `ToolFinished` carries `outputSummary`, not the full output. A tool can return
megabytes; the stream must stay small and the full payload is fetchable from `ToolCall`. This is the
single most important lesson from the old implementation.

### 4.3 Transport

```
GET /v1/executions/:id/events        Accept: text/event-stream
                                     Last-Event-ID: <seq>       (resume)
```

SSE over websockets, deliberately:

| | Websocket (old) | SSE (new) |
|---|---|---|
| Direction | bidirectional (unneeded — control actions are their own endpoints) | unidirectional, matching the actual need |
| Resume | manual; reconnect loses history | native `Last-Event-ID` |
| Proxies | frequently needs special handling | plain HTTP |
| Dependency | `socket.io-client` — currently a dep of `core/execution` for `rpc.ts` alone | none |
| Backpressure | application-managed | HTTP-native |

Control actions stay as ordinary endpoints: `POST /v1/executions/:id/cancel`,
`POST /v1/executions/:id/approvals/:toolCallId`.

### 4.4 Events are the write-ahead log

Events and `ToolCall` rows are the same information at two granularities. `ToolStarted` opens a row;
`ToolFinished` / `ToolFailed` closes it. Persisting events and deriving rows — rather than writing
rows and separately emitting events — gives one ordering, one source of truth, and free replay.

Retention: events at full fidelity for a short window (default 7 days, tunable), `Execution` and
`ToolCall` rows for the billing/audit window. Late subscribers replay persisted events from `seq = 0`;
there is no live-only history.

### 4.5 Versus the Activepieces implementation

| Dimension | Activepieces | InboxFM Connect |
|---|---|---|
| Contract | `UpdateRunProgressRequest` (`requests.ts:73`) — `flowRun: Omit<FlowRun,'steps'>` + one step | `ExecutionEvent` — one delta |
| Payload growth | O(n²): whole run object per step | O(n) |
| Validation | none. `rpc.ts` is `Record<string, (input: any) => any>` with two eslint-disabled `any`s; a shape change yields `undefined`, not an error | zod-validated envelope |
| Route | posts to `v1/engine/run-progress` — **no server route exists** | served endpoint |
| Consumers | `engine-run-api.ts`, itself with **0 importers** — the whole channel is dead | live |
| Semantics | "step 3 of 7 finished" — meaningful only because the user drew the graph | "I decided to read Gmail, here is why" |

The old system is not merely legacy; it is **already non-functional**. Deleting it removes nothing
that works. Verified: a grep of `packages/server/api/src/app` for `run-progress`, `step-progress`,
`run-logs`, and `flow-response` returns zero matches.

---

## 5. Control semantics

### Retry — two distinct mechanisms, deliberately not unified

| Kind | Scope | Who decides | Records |
|---|---|---|---|
| **Tool retry** | one `ToolCall` | runtime, on `retryable` errors (429, 5xx, transport) | `attempt` increments on the same row |
| **Re-plan** | the turn | the planner, after seeing a failure | a *new* `ToolCall` with a new `seq` |

Collapsing these would lose the distinction between "the network flaked" and "the model changed its
mind" — the two most important things to tell apart when debugging an agent.

Idempotency: tool retries are only automatic for tools declared side-effect-free. A retryable
transport error on a *write* still surfaces to the planner, because "the POST may or may not have
landed" is a decision an LLM should make with context, not one a retry loop should make blindly.

### Cancellation

`POST /v1/executions/:id/cancel` sets `cancelledAt` and trips the cancellation token. Effects:
the planner loop exits before its next round trip; an in-flight tool call is allowed to finish
(its side effect has already been initiated — killing the socket does not un-send the Slack message)
and is recorded; no *new* tool calls are dispatched. `ExecutionCancelled` is emitted.

Honest cancellation semantics matter here more than in a workflow product: the user is often
cancelling *because* they saw `ToolStarted` for something they did not want.

### Timeouts

Three levels, all derived from the absolute `deadlineAt`:

| Level | Default | On expiry |
|---|---|---|
| Execution | 300 s | `TIMED_OUT` |
| Per tool call | 60 s, clamped to remaining execution budget | `ToolFailed(timeout)`, planner may re-plan |
| Planner round trip | 120 s | `ToolFailed`-equivalent for the planner step |

Today the per-tool timeout is hardcoded twice: `runtime/src/index.ts:48` and
`user-interaction-watcher.ts:56`, both `60`. It must become a parameter.

### Suspension for approval

`AWAITING_APPROVAL` suspends *between* tool calls, never inside one. Planner state is serialized to
the execution record; there is no in-memory continuation to keep alive, so an approval can outlive a
process restart. This is why approval is bounded to a single execution and why a general durable
state machine is a non-goal — the only suspension point in the model is a decision boundary the
planner already reaches naturally.

Approvals expire (default 24 h) into `CANCELLED`, not `FAILED`. An unanswered consent prompt is not
an error.

---

## 6. Sample Data — what happens to each of the four things

| Concept | Actually is | Verdict | Action |
|---|---|---|---|
| `SampleDataSettings`, `sampleDataFileId` | **Workflow.** Stored per step so the canvas could offer last-output fields for drag-and-drop mapping | **DELETE** | No canvas, no mapping problem |
| `StepRunResponse` | **Workflow.** A step test result, carried by dead `UploadRunLogsRequest`; re-exported via `shared/lib/automation/websocket` | **DELETE** | Goes with the B1 contracts; remove the re-export too |
| `ExecutionPath` | **Workflow.** `[stepName, iteration][]` addressing a node inside nested loops | **DELETE** | No graph |
| `ExecutePropsOptions.sampleData` | **Execution.** The resolved input context a dependent dropdown reads. **Live** on `EXECUTE_PROPERTY` | **KEEP, RENAME** → `resolvedInput` | Not sample data at all — misnamed after the builder feature that used to fill it |

The fourth row is the trap: a sweep that greps for "sampleData" and deletes the hits would break every
dependent dropdown, which is the mechanism MCP's capability tools depend on
(`ap-get-piece-props.ts:160`, `ap-resolve-property-chain.ts:67`, `mcp-utils.ts:613`).

### The testing capability, relocated

"What would this tool call do?" is genuinely valuable — for developers integrating against the API,
and for the planner as a cheap pre-flight on a destructive call. It is a **verb**, not a stored
artifact:

```
POST /v1/execute   { ..., "dryRun": true }
  → resolves the connection (proves auth works)
  → applies processors and validators (proves the input is well-formed)
  → returns the resolved invocation and any validation errors
  → does NOT call the integration
```

Zero new storage, zero new entities. The validation half already exists —
`propsProcessor.applyProcessorsAndValidators()` at `piece-helper.ts:219` — and `dryRun` simply stops
before `pieceAction.run(context)` at line 220.

---

## 7. Accounting

Two cost dimensions, tracked separately because they price differently and scale differently:

| Dimension | Source | Why |
|---|---|---|
| **Tokens** | planner round trips | Dominant cost. Input/output/cache-read priced differently by every provider |
| **Tool calls** | `ToolCall` rows | Proxy for third-party rate limits and infrastructure cost; the sandbox is the expensive part |

Aggregation is by `projectId` and `platformId` over `Execution.usage`, which is why `usage` is flat
and additive rather than nested. `FlowRun.tasks` — steps executed — has no successor; it measured a
graph traversal and priced the wrong thing for this product.

---

## 8. Migration

Ordered so nothing is deleted before its replacement exists, and nothing is built on a foundation
that is about to move.

| Step | Action | Depends on |
|---|---|---|
| 1 | Delete `engine-run-api.ts` and the four dead run-reporting contracts | nothing — all have 0 live consumers |
| 2 | Remove the `StepRunResponse` / `UpdateStepProgressRequest` re-exports from `shared/lib/automation/websocket` | 1 |
| 3 | Add `Execution` + `ToolCall` entities; **register in `getEntities()`**; migration | nothing |
| 4 | Emit events from the existing `POST /v1/execute` path (single-`ToolCall` executions) | 3 |
| 5 | Add the SSE endpoint and control endpoints | 4 |
| 6 | Delete `FlowRun`, `StepOutput`, `GenericStepOutput`, `FlowRunStatus`, `ExecutionPath`, `FailedStep` | 1, 2 |
| 7 | Rename `sampleData` → `resolvedInput`; drop `ExecutePropsOptions.flowVersion?` | nothing |
| 8 | Add `dryRun` | 4 |

Step 4 is the important one: wiring events into the *existing, working* single-tool path before the
planner exists means the event system is proven against real traffic before anything depends on it.
