# ADR-001 — InboxFM Connect is an AI-Native Headless Integration Runtime

**Status:** Proposed
**Date:** 2026-08-07
**Supersedes:** the implicit architecture inherited from Activepieces
**Answers:** `PR7_BLOCKERS.md` B1–B6
**Scope:** decisions only. No code was changed to produce this document.

---

## 0. Context

Seven prior PRs removed the visual layer: builder, canvas, flow CRUD, flow APIs, trigger APIs,
router/loop executors, and the flow runtime. `HEADLESS_RUNTIME_BOUNDARY.md` certified that the
`Connection → Integration → Tool → Result` path is real, routed, and free of workflow types end to end
(`app.ts:205` → `execute.controller.ts:53` → `runtime/src/index.ts:31` → `sandbox.ts:24` →
`engine/src/lib/operations/index.ts:14` → `piece-helper.ts:204`).

What survived that removal is a set of abstractions that are *reachable* but no longer *justified*.
PR7 correctly refused to decide their fate, because the question is not "does anything import this?" —
it is "does the product need this?" PR7 ended on six open blockers and one observation:

> B1, B3, and B4 are the same question in three places: **does the headless platform keep any notion
> of a multi-step run?** — `PR7_BLOCKERS.md`

This ADR answers that question, and the nine others.

### The product, stated precisely

InboxFM Connect executes natural-language intent against authenticated third-party systems.

```
Prompt → Planner → Retrieval → Tool Selection → Execution → Sandbox → Tool Calls → Result
```

Three properties of this model drive every decision below:

1. **The step sequence is not known before execution begins.** A workflow's shape is authored; an
   agent's shape is discovered at runtime. Every abstraction that assumes a pre-declared graph is
   wrong here, not merely unused.
2. **The user did not author the actions.** They typed a sentence. Accountability, visibility, and
   approval are therefore *stronger* product requirements than in a workflow tool, not weaker.
3. **The unit of work is a turn, not a traversal.** One prompt in, one result out, with an
   unbounded and non-deterministic number of tool calls between.

---

## 1. The central answer

> **Does the headless platform keep any notion of a multi-step run?**

**Yes — emphatically. But `FlowRun` is not it, and cannot be adapted into it.**

A `FlowRun` is the serialized state of *one traversal of a known graph*. Its schema encodes that
assumption structurally: `steps` is a map keyed by author-assigned static names (`step_1`, `trigger`),
and `ExecutionPath` is a `readonly [string, number][]` of `(stepName, iteration)` pairs whose only
purpose is to address a position inside nested loops. Neither construct has a referent in an AI-native
runtime. There are no static step names because no human named the steps. There are no loop
iterations because a loop is just the planner deciding to call a tool again.

An AI-native runtime needs the *services* FlowRun provided — identity, retries, cancellation,
timeouts, progress, accounting, audit — attached to a fundamentally different shape: an **append-only
sequence of decisions and their consequences**, not a **keyed map over a declared structure**.

Renaming `FlowRun` to `Execution` would preserve the graph assumption inside a new word. That is the
single worst outcome available, because it would look finished. The decision is therefore **DELETE
`FlowRun`, CREATE `Execution` + `ToolCall`** — a new abstraction at a different granularity, detailed
in `EXECUTION_MODEL.md`.

---

## 2. The ten decisions

Each decision states the verdict, the product justification, and the evidence. Full designs live in
the companion documents.

---

### Decision 1 — Execution — **REPLACE**

`FlowRun` → `Execution` (turn) + `ToolCall` (decision), as two entities, not one JSON blob.

**Product value of keeping *something*.** Every capability on the audit list survives the transition
to AI-native, and several become *more* important:

| Capability | Workflow product | AI-native runtime | Verdict |
|---|---|---|---|
| Execution identity | Correlate logs to a run | Same, plus **idempotency** — an LLM retry must not send the invoice twice | **Stronger** |
| Retries | Retry a failed step | Retry a *tool call*; the planner may also choose to re-plan. Two distinct mechanisms | **Changed** |
| Cancellation | Stop a long run | Critical: an agent acting wrongly must be stoppable mid-flight | **Stronger** |
| Timeouts | Bound a run | Bound the turn *and* each tool call; planners can loop | **Stronger** |
| Streaming | Nice-to-have | **Load-bearing** — see Decision 4 | **Much stronger** |
| Progress | Step N of M (M known) | M is unknown; progress *is* the explanation of intent | **Redefined** |
| Token accounting | Did not exist | Primary cost driver and billing unit | **New** |
| Run logs | Debug a graph | Audit trail of AI-decided actions on a user's real accounts | **Stronger** |

**Why the old shape must go.** `UpdateRunProgressRequest` (`requests.ts:73`) ships
`flowRun: Omit<FlowRun, 'steps'>` plus a step, on every step, over the wire. With an unbounded tool
sequence that is O(n²) payload growth for a linear amount of information. The replacement is
append-only deltas with a monotonic sequence number.

