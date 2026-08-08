# HEADLESS_RUNTIME_ARCHITECTURE

**Companion to `ADR-001_HEADLESS_RUNTIME.md`.** The target system architecture.
Design document. No code changed.

---

## 1. The system in one diagram

```
                                    ┌─────────────────────────────┐
   Natural language ───────────────▶│  INTENT SURFACE             │
   or MCP tool call                 │  POST /v1/prompt            │
                                    │  POST /v1/execute  (direct) │
                                    │  MCP server (external agent)│
                                    └──────────────┬──────────────┘
                                                   │ ExecutionRequest
                                                   ▼
   ┌───────────────────────────────────────────────────────────────────────────┐
   │  EXECUTION CONTROL PLANE                                                  │
   │                                                                           │
   │   Execution record ──┬── identity, idempotency key, deadline              │
   │                      ├── cancellation token                               │
   │                      ├── token + tool-call accounting                     │
   │                      └── ExecutionEvent stream (append-only, seq-ordered) │
   └───────────────────────────────┬───────────────────────────────────────────┘
                                   │
              ┌────────────────────┴─────────────────────┐
              ▼                                          ▼
   ┌─────────────────────────┐              ┌────────────────────────────┐
   │  RETRIEVAL              │              │  PLANNER                   │
   │  toolSearch(query,      │─ top-k ─────▶│  LLM + tool definitions    │
   │    scope: connected)    │  tool defs   │  emits: thought | toolcall │
   │  τ no-match gate        │              │         | final answer     │
   │  keyword floor fallback │◀── 2nd hop ──│                            │
   └─────────────────────────┘              └─────────────┬──────────────┘
                                                          │ ToolInvocation
                                                          ▼
                                            ┌────────────────────────────┐
                                            │  POLICY                    │
                                            │  connection ownership      │
                                            │  scope / permission check  │
                                            │  approval gate (optional)  │
                                            └─────────────┬──────────────┘
                                                          ▼
   ┌───────────────────────────────────────────────────────────────────────────┐
   │  EXECUTION DATA PLANE                                                     │
   │                                                                           │
   │   ToolInvocation ──▶ Connection resolve + decrypt + refresh                │
   │                  ──▶ Provision (piece set → provisionKey → warm cache)     │
   │                  ──▶ Sandbox box (fork | isolate)                          │
   │                  ──▶ RPC over socket ──▶ ENGINE ──▶ integration action     │
   │                  ◀── EngineResponse<T>                                     │
   └───────────────────────────────┬───────────────────────────────────────────┘
                                   ▼
                          ToolCall row + ToolFinished event
                                   │
                                   └──▶ back to PLANNER (loop) or ──▶ RESULT
```

The loop between Planner and the data plane is the defining structure. Everything the removed
workflow runtime did once, statically, this loop does repeatedly and dynamically.

---

## 2. Layers, and what each is permitted to know

| Layer | Package | Knows about | Must NOT know about |
|---|---|---|---|
| **Intent surface** | `server/api/src/app/{execute,prompt,mcp}` | HTTP, auth principals, projects | sandboxes, engine operations |
| **Execution control** | `server/api/src/app/execution` *(new)* | executions, events, accounting, approvals | integration internals, sandbox mechanics |
| **Retrieval** | `server/api/src/app/tool-search` → promote | embeddings, the tool catalog, connections | planner internals, execution state |
| **Planner** | `server/api/src/app/planner` *(new)* | tool definitions, conversation state, AI providers | HTTP, the database, sandbox |
| **Policy** | `server/api/src/app/execution/policy` *(new)* | connections, permissions, approval rules | LLM specifics |
| **Runtime facade** | `packages/runtime` | connections, provisioning, one engine operation | HTTP routing, planner, persistence |
| **Sandbox** | `packages/server/sandbox` | boxes, piece caches, provision keys, RPC | connections, projects, executions |
| **Engine** | `packages/server/engine` | integrations, props, auth, triggers, SSRF | executions, planners, the database |

**Direction of dependency is strictly downward.** Today `packages/runtime` violates this by importing
`@inboxfm-connect/shared` (`runtime/src/index.ts:2`), and the engine violates it in 31 source files
(`PR7_BLOCKERS.md` B5). Both are enforcement gaps, not design intent — see `RUNTIME_BOUNDARY.md`.

---

## 3. The planner loop

