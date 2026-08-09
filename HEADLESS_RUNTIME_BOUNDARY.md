# HEADLESS_RUNTIME_BOUNDARY

**PR7 — Phase 1, 2, 6, 7.** Repository classification, the real runtime dependency graph, package
ownership, and headless-runtime certification.

No code was changed to produce this document. Every claim below is derived from parsed `import` /
`export` statements across all **10,418** non-`node_modules` TypeScript files in `packages/`, plus
direct reads of the files named.

---

## 0. Method (and what it can and cannot prove)

`@inboxfm-connect/shared` contains a blanket re-export:

```ts
// packages/core/shared/src/index.ts:37
export * from '@inboxfm-connect/core-execution'
```

**Consequence:** file-level reverse-dependency analysis of `packages/core/execution` is meaningless —
nothing in the repo imports `@inboxfm-connect/core-execution` directly except `core/shared` itself
(8 import sites). Every other consumer reaches it through the `shared` barrel.

So classification here is **symbol-level**: for each exported declaration in `core/execution`, we
extracted every named import binding repo-wide from `@inboxfm-connect/shared` and
`@inboxfm-connect/core-execution` and matched binding names against declarations.

Two validity checks were run before trusting this:

| Check | Result |
|---|---|
| Namespace imports (`import * as X from '@inboxfm-connect/shared'`) that would hide symbol usage | **0 found** — symbol-level analysis is sound |
| Naive whole-word text matching (rejected) | Produced false positives: `Note` 242 "hits", `Folder` 119, `Flow` 46. All were prose/unrelated identifiers. Binding-level counts are used instead |

**Limitation:** a symbol reachable *only* through a `export * from` barrel chain and never imported by
name is counted as unconsumed. That is the intended semantics (nothing can be using it), but it means
"delete" still requires removing the corresponding barrel line. Dynamic `import()` was included in the
scan — this caught `no-op-code-sandbox.ts`, which is dynamically loaded and would otherwise have been
mis-flagged as dead.

---

## 1. Phase 1 — Repository classification

### 1a. `packages/core/execution` — 66 source files

Every file is assigned exactly one category.

| Category | Files |
|---|---|
| `EXECUTION_CONTRACT` | 12 |
| `SHARED_SCHEMA` (barrel only) | 6 |
| `LEGACY_WORKFLOW` | 34 |
| `DEAD_CODE` | 14 |
| `HEADLESS_RUNTIME` | 0 |
| `ENGINE_RUNTIME` | 0 |
| `SANDBOX_RUNTIME` | 0 |
| `UNKNOWN` | 0 |

`core/execution` contains **no implementation** — it is a pure contract package. The zero counts for
`HEADLESS_RUNTIME` / `ENGINE_RUNTIME` / `SANDBOX_RUNTIME` are a correct result, not a gap.

#### EXECUTION_CONTRACT (12)

| File | Exported | Consumed | Consumer packages |
|---|---|---|---|
| `lib/engine/engine-operation.ts` | 36 | 24 | runtime, server/api, server/engine, server/sandbox |
| `lib/engine/execution-errors.ts` | 18 | 16 | server/api, server/engine |
| `lib/engine/requests.ts` | 7 | 6 | core/shared, server/api, server/engine |
| `lib/engine/rpc.ts` | 4 | 4 | server/api, server/engine, server/sandbox |
| `lib/engine/engine-contract.ts` | 3 | 2 | server/engine, server/sandbox |
| `lib/engine/engine-constants.ts` | 2 | 2 | server/engine |
| `lib/agents/tools.ts` | 19 | 6 | server/api, server/engine, server/sandbox |
| `lib/agents/mcp.ts` | 2 | 2 | server/api |
| `lib/agents/mcp-tool-name-util.ts` | 1 | 0 | — (test-only) |
| `lib/workers/worker-contract.ts` | 29 | 3 | server/api, server/sandbox |
| `lib/workers/job-data.ts` | 26 | 8 | core/shared, server/api, server/engine |
| `lib/workers/index.ts` | 13 | 6 | server/api, server/engine, server/sandbox, server/utils |