**B1 answered.** Headless *does* need a progress/log channel — but not these contracts. Delete
`UploadRunLogsRequest`, `UpdateRunProgressRequest`, `SendFlowResponseRequest`,
`UpdateStepProgressRequest`, and their dead transport `engine-run-api.ts` (0 importers, and no server
route serves `v1/engine/run-progress`, `step-progress`, `run-logs`, or `flow-response`). Build the
event system in Decision 4 in their place. The deletion is unblocked *because* the replacement is
specified, not in spite of it.

→ `EXECUTION_MODEL.md`

---

### Decision 2 — Triggers — **KEEP, with a new responsibility**

**Do triggers belong?** Yes. Without them the platform is a synchronous API gateway that acts only
when a human is typing. "Recurring AI tasks", "when an invoice arrives, file it", and "summarize my
inbox each morning" are not workflow features — they are the difference between an *agent platform*
and a *request/response API*. Deleting triggers would be the largest unforced product reduction
available in this audit.

**Their new responsibility.** A Trigger is a **binding from an external event to an
ExecutionRequest**. It resolves an event into a prompt or a tool invocation and hands it to the
runtime. It has no graph, no steps, no downstream, and it executes nothing itself.

```
Trigger = { id, projectId, source, target, enabled }

source: Schedule(cron, tz, catchUpPolicy)
      | Webhook(path, secret, responseMode)
      | IntegrationEvent(integration, triggerName, connectionId, input)

target: Prompt(text, agentId?)                       // event payload becomes planner input
      | ToolInvocation(integration, tool, connectionId, input)   // deterministic escape hatch
```

**B4 answered — keep `EXECUTE_TRIGGER_HOOK`, replace its contract.** Every one of the 400+
integrations implements a real subscription lifecycle — `ON_ENABLE`, `ON_DISABLE`, `RENEW`,
`HANDSHAKE`, `RUN`, `TEST` (`engine-operation.ts:21`). That is the second most valuable asset in the
repository after the actions themselves, and it is *integration* logic, not *workflow* logic.
Discarding it because its transport type happens to be `FlowVersion` would be exactly the
dependency-graph-driven decision this ADR forbids.

Verified: `trigger-helper.ts` reads precisely four things from `flowVersion` —
`.trigger.settings` (`pieceName`, `pieceVersion`, `triggerName`, `input`, `propertySettings`) at
line 77, `.flowId` at lines 103 and 127, and `.id` at line 128. The latter two are used only as
**store namespace keys**. A six-field `TriggerBinding` replaces `FlowVersion` on this path with no
loss of behaviour.

→ `TRIGGER_MODEL.md`

---

### Decision 3 — Arbitrary code execution — **DELETE the pipeline, KEEP the evaluator**

The audit conflates two subsystems that share the word "code". Separating them resolves the question.

**(a) User-authored code steps — DELETE.** The compile/cache/bundle pipeline exists solely to turn a
`FlowVersion`'s CODE steps into executable artifacts. `HeadlessRuntime` passes `codes: []`
unconditionally (`runtime/src/index.ts:52`, `:105`) and `execute.controller.ts` has no code path.
Obsolete subsystems:

| Subsystem | File | Reason |
|---|---|---|
| Code artifact type | `sandbox/src/lib/types.ts:89` `CodeArtifact` | Typed on `flowVersionId` + `FlowVersionState` |
| Code compilation | `sandbox/src/lib/cache/flow/code/code-builder.ts` | Compiles flow CODE steps |
| Code cache | `sandbox/src/lib/cache/flow/code/code-cache.ts` | Keyed by flow version |
| Flow provisioning | `sandbox/src/lib/cache/flow/flow-provisioning.ts` | Resolves a flow into pieces + code |
| Flow steps walk | `sandbox/src/lib/cache/flow/flow-steps.ts` | Graph traversal |
| Flow cache | `sandbox/src/lib/cache/flow/flow-cache.ts` | Per-version bundle cache |
| Bundle store | `sandbox/src/lib/cache/flow/flow-bundle-store.ts` | Publishes compiled flow bundles |
| Resolver | `sandbox/src/lib/resolver.ts` | Whole file: flow → provision |
| Provision fields | `ProvisionInput.codes`, `.flowVersionId` | No producer |
| Source type | `SourceCode` via `flows/actions/action.ts` | Flow action model |

**(b) The V8 isolate — KEEP, and rename.** `props-resolver.ts:252` calls
`initCodeSandbox().runScript(...)` from `evalInScope` to evaluate `{{ }}` variable interpolation
inside property resolution. That is a **sandboxed expression evaluator**, on the live
`EXECUTE_PROPERTY` path, and it is a genuine security boundary. `code-sandbox.ts`,
`no-op-code-sandbox.ts`, and `v8-isolate-code-sandbox.ts` stay. The name should become
`expression-sandbox` so that the deletion of (a) does not later endanger (b).

