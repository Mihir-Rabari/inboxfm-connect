# HEADLESS_ROADMAP

**Companion to `ADR-001_HEADLESS_RUNTIME.md`.** Sequencing from the current state to the target
architecture. Design document. No code changed.

---

## 1. Sequencing principles

1. **Delete what is already dead first.** PR8 removes only code with zero live consumers. It cannot
   break anything and it shrinks the surface every later PR must reason about.
2. **Build the replacement before deleting the incumbent.** `FlowRun` is not removed until
   `Execution` exists and is emitting events on real traffic.
3. **Prove new infrastructure on the existing path.** The event system ships against the working
   single-tool `POST /v1/execute` before the planner exists, so it is validated before anything
   depends on it.
4. **Enforcement lands with the cleanup it protects.** Import rules are added in the PR that fixes
   the violations, or the violations return.
5. **`FlowVersion` is cut in dependency order** — cheapest consumer first, required-field consumer
   last.

---

## 2. Phases

```
PR8   Dead-code removal + lint enforcement        no dependencies
PR9   Execution + ToolCall + event stream         PR8
PR10  FlowVersion removal (sandbox, props, code)  PR8, PR9
PR11  Trigger model                               PR10
PR12  Contract dedup + MCP decoupling             PR10
PR13  Durable scheduler                           PR11
PR14  Retrieval + planner                         PR9, PR12
PR15  Policy, approvals, budgets                  PR14
```

`PR11` and `PR12` are independent of each other and can run in parallel.

---

## PR8 — Dead-code removal and lint enforcement

**Everything here has zero live consumers. No behaviour changes.**

| Item | Evidence |
|---|---|
| `engine/src/lib/api/engine-run-api.ts` | 0 importers; posts to 4 routes that no server serves |
| `UploadRunLogsRequest`, `UpdateRunProgressRequest`, `SendFlowResponseRequest`, `UpdateStepProgressRequest` | Only consumer is the above |
| `StepRunResponse` / `UpdateStepProgressRequest` re-exports in `shared/lib/automation/websocket` | Their transport is dead |
| `engine/src/lib/piece-context/waitpoint-client.ts` | 0 importers |
| `CreateWaitpointRequest` / `CreateWaitpointResponse` | Consumer is the above |
| 26 of 29 `worker-contract.ts` exports; 18 of 26 `job-data.ts` exports | 0 importers (chat, prewarm, payload, trigger-run, email DTOs) |
| `Runtime*` alias shim (`engine-operation.ts:283-300`) | Rename shim; consolidate on `Engine*` |
| `EngineContract` alias, `FileStoreError`, `PausedFlowTimeoutError`, `EngineHttpResponse`, `ParseEventResponse`, `ExecuteActionResponse`, `normalizeToolOutputToExecuteResponse`, `GetFlowVersionForWorkerRequest` | 0 importers |
| 14 `DEAD_CODE` files in `core/execution` | `DELETE_CANDIDATES.md` |

Plus (B6):

- `.eslintrc.json` for `packages/runtime`, `packages/scheduler`, `packages/server/utils`
- Fix the `any`s surfaced in `runtime/src/index.ts` and `user-interaction-watcher.ts`
- Fix `user-interaction-watcher.ts` `concurrency: 10` / `workerIndex: 0` — nine unused managers, all
  property resolution serialized through box 0
- Make per-tool timeout a parameter (hardcoded `60` at `runtime/src/index.ts:48` and
  `user-interaction-watcher.ts:56`)

**Risk: very low.** Every deletion is backed by a zero-importer count. The lint fixes will surface
real type mismatches — `console` is not an `ApLogger` — which is the point.

**Answers:** B1 (deletion half), B6.

---

## PR9 — Execution, ToolCall, and the event stream

| Item |
|---|
| `Execution` + `ToolCall` entities; migration; **register both in `getEntities()`** |
| `ExecutionEvent` envelope with monotonic `seq`; persistence |
| Emit events from the existing `POST /v1/execute` path (single-`ToolCall` executions) |
| `GET /v1/executions/:id/events` (SSE, `Last-Event-ID` resume) |
| `POST /v1/executions/:id/cancel` |
| `GET /v1/executions/:id`, `GET /v1/executions` |
| Absolute `deadlineAt`, `idempotencyKey`, `usage` accounting |
| Then delete `FlowRun`, `FlowRunStatus`, `StepOutput`, `GenericStepOutput`, `ExecutionPath`, `FailedStep`, `RunEnvironment` |

**Ordering within the PR matters:** wire events into the *working* single-tool path first. That
proves the stream against real traffic before the planner (PR14) depends on it, and it makes the
`FlowRun` deletion at the end a removal of something already replaced.

**Risk: medium.** New entities and a new transport. Mitigated by the fact that the execution path
itself is unchanged — only observation is added.

**Answers:** B1 (replacement half). **Design:** `EXECUTION_MODEL.md`.

---

## PR10 — FlowVersion removal

Cut in dependency order (`RUNTIME_BOUNDARY.md` §4):