#### SHARED_SCHEMA — re-export barrels (6)

These declare nothing; they only forward. They must be retained (or edited) whenever a leaf is removed.

`index.ts`, `lib/flows/index.ts`, `lib/flow-run/execution/index.ts`, `lib/flows/properties/index.ts`,
`lib/agents/index.ts`, `lib/engine/index.ts`

#### LEGACY_WORKFLOW (34) — split by whether the runtime still pulls on them

**Runtime-reachable legacy (14 files)** — these are the actual coupling to remove, and cannot be
deleted today:

| File | Consumed symbols | Consumer packages |
|---|---|---|
| `lib/flows/flow-version.ts` | `FlowVersion`, `FlowVersionState`, `LATEST_FLOW_SCHEMA_VERSION` | core/shared, server/api, server/engine, server/sandbox |
| `lib/flows/actions/action.ts` | `FlowActionType`, `SourceCode`, `RouterAction`, `BranchOperator`, +5 | server/api, server/engine, server/sandbox |
| `lib/flows/triggers/trigger.ts` | `FlowTriggerType`, `FlowTrigger`, `PieceTrigger`, `AUTHENTICATION_PROPERTY_NAME` | server/api, server/engine, server/sandbox |
| `lib/flows/util/flow-structure-util.ts` | `flowStructureUtil`, `Step` | cli, server/api, server/engine, server/sandbox |
| `lib/flows/flow.ts` | `FlowStatus`, `PopulatedFlow`, `FlowOperationStatus`, `FlowCreatorType` | core/shared, server/api, server/engine |
| `lib/flow-run/execution/step-output.ts` | `StepOutputStatus`, `GenericStepOutput`, `StepOutput`, +2 | server/engine |
| `lib/flow-run/execution/flow-execution.ts` | `FlowRunStatus`, `RespondResponse` | core/shared, server/api, server/engine |
| `lib/flow-run/execution/execution-output.ts` | `ExecutionType`, `ResumePayload` | server/api, server/engine |
| `lib/flow-run/flow-run.ts` | `RunEnvironment` | core/shared, server/api |
| `lib/flow-run/waitpoint/index.ts` | `CreateWaitpointRequest`, `CreateWaitpointResponse` | server/engine (dead consumer — see §5) |
| `lib/flows/properties/property.ts` | `PropertySettings`, `PropertyExecutionType` | server/api, server/engine |
| `lib/flows/folders/folder.ts` | `Folder`, `UncategorizedFolderId` | cli, server/api |
| `lib/flows/sample-data/index.ts` | `StepRunResponse` | core/shared |
| `lib/flows/test-trigger.ts` | `TriggerTestStrategy` | server/api |
| `lib/flows/note.ts` | `Note` | core/shared |
| `lib/flows/operations/index.ts` | `FlowOperationType`, `StepLocationRelativeToParent` | server/api |

**Builder-only legacy (18 files)** — zero external consumers, but each is imported by
`lib/flows/operations/index.ts`, which *is* consumed (for `FlowOperationType` only). They are
transitively retained by one barrel, not by real use:

`operations/add-action.ts`, `add-action-util.ts`, `add-branch.ts`, `copy-action-operations.ts`,
`delete-action.ts`, `delete-branch.ts`, `duplicate-step.ts`, `import-flow.ts`, `move-action.ts`,
`move-branch.ts`, `notes-operations.ts`, `paste-operations.ts`, `skip-action.ts`, `update-action.ts`,
`update-sample-data-info.ts`, `update-trigger.ts`, plus `util/flow-piece-util.ts`,
`triggers/trigger-run.ts`.

#### DEAD_CODE (14)

See `DELETE_CANDIDATES.md`.

### 1b. `packages/server/engine` — 45 source files

| Category | Files | Notes |
|---|---|---|
| `ENGINE_RUNTIME` | 43 | entry point, operation dispatch, piece loading, props resolution, network guards, code sandboxes, piece context |
| `DEAD_CODE` | 2 | `lib/api/engine-run-api.ts`, `lib/piece-context/waitpoint-client.ts` |
| `LEGACY_WORKFLOW` | 0 | no file here *is* a workflow model; several *consume* them (see `LEGACY_DEPENDENCY_GRAPH.md`) |
| `EXECUTION_CONTRACT` | 0 | contracts live in `core/execution` |
| `UNKNOWN` | 0 | |

