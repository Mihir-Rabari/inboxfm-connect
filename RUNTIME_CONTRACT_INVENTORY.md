# RUNTIME_CONTRACT_INVENTORY

**PR7 — Phase 4.** Every runtime contract that still exists, with owner package, consumers,
serializers, validators, and production usage.

**Validator column semantics:**
- `zod` — a zod schema exists and *is* the type source (`z.infer`), so validation is possible.
- `zod (unenforced)` — a schema exists but no call site validates with it.
- `none` — structural TypeScript type only. Erased at build. Nothing checks the wire payload.

---

## 1. Engine / Runtime operation contracts

Owner: `packages/core/execution/src/lib/engine/engine-operation.ts`

| Contract | Line | Validator | Consumers | Production usage |
|---|---|---|---|---|
| `EngineOperationType` (enum, 6 members) | 12 | enum | runtime, server/api, server/engine, server/sandbox | **LIVE** — dispatch key at `engine/src/lib/operations/index.ts:16` |
| `EngineOperation` (union of 6) | 30 | **none** | server/engine, server/sandbox | **LIVE** — crosses the socket.io boundary unvalidated |
| `BaseEngineOperation` | 52 | **none** | (base type only) | LIVE via subtypes |
| `ExecuteToolOperation` | 76 | **none** | server/engine | **LIVE** — the headless tool path |
| `ExecutePropsOptions` | 85 | **none** | server/engine | **LIVE** — `EXECUTE_PROPERTY`. Carries optional `flowVersion?: FlowVersion` |
| `ExecuteTriggerOperation<HT>` | 103 | **none** | server/engine | **LIVE** — `EXECUTE_TRIGGER_HOOK`. Carries **required** `flowVersion: FlowVersion` |
| `ExecuteValidateAuthOperation` | 61 | **none** | server/engine | **LIVE** — OAuth/API-key validation |
| `ExecuteRefreshTokenAuthOperation` | 67 | **none** | server/engine | **LIVE** — token refresh |
| `ExecuteExtractPieceMetadataOperation` | 73 | **none** | server/engine | **LIVE** — also used by `HeadlessRuntime.listTools` |
| `EngineResponse<T>` | 268 | **none** | server/api, server/engine, server/sandbox | **LIVE** — the universal result envelope |
| `EngineResponseStatus` (enum, 6) | 274 | enum | server/api, server/engine, server/sandbox | **LIVE** — checked at `runtime/src/index.ts:57`, `sandbox` |
| `ExecuteToolResponse` | 328 | **none** | server/engine | **LIVE** — tool result shape |
| `ExecuteTriggerResponse<H>` (conditional type) | 322 | **none** | server/engine | **LIVE** |
| `ExecuteValidateAuthResponse` | 264 | **none** | server/api, server/engine | **LIVE** |
| `ExecuteRefreshTokenAuthResponse` | 69 | **none** | server/api, server/engine | **LIVE** |
| `TriggerPayload` | 116 | `zod (unenforced)` | — (piece-types copy is used instead) | see §6 divergence |
| `EventPayload` | 132 | **none** | server/engine | LIVE (`trigger-helper.ts`) |
| `EngineHttpResponse` | 173 | `zod (unenforced)` | — | aliased as `RuntimeHttpResponse`; **0 importers** |
| `EngineStdout` / `EngineStderr` | 39 / 43 | `zod (unenforced)` | via Runtime aliases | LIVE — stdout/stderr notify channel |
| `StreamStepProgress` (enum) | 90 | enum | server/api, server/engine | LIVE |
| `ResumeReason` (enum) | 95 | enum | server/api | LIVE |
| `ParseEventResponse` | 141 | **none** | — | **0 importers** (piece-types copy used) |
| `AppEventListener` | 148 | **none** | — | **0 importers** directly; used inside `ExecuteTriggerResponse` |
| `normalizeToolOutputToExecuteResponse()` | 336 | n/a (function) | — | **0 importers** (piece-types copy used) |
| `ExecuteActionResponse` | 385 | **none** | — | **0 importers** |