**Explicitly deferred, not settled forever.** Planner-authored code — "code mode" / CodeAct, where the
LLM emits a script that orchestrates several tools in one turn — is a credible future capability with
strong evidence behind it, and it would reuse (b)'s isolate rather than (a)'s pipeline. It is out of
scope now. **Revisit trigger:** when measured multi-tool turns exceed ~5 sequential calls often
enough that round-trip latency dominates. Deleting (a) does not foreclose it; (a) is the wrong
foundation for it anyway, being keyed on flow versions.

→ `RUNTIME_BOUNDARY.md` §3

---

### Decision 4 — Execution progress — **KEEP; rebuild as an event stream**

**Does the user benefit?** More than in any workflow product. A workflow user authored the graph and
can tolerate an opaque "running…" because they already know what will happen. An InboxFM user typed
*"send my latest invoice to Slack"* and has no idea what the machine decided to do, which account it
will touch, or why it is taking eleven seconds. Progress events are simultaneously:

- **the UX** — the only thing between prompt and result,
- **the trust surface** — "Reading Gmail…" is the user's chance to intervene before "Posting to #finance",
- **the audit trail** — persisted, these events *are* the `ToolCall` records,
- **the debugging surface** — the replacement for run logs.

This is a strong keep on product grounds alone.

**Event taxonomy** (no FlowRun vocabulary):

```
ExecutionStarted     ExecutionFinished     ExecutionFailed      ExecutionCancelled
PlannerThought       PlannerPlanned        OutputDelta
ToolStarted          ToolFinished          ToolFailed
ApprovalRequested    ApprovalResolved
```

**Compared with the Activepieces implementation:**

| | Activepieces | InboxFM Connect |
|---|---|---|
| Transport | socket.io websocket | SSE, `GET /v1/executions/:id/events` |
| Payload | whole `FlowRun` per update (`requests.ts:73`) | append-only delta, ~200 bytes |
| Growth | O(n²) in step count | O(n) |
| Resumability | none — reconnect loses history | `Last-Event-ID` + monotonic `seq` |
| Validation | none (`rpc.ts`, no schema check) | zod-validated envelope |
| Semantics | "step 3 of 7 done" | "here is what I decided and why" |
| Persistence | separate log upload | events *are* the write-ahead log for `ToolCall` |

SSE over websockets: unidirectional, natively resumable, survives proxies, and drops the
`socket.io-client` dependency that `core/execution` currently carries for `rpc.ts` alone.

→ `EXECUTION_MODEL.md` §4

---

### Decision 5 — Sandbox resolving FlowVersion — **DELETE**

**B3 answered.** The sandbox's public seam is expressed entirely in workflow vocabulary, and the
headless path already bypasses it. `HeadlessRuntime` builds `ProvisionInput` directly
(`runtime/src/index.ts:49`) and never sets `ResolveInput.flow`, so `resolver.ts:21`'s
`if (!isNil(input.flow))` guard is never true in production. The coupling is compile-time only.

Every `FlowVersion` site in the sandbox disappears:

| Site | Today | Target |
|---|---|---|
| `types.ts:24` | `ResolveResult.flowVersion?: FlowVersion` | deleted with `Resolver` |
| `types.ts:19` | `ResolveInput.flow` | deleted |
| `types.ts:61` | `ProvisionInput.flowVersionId?` | → `provisionKey: string` |
| `types.ts:89` | `CodeArtifact` | deleted (Decision 3a) |
| `resolver.ts:19` | `let flowVersion: FlowVersion` | file deleted |
| `sandbox.ts:70` | `sandbox.start({ flowVersionId })` | `sandbox.start({ provisionKey })` |
| `types.ts:52` | `PreWarmSandboxParams.flow` | → `connectionIds` / `integrations` |

`ProvisionInput` narrows to `{ platformId, provisionKey, pieces, publicApiUrl, engineToken }` — which
is what `HeadlessRuntime` already constructs, minus the two dead fields.

**One upgrade falls out of this, not merely a deletion.** `flowVersionId` was used as the sandbox
cache key. Replacing it with `provisionKey = hash(sorted piece set)` means two different executions
using the same integrations share a warm sandbox, instead of each flow version getting its own. For a
runtime where every turn is a fresh execution, per-version keying would have been pathological.

**Prewarm survives with a new key.** `prewarm` is a real latency lever — the first tool call after a
prompt is the one the user waits on. Re-key it from "this project's active flows" to "this project's
connected integrations", which is both available and more accurate.

→ `RUNTIME_BOUNDARY.md` §2

---

### Decision 6 — FlowVersion — **DELETE**

With no builder, no editing, no canvas, and no version history, `FlowVersion` has no product
referent. It is not one concept but three overloaded into one record: *what to run*, *what to listen
to*, and *what the user authored*. The third has no meaning here; the first two split cleanly:

```ts
// what to run — already exists as ExecuteToolOperation (engine-operation.ts:76)
type ToolInvocation = {
    integration: string; integrationVersion: string
    tool: string; connectionId: string; input: Record<string, unknown>
}

// what to listen to — new, replaces FlowVersion on the trigger path (Decision 2)
type TriggerBinding = {
    integration: string; integrationVersion: string
    triggerName: string; connectionId: string
    input: Record<string, unknown>; propertySettings?: PropertySettings
    scope: { triggerId: string }   // replaces flowId/flowVersionId as the store namespace
}
```

**Versioning is not lost, it moves to where it belongs.** Piece version pinning already lives on the
connection (`connection.pieceVersion`, read at `runtime/src/index.ts:28`). There is no user-authored
artifact left to version.

Consequential deletions once both are in place: `FlowVersion`, `FlowVersionState`,
`LATEST_FLOW_SCHEMA_VERSION`, `Flow`, `PopulatedFlow`, `FlowStatus`, `FlowOperationStatus`,
`FlowCreatorType`, `flowStructureUtil`, `Step`, `FlowActionType`, `RouterAction`, `BranchOperator`,
`FlowTriggerType`, `FlowTrigger`, `PieceTrigger`, all 18 builder-only operation files, `Folder`,
`Note`, and `FlowOperationType`.

→ `RUNTIME_BOUNDARY.md` §1

---

### Decision 7 — Sample Data — **DELETE the artifact, RENAME the parameter, RELOCATE the capability**

Sample Data is four different things wearing one name. Classified individually:

| Concept | What it actually is | Verdict |
|---|---|---|
| `SampleDataSettings` / `sampleDataFileId` | **Workflow concept.** Stored per step so the *builder* could show the last output for drag-and-drop mapping into the next step | **DELETE** — the mapping problem does not exist without a canvas |
| `StepRunResponse` | **Workflow concept.** A step's test result, carried by the dead `UploadRunLogsRequest` (`requests.ts`) and re-exported through `shared/lib/automation/websocket` | **DELETE** with the B1 contracts |
| `ExecutionPath` | **Workflow concept.** `[stepName, iteration][]` — addresses a position in nested loops | **DELETE** — no graph, no position |
| `ExecutePropsOptions.sampleData` | **Execution concept.** The already-resolved input context a dynamic dropdown depends on. On the **live** `EXECUTE_PROPERTY` path | **KEEP, RENAME** → `resolvedInput` |

The last row is the one that would have been deleted by a naive sweep. It is not sample data; it is
the current input context, misnamed after the builder feature that used to populate it.

**The testing capability is real and belongs elsewhere.** "What would this tool call do?" is valuable
for developers *and* for the planner (a cheap way to validate arguments before a destructive call).
It is a **verb on the execution API**, not a stored per-step artifact: `POST /v1/execute` with
`dryRun: true`, returning a resolved-and-validated invocation without side effects. Zero new storage.

→ `EXECUTION_MODEL.md` §6

---

### Decision 8 — Scheduler — **KEEP the interface, REPLACE the driver, serve three planes**

`packages/scheduler` is the only package `HEADLESS_RUNTIME_BOUNDARY.md` graded **Clean** — its sole
dependency is `node-cron`. That cleanliness is also the problem: it is in-memory, single-process, and
non-durable.

Verified deficiencies in `local-scheduler.ts`: every handler wraps `fn()` in `try {} catch {}` with an
empty body and `res.catch(() => {})` — **all failures are silently swallowed**; `once()` state lives
in a process-local `Map` and is **lost on restart**; there is no leader election, so N API replicas
each fire every cron tick; `system-job.ts:getJob` returns a fabricated stub cast through `as any`; and
`systemJobsQueue` is exported as `null as any`.

Acceptable for maintenance chores. Unacceptable for *"summarize my inbox every morning"*, where a
missed or triple-fired tick is a user-visible defect.

**Three planes, one interface:**

| Plane | Workload | Durability | Status |
|---|---|---|---|
| **System** | piece sync, file cleanup, tool-search reindex, trial tracker, hard-delete project/platform | best-effort; re-derived on boot | exists (`SystemJobName`, 9 members) |
| **Trigger** | schedule triggers; polling for integration triggers; `RENEW` for expiring webhook subscriptions | **durable, at-least-once** | new (Decision 2) |
| **Agent** | recurring prompts, deferred agent tasks, retry-with-backoff of failed executions | **durable, at-least-once, cancellable** | new |

So: **all of the above** — but not with one driver. Keep the `Scheduler` interface (`types.ts` — it
is a good seam), keep `LocalScheduler` as the zero-setup dev/CE default, and add a durable
Postgres-backed driver for the trigger and agent planes: a `scheduled_task` table claimed with
`FOR UPDATE SKIP LOCKED`. This is the pattern `CLAUDE.md` already mandates for multi-server
correctness, and it requires **no Redis and no new infrastructure**, which the `self-hosting.md` rule
demands.