| Step | Item |
|---|---|
| 1 | Delete `ExecutePropsOptions.flowVersion?` (optional, unused) — cheapest |
| 2 | Rename `ExecutePropsOptions.sampleData` → `resolvedInput` |
| 3 | Delete the code-step pipeline: `code-builder`, `code-cache`, `flow-provisioning`, `flow-steps`, `flow-cache`, `flow-bundle-store`, `resolver.ts`, `CodeArtifact`, `ProvisionInput.codes` |
| 4 | Rename the V8 isolate tree `code-sandbox*` → `expression-sandbox*` |
| 5 | `ProvisionInput.flowVersionId` → `provisionKey = hash(sorted piece set)` |
| 6 | Re-key `prewarm` from flows to connected integrations |
| 7 | Delete `SampleDataSettings`, `sampleDataFileId`, `StepRunResponse` |
| 8 | Delete `Folder`, `Note`, the 18 builder-only operation files, `FlowOperationType`, `flowStructureUtil`, `Step`, `FlowActionType`, `RouterAction`, `BranchOperator` |

Step 4 is not cosmetic — see `RUNTIME_BOUNDARY.md` §3b. Note that two of those files have zero
*static* inbound edges (loaded via `await import()` at `code-sandbox.ts:8,13`) and will look dead to
any reverse-dependency scan.

`FlowVersion` itself survives this PR — `ExecuteTriggerOperation` still requires it until PR11.

**Risk: medium.** Large deletion surface, but the flow branch is provably unreachable at runtime
(`resolver.ts:21` guard never true on the headless path).

**Answers:** B3. **Design:** `RUNTIME_BOUNDARY.md` §2-3.

---

## PR11 — Trigger model

| Item |
|---|
| `Trigger` entity + migration; **register in `getEntities()`** |
| `TriggerBinding`; `ExecuteTriggerOperation.flowVersion` → `binding` |
| Retype `trigger-helper.ts` (4 field reads, lines 77/103/127/128) |
| Store scope `{flowId}/{flowVersionId}` → `{triggerId}` |
| `triggerPayload: JobPayload` → `TriggerPayload` |
| `POST /v1/triggers` CRUD; `POST /v1/triggers/:id/webhook` |
| Lifecycle: `ON_ENABLE` / `ON_DISABLE` / `RENEW`; auto-disable on repeated failure |
| **Then delete `FlowVersion`** and the whole `flows/` + `flow-run/` subtree |

**Risk: high.** The only PR that changes live engine behaviour rather than removing dead paths.
`EXECUTE_TRIGGER_HOOK` is dispatched today via `user-interaction-watcher.ts:34`. Mitigation: accept
both `flowVersion` and `binding` on the operation for one release, dual-read in `trigger-helper.ts`,
then drop the old field.

**Answers:** B4. **Design:** `TRIGGER_MODEL.md`.

---

## PR12 — Contract dedup and MCP decoupling

| Item |
|---|
| `core-piece-types` becomes the sole owner of piece-facing contracts (B2) |
| Fix `TriggerPayload` in `core-piece-types` to validate `method` |
| Delete the 58 duplicate declarations from `core-execution` |
| Replace deprecated `z.nativeEnum` → `z.enum` |
| Remove `export *` from `core-execution` in `shared/src/index.ts:37` — named re-exports only |
| Move `AppConnection`, `PutStoreEntryRequest`, `STORE_KEY_MAX_LENGTH`, `FileType`, `FileCompression` into thin packages (B5) |
| Add `no-restricted-imports` to `server/engine` and integration packages (R1–R3) |
| MCP: delete `listMcpFlows`, `registerFlowTools`, `PopulatedMcpServer.flows`, flow-authoring tools, `flow-run-utils.ts` |
| MCP: rewrite `MCP_SERVER_INSTRUCTIONS`; white-label server metadata |

`PopulatedFlow` is not deduplicated — **both** copies are deleted.

The `export *` removal at `shared/src/index.ts:37` is the highest-leverage single line in the whole
roadmap: it is what makes `shared` the sole distribution channel for legacy models and what made
file-level reverse-dependency analysis of `core/execution` meaningless in the first place.

**Risk: medium-high.** Wide but mechanical. `no-restricted-imports` must land in the same PR as the
fixes, or the 31 engine violations regrow.

**Answers:** B2, B5. **Design:** `RUNTIME_BOUNDARY.md` §5-6, `MCP_ARCHITECTURE.md` §7.

---

## PR13 — Durable scheduler

| Item |
|---|
| Fix `LocalScheduler`: stop swallowing errors (F2), reliable `cancel` (F3), delete `systemJobsQueue = null as any` and the fabricated `getJob` stub (F4) |
| `scheduled_task` entity + migration; **register in `getEntities()`** |
| `DurableScheduler` — `FOR UPDATE SKIP LOCKED` claim loop with leases |
| `catchUp` (`skip`/`once`/`all`) and `overlap` (`skip`/`queue`/`concurrent`) policies |
| Route trigger and agent planes to the durable driver; system plane stays local |
| Per-project concurrency caps and fairness |
| Re-enable `TOOL_SEARCH_REINDEX` + cold-start backfill (`app.ts:190-194`) |