### 1a. "Runtime" rebranded aliases (lines 283-300)

A rename shim, not a second contract:

```ts
export type  RuntimeOperationType   = EngineOperationType
export const RuntimeOperationType   = EngineOperationType
export type  RuntimeResponse<T>     = EngineResponse<T>
export type  RuntimeOperation        = EngineOperation
export const RuntimeStdout           = EngineStdout
// … RuntimeResponseStatus, BaseRuntimeOperation, RuntimeStderr, RuntimeHttpResponse
```

| Alias | Importers |
|---|---|
| `RuntimeResponse` | server/engine, server/sandbox |
| `RuntimeOperationType`, `RuntimeOperation`, `RuntimeStdout`, `RuntimeStderr` | server/sandbox (1 each) |
| `RuntimeResponseStatus`, `BaseRuntimeOperation`, `RuntimeHttpResponse` | **0** |

Both the `Engine*` and `Runtime*` names are in active use for the same types, in different packages.
This is a naming split, not a boundary.

---

## 2. Sandbox ↔ Engine transport contracts

Owner: `packages/core/execution/src/lib/engine/engine-contract.ts` and `rpc.ts`

| Contract | Validator | Consumers | Production usage |
|---|---|---|---|
| `RuntimeContract` — `executeOperation({ operationType, operation })` | **none** | server/engine (`worker-socket.ts`), server/sandbox | **LIVE** — the sandbox↔engine RPC surface |
| `WorkerNotifyContract` — `stdout()` / `stderr()` | **none** | server/engine, server/sandbox | **LIVE** — log streaming |
| `EngineContract` (= `RuntimeContract`) | **none** | — | **0 importers** — dead alias |

### Serializer

`packages/core/execution/src/lib/engine/rpc.ts` — a `Proxy`-based RPC over socket.io.

| Function | Line | Used by |
|---|---|---|
| `createRpcClient` | 16 | server/sandbox |
| `createRpcServer` | 41 | server/engine (`worker-socket.ts`) |
| `createNotifyClient` | 58 | server/api, server/engine |
| `createNotifyServer` | — | server/sandbox |

**Serialization is `JSON.stringify` via socket.io. There is no validation on either side.**
`createRpcServer` dispatches on an untrusted `msg.method` string into the handler map
(`rpc.ts:43-44`) and wraps thrown errors into an `{ __rpcError }` envelope. `Contract` is
`Record<string, (input: any) => any>` — the two `any`s are explicitly eslint-disabled at `rpc.ts:4,8`.

Practical consequence: a shape change to `EngineOperation` on one side of the sandbox boundary
produces a runtime `undefined`, not a validation error. Nothing in the inventory above with
`Validator = none` is protected against version skew between the API process and the engine bundle.

---

## 3. HTTP callback contracts (engine → API)

Owner: `packages/core/execution/src/lib/engine/requests.ts`

| Contract | Line | Validator | Consumer | Production usage |
|---|---|---|---|---|
| `UploadRunLogsRequest` | 11 | `zod` | server/engine | **DEAD** — only consumer is `engine-run-api.ts`, which has 0 importers |
| `UpdateStepProgressRequest` | 35 | `zod` | core/shared, server/engine | **DEAD** as a callback; still re-exported through `shared/lib/automation/websocket` |
| `SendFlowResponseRequest` | 53 | `zod` (with `z.coerce`) | server/engine | **DEAD** — same |
| `UpdateRunProgressRequest` | 73 | **none** | server/engine | **DEAD** — same |
| `FileTransportQueryParams` | 42 | `zod` | server/api | **LIVE** — file transport token |
| `FileReadToken` | 47 | `zod` | server/api | **LIVE** |
| `GetFlowVersionForWorkerRequest` | 66 | `zod (unenforced)` | — | **0 importers** |

**All four run-reporting contracts are dead**, and their transport
(`engine/src/lib/api/engine-run-api.ts`) posts to `v1/engine/run-progress`, `step-progress`,
`run-logs`, and `flow-response` — **none of which is served by any route in `packages/server/api/src/app`**.