Two policies the current implementation has no concept of and recurring AI tasks require:
**catch-up** (three ticks were missed while down — fire once, all three, or none?) and **overlap**
(the previous run is still going — skip, queue, or run concurrently?). Both must be per-trigger,
because the right answer differs between "summarize my inbox" and "sync new orders".

→ `SCHEDULER_MODEL.md`

---

### Decision 9 — Knowledge Search — **KEEP, and promote to a mandatory planner stage**

First, a distinction the brief leaves ambiguous, and which matters:

- **Tool search** — `packages/server/api/src/app/tool-search/`. A semantic index over integration
  actions and triggers. **Runtime infrastructure.**
- **Knowledge base** — `knowledgeBaseModule`, commented out at `app.ts:221`, tests surviving under
  `test/unit/app/knowledge-base/`. RAG over user documents. **A product feature** — properly, an
  integration exposing a `search_documents` tool.

They must not be merged. The first is how the planner finds *capabilities*; the second is how a user
finds *content*. This decision is about the first.

**Should the planner query it before tool discovery?** It is not *before* discovery — **it is
discovery.** 400+ integrations at roughly 20 tools each is on the order of 8,000 tool definitions. No
context window holds them, and tool-selection accuracy degrades sharply well before that limit. The
loop is therefore mandatory, not optional:

```
Prompt → toolSearch(query, scope: connected integrations) → top-k tool definitions → Planner
```

**This subsystem is already built, and built well** — which the audits have consistently
under-credited. Verified in `tool-search.service.ts` and `retrieval-doc.ts`: pgvector cosine ranking
over a `tool_search_index`, per-model `modelVersion` guarding, a τ **no-match gate** so junk queries
return nothing rather than a confident wrong tool, a Fuse keyword floor on embedder failure so the
path *never* hard-fails, and a deterministic `buildRetrievalDoc` used as the single source of truth
for embedded text at both index and query time — an explicit train/eval-text-mismatch guard. That is
a mature retrieval component, and it is exactly the missing piece of an AI-native runtime.

**Three upgrades, in priority order:**

1. **Scope retrieval to connected integrations.** The service already imports `appConnectionService`
   and `AppConnectionStatus`. Filtering to what the project has actually authenticated improves
   ranking *and* becomes a security property: the planner cannot propose a tool the user has not
   connected.
2. **Feed MCP's tool list from it** (Decision 10) rather than from a flow list.
3. **Expose it as a tool as well as a stage.** `ap_search_actions` / `ap_search_triggers` already
   exist. Keep them for the second hop, when the planner discovers mid-turn that it needs something
   the first retrieval did not surface.

**Semantic tool search is the right long-term framing** — not a bolt-on, but the component that makes
a 400-integration catalog addressable by a language model at all. It should be promoted out of
`app/tool-search/` into a named runtime subsystem.

→ `HEADLESS_RUNTIME_ARCHITECTURE.md` §4

---

### Decision 10 — MCP — **KEEP as a permanent strategic subsystem; make it the primary public surface**

MCP is the only interface in the repository that is *natively* AI-native. It should be treated as the
product's public API, not as an integration.

**Current state.** `mcpServerModule` is commented out (`app.ts:208`), and the surface still speaks
workflow: `mcp-service.ts:99` `listMcpFlows()` returns `PopulatedFlow[]`, `mcp-server-builder.ts`
calls `registerFlowTools(...)`, and its `MCP_SERVER_INSTRUCTIONS` block still advertises
`ap_build_flow`, `ap_create_flow`, `ap_update_trigger`, `ap_add_step`, `ap_validate_flow`,
`ap_lock_and_publish` — tools for a builder that no longer exists. The instructions also hardcode
"Activepieces" branding, violating the white-labeling rule.

**Four families, zero workflow dependency:**

| Family | Exposes | Backed by | State |
|---|---|---|---|
| **Connections** | list, status, capabilities per authenticated integration | `appConnectionService` | `ap_list_connections` exists |
| **Tools** | dynamically materialized from *connected* integrations via tool search | `toolSearchService` + `pieceMetadataService` | replace `registerFlowTools` → `registerIntegrationTools` |
| **Capabilities** | dynamic property resolution — dependent dropdowns, option chains | `EXECUTE_PROPERTY` via `userInteractionWatcher` | `ap_get_piece_props`, `ap_resolve_property_options`, `ap_resolve_property_chain` exist |
| **Execution** | invoke a tool; read an execution; subscribe to its events | `POST /v1/execute` | `ap_run_action` exists |
| **Authentication** | full MCP-spec OAuth2 AS — dynamic client registration, PKCE, token, revoke, metadata | `mcp/oauth/**` | complete, **zero** workflow coupling |

The `mcp/oauth/` subtree is a fully-implemented MCP authorization server with four entities and no
flow dependency whatsoever. It is high-value, standards-conformant, and should not be touched by any
cleanup pass.