F2 is the sleeper item: every current system job — piece sync, file cleanup, reindex — can fail today
with **no signal at all**, because all three `LocalScheduler` methods use empty `catch {}` blocks.

**Risk: medium.** The claim loop needs test coverage under concurrent replicas.

**Design:** `SCHEDULER_MODEL.md`.

---

## PR14 — Retrieval and planner

| Item |
|---|
| Promote `tool-search` to a named runtime subsystem |
| Scope retrieval to **connected** integrations (ranking + security) |
| Return dense tool definitions inline for top-k (avoid a second round trip) |
| Planner service: LLM loop over AI providers, emitting thoughts / tool calls / final answers |
| `POST /v1/prompt` → `Execution` with `input.kind = 'prompt'` |
| Wire `PlannerThought`, `PlannerPlanned`, `OutputDelta` into the PR9 event stream |
| Three budgets: tool calls, tokens, wall clock |
| MCP: `registerIntegrationTools` from connections + retrieval; re-enable `mcpServerModule` |

**This is the PR that makes the product what the vision describes.** Everything before it is
subtraction and foundation.

**Risk: high** — but it is *additive*. Nothing existing depends on the planner, so failure is
contained.

**Design:** `HEADLESS_RUNTIME_ARCHITECTURE.md` §3-4, `MCP_ARCHITECTURE.md` §3.3.

---

## PR15 — Policy, approvals, budgets

| Item |
|---|
| Policy layer: connection ownership, scope checks, per-tool approval rules |
| `AWAITING_APPROVAL` suspension between tool calls; `ApprovalRequested` / `ApprovalResolved` |
| `POST /v1/executions/:id/approvals/:toolCallId`; 24 h expiry → `CANCELLED` |
| Per-project and per-trigger token budgets |
| `dryRun` on `POST /v1/execute` |

Per-trigger budgets are arguably a **prerequisite** for shipping planner-target triggers rather than a
follow-up: an unbounded recurring prompt is an unbounded bill, and the failure mode is discovered on
an invoice. If PR11 ships planner targets before PR15, that budget check should be pulled forward.

**Risk: medium.** Approval suspension touches the planner loop.

**Design:** `EXECUTION_MODEL.md` §5, `HEADLESS_RUNTIME_ARCHITECTURE.md` §3.

---

## 3. Blocker → PR map

| Blocker | Question | Resolved in |
|---|---|---|
| B1 | Is run progress/log reporting in scope? | PR8 (delete) + PR9 (replace) |
| B2 | Which package owns piece-facing contracts? | PR12 |
| B3 | Are code steps in scope? | PR10 |
| B4 | Are triggers in scope? | PR11 |
| B5 | Move connection/store/file contracts, or amend the rule? | PR12 |
| B6 | Lint the unlinted packages | PR8 |

---

## 4. Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| PR11 breaks live trigger execution | High | Dual-field `flowVersion` + `binding` for one release; dual-read in `trigger-helper.ts` |
| `provisionKey` change invalidates warm caches | Medium | One cold start after deploy; acceptable, and it is a one-time cost |
| Deleting `export *` from `shared` breaks unnamed transitive imports | Medium | `tsc` catches every one at build time |
| Event stream volume | Medium | `outputSummary` not full output; TTL on events; the O(n²) payload lesson from `UpdateRunProgressRequest` |
| Planner cost runaway | High | Three budgets in PR14; per-trigger budgets in PR15 |
| Tool search index empty at cutover | Medium | Re-enable backfill in PR13, before the planner in PR14 depends on it |
| `FlowVersion` returns under a new name | **High, silent** | R6: no new entity with an ordered `steps` array. Review-time rule; cannot be automated |

The last row is the one worth watching. Every other risk is a build failure or an incident — loud,
and fixed within a day. R6 fails quietly: someone adds a "saved automation" table with an ordered
steps array, it looks like a feature, and the graph model is back with a different label. That is the
failure mode this entire ADR exists to prevent.

---

## 5. What "done" means

The architecture is complete when all of the following hold:

| # | Criterion | Check |
|---|---|---|
| 1 | Zero `Flow*` symbols in `packages/runtime`, `server/sandbox`, `server/engine` | grep |
| 2 | `core/execution` exports only runtime contracts; unused-export ratio under 10% | currently 54% (93 of 171) |
| 3 | The engine imports nothing from `@inboxfm-connect/shared` | `no-restricted-imports` passes |
| 4 | Every package is linted; zero `any` in `packages/runtime` | `turbo run lint` |
| 5 | A prompt produces an `Execution` with `ToolCall` rows and a resumable event stream | integration test |
| 6 | A schedule trigger fires a recurring prompt durably across a restart | integration test |
| 7 | MCP exposes connections, tools, capabilities, and execution with no flow vocabulary | manual + schema snapshot |
| 8 | Tool search is populated and scoped to connected integrations | integration test |
| 9 | No entity anywhere holds a user-authored ordered step list | review |

Criterion 9 is the one that defines the product. The other eight are how you get there.