`UploadRunLogsRequest` and `UpdateRunProgressRequest` are the contracts that most clearly violate the
runtime/workflow separation; see `PR7_BLOCKERS.md` B1.

---

## 4. Worker / job contracts

| Contract | Owner file | Validator | Consumers | Production usage |
|---|---|---|---|---|
| `WorkerToApiContract` | `lib/workers/worker-contract.ts` | **none** | server/sandbox (8 sites) | **LIVE** — sandbox's API client |
| `ApiToWorkerContract` | same | **none** | server/api | LIVE |
| `GetFlowBundleResponse` | same | **none** | server/sandbox | LIVE |
| remaining 26 exports of `worker-contract.ts` | same | mixed | — | **0 importers** (chat, prewarm, payload, trigger-run, email DTOs) |
| `WorkerJobType` (enum) | `lib/workers/job-data.ts` | enum | server/api | LIVE (16 sites) |
| `LATEST_JOB_DATA_SCHEMA_VERSION` | same | const | server/api | LIVE |
| `ExecuteFlowJobData` | same | — | server/api | LIVE (2 sites) |
| `JobPayload` | same | — | server/engine | **LIVE** — `resolve-job-payload.ts`, on the trigger path |
| `JOB_PRIORITY`, `RATE_LIMIT_PRIORITY`, `PollingJobData` | same | — | server/api | LIVE |
| `ChatPromptOverride` | same | — | core/shared | LIVE |
| remaining 18 exports of `job-data.ts` | same | — | — | **0 importers** |
| `NetworkMode` (enum) | `lib/workers/index.ts` | enum | server/api, server/engine, server/sandbox | **LIVE** — SSRF guard mode |
| `MachineInformation` | same | — | server/api, server/utils | LIVE |
| `ConsumeJobRequest`, `WorkerMachineStatus`, `WorkerMachineType`, `WorkerGroupScope` | same | — | server/api | LIVE |
| remaining 7 exports of `lib/workers/index.ts` | same | — | — | **0 importers** |

`worker-contract.ts` exports 29 symbols and 3 are used. `job-data.ts` exports 26 and 8 are used.

---

## 5. Execution error contracts

Owner: `packages/core/execution/src/lib/engine/execution-errors.ts`. **16 of 18 used** — the
healthiest contract file in the package.

| Contract | Consumers |
|---|---|
| `ExecutionError`, `ExecutionErrorType` | server/engine |
| `EngineGenericError` | server/engine (10 sites — most-used symbol in the file) |
| `FetchError` | server/api, server/engine |
| `ConnectionNotFoundError`, `ConnectionExpiredError` | server/api, server/engine |
| `ConnectionLoadingError` | server/engine |
| `StorageError`, `StorageLimitError`, `StorageInvalidKeyError` | server/engine (+ integrations/community for `StorageLimitError`) |
| `FileSizeError` | server/api, server/engine |
| `EngineFileNotFoundError` | server/engine |
| `SSRFBlockedError` | server/engine (dns + socket guards) |
| `VariableNotFoundError`, `FormulaEvaluationError` | server/engine |
| `InvalidCronExpressionError` | server/engine |
| `FileStoreError`, `PausedFlowTimeoutError` | **0 importers** |

---

## 6. Duplicated contracts — `core-execution` vs `core-piece-types`

**58 declarations are defined twice**, once in each package. `shared` star-exports `core-execution`;
`pieces-framework` re-exports `core-piece-types`. So the server consumes one copy and every integration
consumes the other.

There is no ambiguous re-export (`shared` does not star-export `core-piece-types`), so this compiles
cleanly and is invisible to `tsc`.

| Diff result | Count |
|---|---|
| Structurally identical | 41 |
| Diverged — cosmetic only | 15 |
| **Diverged — semantically real** | **2** |