**MCP is bidirectional, and the direction determines the internal architecture.** InboxFM is an MCP
*server* (exposing 400+ authenticated integrations to external agents such as Claude) and its own
planner is an MCP *client*. **Recommendation: the internal planner calls the engine directly**, not
through the platform's own MCP server — one less hop, lower latency on the path the user waits on,
and stronger typing. MCP remains the *external* contract. Both are driven by the same tool registry,
so there is exactly one definition of what a tool is.

Deletions required: `listMcpFlows`, `registerFlowTools`, `PopulatedMcpServer.flows`, and every
flow-authoring tool in `mcp/tools/` (`flow-run-utils.ts`, and the builder tools named in the
instruction block). The eight table tools (`ap-create-table`, `ap-find-records`, …) are a separate
product question, out of scope here.

→ `MCP_ARCHITECTURE.md`

---

## 3. Blockers resolved

| Blocker | Question | Resolution |
|---|---|---|
| **B1** | Is run progress/log reporting in scope? | **Yes, and the old contracts are wrong.** Delete all four + `engine-run-api.ts`; build the event stream (D4). Unblocks removing `FlowRun`, `StepOutput`, `FailedStep`, `StepRunResponse` |
| **B2** | Which package owns piece-facing contracts? | **`core-piece-types`.** It is the thinner package, the dependency direction already permits it, integrations already honour it, and its zod style already complies with `CLAUDE.md`. `core-execution` deletes its 58 duplicates and imports from `core-piece-types`. `PopulatedFlow` is not deduplicated — both copies are deleted (D6) |
| **B3** | Are code steps in scope? | **No.** Delete the artifact pipeline; keep the expression evaluator (D3) |
| **B4** | Are triggers in scope? | **Yes**, with a new contract. Keep `EXECUTE_TRIGGER_HOOK`; replace `flowVersion` with `TriggerBinding` (D2) |
| **B5** | Move connection/store/file contracts, or amend the rule? | **Move them.** `AppConnection`, `AppConnectionValue`, `PutStoreEntryRequest`, `STORE_KEY_MAX_LENGTH`, `FileType`, `FileCompression` are runtime contracts that belong in a thin package. Amending the rule would concede that the engine depends on DB and EE schemas — false today and undesirable tomorrow. Enforce with `no-restricted-imports` |
| **B6** | (just do it) | Add `.eslintrc.json` to `runtime`, `scheduler`, `server/utils`; fix the `any`s. `packages/runtime` is the most important file in the architecture and is exempt from the codebase's own rules by configuration accident |

---

## 4. Architecture Decision Matrix