```
1.  ExecutionStarted                      persist Execution, open the event stream
2.  retrieve   toolSearch(prompt, scope = project's connected integrations)
                 → top-k tool definitions (default k = 12)
                 → τ gate: if nothing clears threshold, answer without tools
3.  plan       LLM(prompt, history, tool defs)
                 → PlannerThought  (streamed, user-visible reasoning summary)
                 → one of: ToolInvocation | second-hop retrieval | final answer
4.  authorize  policy check: does this project own the connection?
                 does the caller hold the scope?
                 does this tool require approval?  → ApprovalRequested, suspend
5.  invoke     ToolStarted → runtime.execute(...) → ToolFinished | ToolFailed
                 persist ToolCall row
6.  loop       feed the result back to step 3 until the planner emits a final
               answer, or a budget is exhausted (tool calls, tokens, wall clock)
7.  ExecutionFinished                     seal the Execution, write final accounting
```

**Three budgets, each independently enforced, each producing a distinct terminal state.** An agent
loop that can call tools has no natural termination guarantee, so bounds are a correctness
requirement, not a safety valve:

| Budget | Default | Terminal state |
|---|---|---|
| Tool calls per execution | 25 | `FAILED(tool_budget_exhausted)` |
| Tokens per execution | plan-dependent | `FAILED(token_budget_exhausted)` |
| Wall clock | 300 s | `TIMED_OUT` |

Per-tool-call timeout stays separate and much smaller (currently hardcoded to 60 s at
`runtime/src/index.ts:48`; should become a parameter).

---

## 4. Retrieval — why it is mandatory, not an optimisation

400+ integrations at roughly 20 tools each is on the order of **8,000 tool definitions**. Serialized
with parameter schemas that is far beyond any context window, and tool-selection accuracy collapses
long before the hard limit is reached. Retrieval is therefore the only thing that makes the catalog
addressable at all.

**What exists today** (`packages/server/api/src/app/tool-search/`), verified:

| Component | File | Function |
|---|---|---|
| Index | `tool-search-index.entity.ts` | pgvector rows over actions and triggers |
| Doc builder | `retrieval-doc.ts` | `buildRetrievalDoc()` — deterministic, single source of truth for embedded text at **both** index and query time. An explicit train/eval-text-mismatch guard |
| Query | `tool-search.service.ts` | cosine scan, `modelVersion` pinning, tenant isolation, optional `pieceName` scope, `CANDIDATE_POOL = 50` over-fetch |
| Gate | `no-match-gate.ts` | per-model τ threshold — junk queries return nothing rather than a confident wrong tool |
| Fallback | keyword floor (Fuse) | on missing embedder or a live embed failure; `mode: "keyword"` is reported. The path never hard-fails |
| Embedder | `resolve-embedder.ts` | resolves a platform's AI provider |
| Reindex | `tool-search-reindex.{job,service}.ts` | delta on piece sync + cold-start backfill |

This is a mature retrieval component. It is currently disabled — `toolSearchReindexJob(app.log)
.register()` and the backfill are both commented out at `app.ts:189-194`.

**Required changes:**

1. **Scope to connected integrations.** The service already imports `appConnectionService` and
   `AppConnectionStatus`. Restricting candidates to integrations the project has authenticated is
   simultaneously a ranking improvement (fewer distractors) and a security property (the planner
   cannot propose a tool the user never connected).
2. **Two-hop retrieval.** Keep `ap_search_actions` / `ap_search_triggers` exposed *as tools* so the
   planner can search again mid-turn when the first retrieval missed. Pre-planner retrieval handles
   the common case; the tool handles the tail.
3. **Return dense definitions, not names.** The planner needs the parameter schema to fill arguments.
   `ap_get_piece_props` already provides this; the retrieval envelope should carry it inline for the
   top-k to avoid a second round trip.
4. **Re-enable the reindex job.**

**Not to be merged with the knowledge base.** `knowledgeBaseModule` (commented out at `app.ts:221`,
tests under `test/unit/app/knowledge-base/`) is RAG over *user documents*. It is a product feature —
correctly modelled as an integration exposing a `search_documents` tool — not runtime infrastructure.
Tool search finds *capabilities*; the knowledge base finds *content*. Conflating them would put user
document chunks in the tool-selection index.

---

## 5. The data plane, as it exists today

The `Connection → Integration → Tool → Result` path is already real and certified. Verified chain:

```
POST /v1/execute            app.ts:205 → execute.module.ts:5
  → execute.controller.ts:53   runtime.execute({ integration, tool, connectionId, input })
  → runtime/src/index.ts:16    getConnection → decryptAndRefresh
  → runtime/src/index.ts:31    sandboxRuntime.execute({ EXECUTE_TOOL, operation, provision })
  → sandbox.ts:38              manager.acquire()
  → sandbox.ts:41              localExecutionCache.provision({ pieces, codeSteps })
  → sandbox/{fork,isolate}.ts  socket.io + createRpcClient (rpc.ts:16)
  → engine/main.ts             ssrfGuard.install() → workerSocket.init()
  → operations/index.ts:14     switch — 6 cases, no flow execution
  → piece-helper.ts:204        executeTool → pieceLoader → propsProcessor → action.run()
  ← EngineResponse<unknown>    engine-operation.ts:268
```