`main.ts` has zero inbound edges by design (it is the process entry point, built by
`esbuild.config.mjs`). `no-op-code-sandbox.ts` and `v8-isolate-code-sandbox.ts` have zero *static*
inbound edges but are loaded via `await import()` from `lib/core/code/code-sandbox.ts:8,13` — both are
live.

---

## 2. Phase 2 — Runtime boundary map (real edges only)

Every edge below is a verified import or call site, with file and line.

```
HTTP  POST /v1/execute
  │   packages/server/api/src/app/app.ts:205   await app.register(executeModule)
  ▼
executeModule                     packages/server/api/src/app/execute/execute.module.ts:5
  │   app.register(executeController, { prefix: '/v1/execute' })
  ▼
executeController                 packages/server/api/src/app/execute/execute.controller.ts:50
  │   import { HeadlessRuntime } from '@inboxfm-connect/runtime'          (line 1)
  │   new HeadlessRuntime({ ... })                                        (line 13)
  │   runtime.execute({ integration, tool, connectionId, input, ... })    (line 53)
  ▼
HeadlessRuntime.execute           packages/runtime/src/index.ts:17
  │
  ├── CONNECTION ────────────────────────────────────────────────────────────────
  │     config.database.getConnection()      -> appConnectionsRepo().findOneBy()
  │                                             execute.controller.ts:26
  │     config.decryptAndRefresh()           -> appConnectionService.decryptAndRefreshConnection()
  │                                             execute.controller.ts:44
  │
  └── SANDBOX ───────────────────────────────────────────────────────────────────
        import { createSandboxRuntime } from '@inboxfm-connect/sandbox'   (runtime/src/index.ts:1)
        sandboxRuntime.execute({ operationType: EXECUTE_TOOL, operation, provision })
                                                                          (runtime/src/index.ts:33)
          ▼
        createSandboxRuntime          packages/server/sandbox/src/lib/sandbox.ts:24
          │  manager.acquire({ log })                                     (sandbox.ts:38)
          │  localExecutionCache(...).provision({ pieces, codeSteps })     (sandbox.ts:41)
          ▼
        sandbox box (fork / isolate)  packages/server/sandbox/src/lib/sandbox/{fork,isolate}.ts
          │  socket.io transport
          │  createRpcClient  <- @inboxfm-connect/core-execution (lib/engine/rpc.ts:16)
          ▼
        ENGINE PROCESS              packages/server/engine/src/main.ts
          │  ssrfGuard.install()                                          (main.ts:5)
          │  workerSocket.init(SANDBOX_ID)                                (main.ts:11)
          ▼
        workerSocket                packages/server/engine/src/lib/worker-socket.ts
          │  createRpcServer(socket, { executeOperation })  — RuntimeContract
          ▼
        operations.execute()        packages/server/engine/src/lib/operations/index.ts:14
          │  switch (operationType) — 6 cases, no flow execution
          ▼
        INTEGRATION / TOOL
        pieceHelper.executeTool     packages/server/engine/src/lib/helper/piece-helper.ts:204
          │  pieceLoader.getPieceAndActionOrThrow()                        (line 207)
          │  propsProcessor.applyProcessorsAndValidators()                 (line 219)
          │  pieceAction.run(context)
          ▼
        RESULT
        EngineResponse<unknown>     core/execution/src/lib/engine/engine-operation.ts:268
          status: EngineResponseStatus
          │  runtime/src/index.ts:57  if (result.status !== 'OK') throw
          ▼
        HTTP 200  z.unknown()       execute.controller.ts:83
```