| Legacy Concept | Current Responsibility | Needed? | Replacement | Reason | Migration Strategy | Target PR | Future Owner |
|---|---|---|---|---|---|---|---|
| `FlowRun` | Serialized traversal of a step graph | **NO** | `Execution` + `ToolCall` | Keyed on static step names and loop paths; an agent's sequence is discovered at runtime | New entities first; delete after the event stream lands | PR9 | Execution |
| `FlowVersion` | Authored graph + version history | **NO** | `ToolInvocation` + `TriggerBinding` | No builder, no editing, nothing user-authored left to version | Introduce both; repoint trigger + props paths; then delete | PR10 | Execution / Trigger |
| `Flow` / `PopulatedFlow` | Flow record + populated view | **NO** | — | No entity to hold; both duplicate copies die | Delete with MCP decoupling | PR10 | — |
| `StepOutput` / `GenericStepOutput` | Per-step result in a graph | **NO** | `ToolCall.output` | Rows in an append-only sequence, not a keyed map | Delete with B1 contracts | PR9 | Execution |
| `ExecutionPath` | `(stepName, iteration)[]` loop address | **NO** | — | No graph means no position to address | Delete | PR9 | — |
| `FlowRunStatus` | Run lifecycle enum | **NO** | `ExecutionStatus` | Contains `PAUSED`, `QUOTA_EXCEEDED`, and graph-specific states; needs `AWAITING_APPROVAL` instead | New enum; delete old | PR9 | Execution |
| `UpdateRunProgressRequest` | Engine→API progress callback | **NO** | `ExecutionEvent` stream | Ships the whole run per step — O(n²); dead today (0 importers) | Delete with `engine-run-api.ts` | PR8 | Execution |
| `UploadRunLogsRequest` | Engine→API log upload | **NO** | Persisted `ExecutionEvent` log | Same; no server route exists | Delete | PR8 | Execution |
| `SendFlowResponseRequest` | Flow HTTP response | **NO** | Execution result envelope | Dead; no route | Delete | PR8 | — |
| `UpdateStepProgressRequest` | Websocket step progress | **NO** | `ExecutionEvent` (SSE) | Dead as a callback; only survives via a `shared` re-export | Delete + remove re-export | PR8 | Execution |
| `StepRunResponse` | Step test result | **NO** | dry-run response | Builder concept | Delete | PR8 | — |
| `SampleDataSettings` / `sampleDataFileId` | Stored per-step output for canvas mapping | **NO** | — | Mapping problem does not exist without a canvas | Delete | PR10 | — |
| `ExecutePropsOptions.sampleData` | Resolved input context for dynamic props | **YES** | rename → `resolvedInput` | Live on `EXECUTE_PROPERTY`; misnamed after a dead feature | Rename only | PR10 | Capabilities |
| `ExecutePropsOptions.flowVersion?` | Optional flow context for props | **NO** | — | Optional, unused on the headless path | Delete field | PR10 | Capabilities |
| `ExecuteTriggerOperation.flowVersion` | Required trigger context | **REPLACE** | `TriggerBinding` | Only 4 fields are read (`trigger-helper.ts:77,103,127,128`); two are store keys | Add field, dual-read, drop old | PR11 | Trigger |
| `EXECUTE_TRIGGER_HOOK` | Integration subscription lifecycle | **YES** | unchanged op, new payload | `ON_ENABLE`/`RENEW`/`RUN` are integration assets, not workflow logic | Keep; retype | PR11 | Trigger |
| `TriggerPayload` | Webhook payload shape | **YES** | dedupe to `core-piece-types` | Real contract; two copies disagree on `method` | Delete `core-execution` copy | PR12 | Trigger |
| `Resolver` / `ResolveInput` / `ResolveResult` | Flow → provision resolution | **NO** | — | Caller already builds `ProvisionInput` directly; guard never true | Delete `resolver.ts` | PR10 | Sandbox |
| `ProvisionInput.flowVersionId` | Sandbox cache key | **REPLACE** | `provisionKey = hash(pieces)` | Per-version keying defeats cache sharing across executions | Swap key | PR10 | Sandbox |
| `ProvisionInput.codes` / `CodeArtifact` | Code steps to provision | **NO** | — | Always `[]`; typed on `FlowVersionState` | Delete | PR10 | Sandbox |
| `code-builder` / `code-cache` / `flow-cache` / `flow-bundle-store` / `flow-provisioning` / `flow-steps` | Compile + cache flow code steps | **NO** | — | No authored code exists to compile | Delete subtree | PR10 | Sandbox |
| V8 isolate code sandbox | `{{ }}` expression evaluation | **YES** | rename → `expression-sandbox` | Live at `props-resolver.ts:252`; a real security boundary | Rename only | PR10 | Sandbox |
| `PreWarmSandboxParams.flow` | Warm caches for active flows | **REPLACE** | warm by connected integrations | Prewarm is a real latency lever; the key is wrong | Re-key | PR10 | Sandbox |
| `packages/scheduler` (in-memory) | All scheduling | **REPLACE driver** | durable Postgres driver + `LocalScheduler` dev default | Silently swallows errors; loses `once()` on restart; no leader election | Add driver behind the existing interface | PR13 | Scheduler |
| `SystemJobName` / system jobs | Maintenance chores | **YES** | unchanged | Real operational need; no workflow coupling | Keep | — | Platform |
| `tool-search` | Semantic index over actions/triggers | **YES** | promote to runtime subsystem | The only thing that makes 8,000 tools addressable by an LLM | Scope to connected integrations; wire into planner | PR14 | Retrieval |
| `knowledgeBaseModule` | RAG over user documents | **YES**, but relocate | an integration exposing `search_documents` | A product feature, not runtime infrastructure | Re-enable as an integration | later | Product |
| `mcp/oauth/**` | MCP-spec OAuth2 AS | **YES** | unchanged | Complete, standards-conformant, zero workflow coupling | Keep untouched | — | MCP |
| `listMcpFlows` / `registerFlowTools` / `PopulatedMcpServer.flows` | Expose flows as MCP tools | **NO** | `registerIntegrationTools` from tool search | Nothing to expose; source the list from the catalog | Replace | PR12 | MCP |
| MCP flow-authoring tools (`ap_build_flow`, `ap_create_flow`, `ap_add_step`, `ap_validate_flow`, `ap_lock_and_publish`, `flow-run-utils.ts`) | Let an LLM build flows | **NO** | — | Tools for a builder that no longer exists | Delete + rewrite `MCP_SERVER_INSTRUCTIONS` | PR12 | MCP |
| `ap_get_piece_props` / `ap_resolve_property_options` / `ap_resolve_property_chain` | Dynamic property resolution for an LLM | **YES** | unchanged | The mechanism that lets a planner fill dependent dropdowns — high value | Keep | — | Capabilities |
| `Folder` / `Note` / `Tag` on flows | Builder organisation | **NO** | — | Organising a canvas that does not exist | Delete | PR10 | — |
| 18 builder-only operation files | Flow mutation ops | **NO** | — | Retained transitively by one barrel exporting `FlowOperationType` | Delete barrel + files | PR10 | — |
| `worker-contract.ts` (26 of 29 unused) / `job-data.ts` (18 of 26 unused) | Worker DTOs | **MOSTLY NO** | keep the 11 live symbols | Chat/prewarm/email/trigger-run DTOs from a removed product | Prune to live set | PR8 | Runtime |
| `Runtime*` alias shim (`engine-operation.ts:283-300`) | Rename shim over `Engine*` | **NO** | one name | A naming split, not a boundary; 3 of 9 aliases unused | Pick `Engine*`; delete aliases | PR8 | Runtime |
| `core-execution` ↔ `core-piece-types` (58 dupes) | Same contracts, two copies | **NO** | `core-piece-types` owns | B2 resolved; 2 diverge semantically and silently | Delete `core-execution` copies | PR12 | Contracts |
| `packages/runtime` `any`s | Headless runtime entry | **YES**, fix | typed | Most important file; exempt from the rules by config accident | Add eslintrc; fix | PR8 | Runtime |