`ExecuteToolOperation` (`engine-operation.ts:76`) carries no workflow type. Where the piece context
needs flow identity, `piece-helper.ts:235-236` passes the literals `flowId: 'headless'` /
`flowVersionId: 'headless'` — store-key sentinels, not model references. Those become
`executionId` / `toolCallId` under the new model, which is strictly better: store scoping becomes
meaningful instead of a constant.

**Two live sandbox entry points exist**, which is worth naming explicitly since only one is
documented:

| Entry | File | Purpose | Concurrency |
|---|---|---|---|
| `HeadlessRuntime` | `runtime/src/index.ts:8` | `EXECUTE_TOOL`, `EXTRACT_PIECE_METADATA` | 1 |
| `userInteractionWatcher` | `helper/user-interaction/user-interaction-watcher.ts:8` | `EXECUTE_PROPERTY`, `EXECUTE_VALIDATE_AUTH`, `EXECUTE_TRIGGER_HOOK`, `EXTRACT_PIECE_METADATA`, `EXECUTE_REFRESH_TOKEN_AUTH` | 10 declared |

The second is what MCP's capability tools run on (`ap-get-piece-props.ts:160`,
`ap-resolve-property-chain.ts:67`, `mcp-utils.ts:613`, `piece-metadata-controller.ts:124`).

**Defect found while tracing this.** `user-interaction-watcher.ts:9` constructs the runtime with
`concurrency: 10`, creating ten sandbox managers, but every call passes `workerIndex: 0`
(line 52). Nine managers are allocated and never used, and all property resolution serializes through
box 0. Not an architectural decision — a bug, and a latency one, since dependent-dropdown resolution
is exactly the interactive path where queuing is felt. It also carries `log: log as any`,
`NETWORK_MODE ... as any`, and a whole-object `as any` (lines 17-21), all of which the codebase's own
rules forbid.

---

## 6. What "headless" means here, precisely

Three properties, all currently true and all worth defending:

1. **No rendering surface is required to execute anything.** `packages/web` does not exist; the
   workspace list has no web entry. Every capability is reachable over HTTP or MCP.
2. **No stored, user-authored execution graph.** The unit of persistence is a *record of what
   happened*, never a *definition of what should happen*. This is the property that Decision 6
   protects, and the one most at risk of quietly regressing — the first time someone adds a "saved
   automation" table with an ordered `steps` array, FlowVersion is back under a new name.
3. **Stateless execution.** Each turn resolves its own connections, provisions its own piece set, and
   holds no cross-turn runtime state. Conversation history is planner input, not runtime state.

A UI may of course be built on top. The constraint is that it consumes the same public API an
external agent does — no privileged internal surface.

---

## 7. New components this architecture requires

| Component | Location | Depends on | Introduced in |
|---|---|---|---|
| `Execution` / `ToolCall` entities | `server/api/src/app/execution/` | database | PR9 |
| `ExecutionEvent` stream + SSE endpoint | `server/api/src/app/execution/events/` | Execution | PR9 |
| Planner service | `server/api/src/app/planner/` | AI providers, retrieval, execution | PR14 |
| `POST /v1/prompt` | `server/api/src/app/prompt/` | planner | PR14 |
| Policy / approval gate | `server/api/src/app/execution/policy/` | Execution, connections | PR15 |
| `TriggerBinding` + trigger registry | `server/api/src/app/trigger/` | scheduler, engine | PR11 |
| Durable scheduler driver | `packages/scheduler/` | database | PR13 |

Both new entities must be added to `getEntities()` in `database-connection.ts` — TypeORM does not
auto-discover, and omitting this fails silently at runtime.

---

## 8. Non-goals

Stated so they are not re-litigated, and so the deletions in ADR-001 are not later read as accidents:

- **No visual builder, canvas, or graph editor**, in any form, including "just a read-only view of
  what the agent did as a diagram". A timeline of `ToolCall` rows is the correct rendering; a DAG
  invites the DAG's data model back.
- **No user-authored code steps.** See ADR-001 Decision 3 for the deferral condition on
  planner-authored code.
- **No cross-execution durable state machine.** Suspension for approval is bounded and belongs to a
  single execution.
- **No second execution path.** If a capability needs to run a tool, it goes through the same
  `ToolInvocation → runtime → engine` path the planner uses. Parallel paths are how
  `engine-run-api.ts` became dead code without anyone noticing.