**Verified property of this path:** the `EXECUTE_TOOL` leg carries **no `FlowVersion`**.
`ExecuteToolOperation` (`engine-operation.ts:76`) is
`BaseEngineOperation & { pieceName, pieceVersion, actionName, input, auth? }` — no workflow type.
Where the piece context needs flow identity, `piece-helper.ts:235-236` passes the string literals
`flowId: 'headless'` / `flowVersionId: 'headless'`. Those are store-key sentinels, not model
references.

---

## 3. Phase 6 — Package ownership

| Package | Declared responsibility | Verdict |
|---|---|---|
| `packages/core/execution` | Execution contracts only | **VIOLATION** — 34 of 66 files are workflow models (`LEGACY_WORKFLOW`), 14 are dead |
| `packages/server/engine` | Execution implementation | **VIOLATION** — imports `@inboxfm-connect/shared` in 31 src files, which the project's own rule forbids |
| `packages/server/sandbox` | Isolated execution | **VIOLATION** — `Resolver` / `CodeArtifact` / `ProvisionInput` are typed on `FlowVersion` |
| `packages/core/shared` | Cross-package DTOs | **VIOLATION** — blanket `export *` of `core-execution` makes it the sole distribution channel for legacy workflow models |
| `packages/runtime` | Headless runtime | **VIOLATION** — unlinted; `any` throughout |
| `packages/scheduler` | Scheduling | **Clean** — only dependency is `node-cron`; zero coupling to `shared` or workflow types |
| `packages/core/piece-types` | Piece-facing contracts | **VIOLATION** — 58 declarations duplicate `core-execution` |

As instructed, files are reported, not moved.

### 3a. Engine → `shared` boundary violation

`.claude/rules/core-packages.md` states:

> pieces and **the engine** may import `core-utils | core-piece-types | core-formula | core-execution`,
> but **never** `@activepieces/shared`

`packages/server/engine/package.json:14` declares `"@inboxfm-connect/shared": "workspace:*"`, and 31
engine source files import from it (plus 7 test files). Complete list of violating src files:

`api/engine-file-api.ts`, `api/engine-run-api.ts`, `core/code/code-sandbox.ts`,
`handler/context/engine-constants.ts`, `handler/context/execution-context.ts`,
`helper/logging-utils.ts`, `helper/piece-helper.ts`, `helper/piece-loader.ts`, `helper/sizeof.ts`,
`helper/trigger-helper.ts`, `network/dns-lookup-guard.ts`, `network/socket-connect-guard.ts`,
`network/ssrf-guard.ts`, `operations/auth-refresh.operation.ts`,
`operations/auth-validation.operation.ts`, `operations/index.ts`,
`operations/piece-metadata.operation.ts`, `operations/property.operation.ts`,
`operations/trigger-hook.operation.ts`, `operations/utils/resolve-job-payload.ts`,
`piece-context/connection-resolver.ts`, `piece-context/file-uploader.ts`, `piece-context/flows.ts`,
`piece-context/store.ts`, `piece-context/variable-resolver.ts`, `piece-context/waitpoint-client.ts`,
`tools/index.ts`, `utils.ts`, `variables/props-processor.ts`, `variables/props-resolver.ts`,
`worker-socket.ts`.

**Nothing enforces this rule.** `packages/server/engine/.eslintrc.json` extends
`../api/.eslintrc.json` and only sets `no-console: off`. The root `.eslintrc.json` restricts
`lodash` only. There is no `no-restricted-imports` pattern for `@inboxfm-connect/shared`.

### 3b. Packages excluded from linting entirely

Root `.eslintrc.json` sets `"ignorePatterns": ["**/*"]`. A package is linted only if it supplies its
own `.eslintrc.json` that re-includes its files.

| Package | `.eslintrc.json` | `lint` script | Effective state |
|---|---|---|---|
| `packages/runtime` | **missing** | yes | **`turbo run lint` fails**: "All files matched by 'src/\*\*/\*.ts' are ignored" |
| `packages/scheduler` | **missing** | yes | same failure mode |
| `packages/server/utils` | **missing** | none | never linted |
| `cli`, `core/execution`, `core/shared`, `server/api`, `server/engine`, `server/sandbox` | present | yes | linted |