---

## 5. The final question

> **If InboxFM Connect had been built from scratch today, knowing the product vision, which of these
> concepts would never have been created in the first place?**

**Never created — these are artifacts of a visual product, and nothing else:**

`FlowVersion` and its version history. `Flow`, `PopulatedFlow`, `FlowStatus`. `FlowRun` and
`FlowRunStatus`. `StepOutput` and `GenericStepOutput`. `ExecutionPath`. `SampleDataSettings` and
`sampleDataFileId`. `StepRunResponse`. `Router` and `Loop` actions, `BranchOperator`. `Folder`,
`Note`, and the 18 flow-mutation operations. The code-step compile/cache/bundle pipeline. `Resolver`
and flow-based provisioning. Every MCP flow-authoring tool.

The unifying property: **each one exists to serialize, persist, version, organise, or edit a graph a
human drew.** Delete the canvas and they have no referent. They are not "legacy code" in the usual
sense of being outdated — they were correct for a product that no longer exists.

**Would have been created, but shaped differently:**

- **Execution.** Built as `Execution` + append-only `ToolCall` from day one, with tokens as a
  first-class cost dimension. Never as a keyed map over declared steps.
- **Progress.** Designed as a resumable event stream first, because in an AI product the stream *is*
  the interface. In Activepieces it was an afterthought bolted onto a websocket, shipping the whole
  run object per update.
- **Triggers.** Bindings from events to prompts. The subscription-lifecycle hooks
  (`ON_ENABLE`/`RENEW`/`RUN`) would look almost identical — they are integration concerns and were
  never really workflow concerns. Their coupling to `FlowVersion` was incidental.
- **Sandbox.** Keyed on the piece set, never on a flow version. The current key is strictly worse for
  cache sharing.
- **Scheduler.** Durable from the start. In-memory `node-cron` is fine for maintenance chores and was
  never going to be fine for user-visible recurring tasks.

**Would have been created essentially as-is — the genuinely portable assets:**

- **The integration library.** 400+ integrations, their actions, their auth, and their trigger
  lifecycles. This is the entire moat, and it is almost entirely uncoupled from workflows.
- **`tool-search`.** Semantic retrieval with a no-match gate and a keyword floor — this is *more*
  central to an AI-native runtime than it ever was to a workflow product. It would have been built
  first, not last.
- **The MCP subsystem, especially `mcp/oauth/`.** A standards-conformant authorization server. In the
  from-scratch design this is the front door.
- **The sandbox isolation model** — fork/isolate, SSRF guards, network modes, memory limits. Running
  untrusted third-party integration code safely is the same problem regardless of what decides to run
  it. Arguably *harder* here, since an LLM chooses the target.
- **Connections and the encrypted credential store.** `Connection → Integration → Tool → Result`
  is the product's spine, and it is the one part of the original architecture that survives the
  rewrite untouched.

**The uncomfortable observation.** Roughly 54% of the declared contract surface in `core/execution`
has no consumer (`RUNTIME_CONTRACT_INVENTORY.md` §8: 93 of 171 exports unused). That is not primarily
a hygiene failure. It is the measurable footprint of a product that changed underneath its own type
system — and the reason this ADR insists that every remaining concept justify itself by product
value rather than by import count.

---

## 6. Companion documents

| Document | Contents |
|---|---|
| `HEADLESS_RUNTIME_ARCHITECTURE.md` | Target system architecture; the planner loop; component boundaries |
| `EXECUTION_MODEL.md` | `Execution` / `ToolCall` entities; the event system; approvals; accounting |
| `TRIGGER_MODEL.md` | Trigger sources, targets, and the `TriggerBinding` contract |
| `SCHEDULER_MODEL.md` | Three planes; durable driver; catch-up and overlap policy |
| `MCP_ARCHITECTURE.md` | The five MCP families; bidirectional design; tool materialization |
| `RUNTIME_BOUNDARY.md` | Package ownership, import rules, and what each layer may know |
| `HEADLESS_ROADMAP.md` | PR8–PR15 sequencing with dependencies and risk |