The 15 cosmetic divergences are zod-style drift: `core-execution` uses `x.optional()` and the
**deprecated** `z.nativeEnum(...)`; `core-piece-types` uses `z.optional(x)` and `z.enum(...)`.
`CLAUDE.md` explicitly requires `z.enum` over `z.nativeEnum`, so the `core-execution` copies are the
stale ones.

### The 2 real divergences

**`TriggerPayload`** — the zod validators disagree on `method`:

```ts
// core-execution/src/lib/engine/engine-operation.ts:116
export const TriggerPayload = z.object({
    body: z.unknown(),
    rawBody: z.unknown().optional(),
    method: z.string().optional(),          // <-- present
    headers: z.record(z.string(), z.string()),
    queryParams: z.record(z.string(), z.string()),
})

// core-piece-types/src/lib/engine.ts:3
export const TriggerPayload = z.object({
    body: z.unknown(),
    rawBody: z.optional(z.unknown()),
    // method absent from the schema — but present on the TS type below
    headers: z.record(z.string(), z.string()),
    queryParams: z.record(z.string(), z.string()),
})
```

Both TS types declare `method?: string`. Only `core-execution`'s **schema** validates it. Whichever
copy is used to `.parse()` a webhook payload, `method` is silently dropped by the `core-piece-types`
copy.

**`PopulatedFlow`** — not the same kind of thing in each package:

```ts
// core-execution/src/lib/flows/flow.ts — a runtime-validatable zod schema
export const PopulatedFlow = Flow.extend({
    version: FlowVersion,
    triggerSource: zMini.optional(zMini.pick(TriggerSource, { schedule: true })),
})

// core-piece-types/src/lib/flow-contracts.ts — a hand-written structural subset, no validator
export type PopulatedFlow = {
    id: string
    externalId?: string
    status: FlowStatus
    version: { displayName: string, trigger: { … } }
}
```

`engine/src/lib/piece-context/flows.ts` imports the `shared` (zod) copy; integrations get the
narrow structural copy through `pieces-framework`. The same name denotes two different contracts
across the sandbox boundary. See `PR7_BLOCKERS.md` B2.

---

## 7. Websocket / step-progress contracts

| Contract | Owner | Consumers |
|---|---|---|
| `StepRunResponse` | `core/execution/src/lib/flows/sample-data/index.ts` | `core/shared/src/lib/automation/websocket/index.ts` |
| `UpdateStepProgressRequest` | `core/execution/src/lib/engine/requests.ts` | same |

`shared/lib/automation/websocket/index.ts:1` imports both from `core-execution` and re-exports them as
the websocket event surface. The **dead** engine-side transport for `UpdateStepProgressRequest` is
`engine-run-api.ts` (0 importers); the websocket declaration itself is still exported from `shared`.

`socket.io-client` is a declared dependency of `core/execution` (`package.json`), used only by
`rpc.ts`.

---

## 8. Aggregate contract health

| Owner file | Exported | Imported by name | Unused |
|---|---|---|---|
| `lib/engine/engine-operation.ts` | 36 | 24 | 12 |
| `lib/engine/execution-errors.ts` | 18 | 16 | 2 |
| `lib/engine/requests.ts` | 7 | 6 | 1 |
| `lib/engine/rpc.ts` | 4 | 4 | 0 |
| `lib/engine/engine-contract.ts` | 3 | 2 | 1 |
| `lib/engine/engine-constants.ts` | 2 | 2 | 0 |
| `lib/workers/worker-contract.ts` | 29 | 3 | **26** |
| `lib/workers/job-data.ts` | 26 | 8 | **18** |
| `lib/workers/index.ts` | 13 | 6 | 7 |
| `lib/agents/tools.ts` | 19 | 6 | 13 |
| `lib/agents/index.ts` | 14 | 1 | 13 |
| **Totals** | **171** | **78** | **93** |

**54% of the declared contract surface has no consumer.** The `engine/*` files are healthy (54 of 70
used); the `workers/*` and `agents/*` files are not (18 of 68 used) — the agents figures are explained
by §6 duplication, since integrations use the `core-piece-types` copies instead.