This is why `packages/runtime/src/index.ts` carries `private sandboxRuntime: any`,
`log: console as any`, `getSettings: () => any`, and `metadata as any` without any rule firing —
despite `CLAUDE.md` stating **"No `any` type"**.

---

## 4. Phase 7 — Headless runtime certification

**Target:** `Connection → Integration → Tool → Execution → Result` without
`Flow / Workflow / Trigger / Router / Loop / Builder / Canvas`.

### Certified

| Requirement | Status | Evidence |
|---|---|---|
| A headless entry point exists and is routed | **PASS** | `POST /v1/execute` registered at `app.ts:205` |
| The tool-execution contract carries no workflow type | **PASS** | `ExecuteToolOperation`, `engine-operation.ts:76` |
| `EngineOperationType` has no flow-execution operation | **PASS** | 6 members, no `EXECUTE_FLOW` (`engine-operation.ts:12`) |
| Engine dispatch has no flow branch | **PASS** | `operations/index.ts:16-42`, 6 cases |
| No workflow tables remain | **PASS** | `getEntities()` (`database-connection.ts:54-99`) has no `Flow`, `FlowVersion`, `FlowRun`, `Folder`, `TriggerEvent`, or `Waitpoint` entity |
| No workflow HTTP surface | **PASS** | `flowModule`, `flowRunModule`, `folderModule`, `webhookModule`, `triggerModule`, `humanInputModule`, `workerModule` all commented out at `app.ts:184-214` |
| No builder frontend | **PASS** | `packages/web` does not exist; workspaces list at `package.json` has no web entry |
| Router / Loop / Canvas reachable from the runtime | **PASS** | `RouterStepOutput`, `LoopStepOutput`, `LoopStepResult`, all `flowCanvasUtils` symbols, and `RouterActionSchema` / `LoopOnItemsAction` have **zero** importers |
| Scheduler independent of workflow types | **PASS** | `packages/scheduler` depends only on `node-cron` |

### Violations — 5 remaining

| # | Violation | Evidence | Blocks |
|---|---|---|---|
| V1 | `ExecuteTriggerOperation.flowVersion: FlowVersion` is **required** | `engine-operation.ts:103` | Deleting `FlowVersion`. `EXECUTE_TRIGGER_HOOK` is a live engine operation |
| V2 | Sandbox `Resolver` contract is typed on `FlowVersion` | `sandbox/src/lib/types.ts:26,102`; `resolver.ts:18,20`; invoked at `sandbox.ts:112,116` | Decoupling the Sandbox subsystem |
| V3 | MCP service depends on `PopulatedFlow` | `server/api/src/app/mcp/mcp-service.ts`; `engine/src/lib/piece-context/flows.ts` | Decoupling MCP. Mitigated: `mcpServerModule` is commented out at `app.ts:208`, so not HTTP-reachable |
| V4 | `UpdateRunProgressRequest` / `UploadRunLogsRequest` embed `FlowRun`, `StepOutput`, `FlowRunStatus`, `FailedStep`, `StepRunResponse` | `requests.ts:11-30,73` | These are *runtime* contracts that *are* workflow models — see `PR7_BLOCKERS.md` B1 |
| V5 | `ExecutePropsOptions.flowVersion?: FlowVersion` (optional) | `engine-operation.ts:88` | `EXECUTE_PROPERTY` is live; the field is optional, so this is the cheapest of the five |

**Certification result: CONDITIONAL PASS.** The `Connection → Integration → Tool → Execution → Result`
path is real, routed, and free of workflow types end to end. The five violations sit in the
*trigger* and *run-reporting* paths, not the tool path.

---

## 5. Deliverable index

| Document | Phase |
|---|---|
| `HEADLESS_RUNTIME_BOUNDARY.md` | 1, 2, 6, 7 |
| `LEGACY_DEPENDENCY_GRAPH.md` | 3 |
| `RUNTIME_CONTRACT_INVENTORY.md` | 4 |
| `DELETE_CANDIDATES.md` | 5 |
| `PR7_HEADLESS_CONSOLIDATION.md` | summary |
| `PR7_BLOCKERS.md` | stop conditions |
