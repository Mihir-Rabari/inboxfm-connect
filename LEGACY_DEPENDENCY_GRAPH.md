# LEGACY_DEPENDENCY_GRAPH

**PR7 — Phase 3.** Every remaining dependency on the legacy workflow vocabulary:
`Flow`, `FlowVersion`, `Trigger`, `Waitpoint`, `SampleData`, `Router`, `Loop`, `Canvas`, `Folder`,
`Builder`, `Workflow`.

Extracted from named import bindings against `@inboxfm-connect/shared` and
`@inboxfm-connect/core-execution`. Production and test sites are separated because they have different
removal costs.

**Totals:** 32 distinct legacy symbols imported across **43 production files** and **32 test files**.

---

## 1. Reachability classes used below

| Class | Meaning |
|---|---|
| `LIVE-TOOL` | On the `POST /v1/execute` tool path |
| `LIVE-TRIGGER` | On the `EXECUTE_TRIGGER_HOOK` engine operation path |
| `LIVE-SANDBOX` | Inside sandbox provisioning, reachable via `sandbox.ts:112` |
| `COMPILED-UNROUTED` | Compiles and typechecks; the HTTP module that would reach it is commented out in `app.ts` |
| `MIGRATION-ONLY` | Historical DB migration; runs once on an old database, never on a fresh one |
| `DEAD` | No inbound edge at all |
| `TEST-ONLY` | Only test files |

---

## 2. `packages/server/engine` — 18 production import sites

| Importer | Imported symbols | Reachability |
|---|---|---|
| `src/lib/handler/context/engine-constants.ts` | `FlowVersionState`, `TriggerHookType`, `flowStructureUtil` | `LIVE-TOOL` + `LIVE-TRIGGER` |
| `src/lib/helper/trigger-helper.ts` | `TriggerHookType`, `FlowTrigger`, `PieceTrigger`, `TriggerSourceScheduleType`, `AUTHENTICATION_PROPERTY_NAME` | `LIVE-TRIGGER` |
| `src/lib/operations/trigger-hook.operation.ts` | `TriggerHookType` | `LIVE-TRIGGER` |
| `src/lib/operations/index.ts` | `TriggerHookType` | `LIVE-TOOL` (dispatch switch) |
| `src/lib/handler/context/execution-context.ts` | `StepOutputStatus` | `LIVE-TOOL` |
| `src/lib/helper/logging-utils.ts` | `StepOutput` | `LIVE-TOOL` |
| `src/lib/helper/sizeof.ts` | `StepOutputType` | `LIVE-TOOL` |
| `src/lib/helper/piece-helper.ts` | `AUTHENTICATION_PROPERTY_NAME` | `LIVE-TOOL` |
| `src/lib/variables/props-processor.ts` | `AUTHENTICATION_PROPERTY_NAME` | `LIVE-TOOL` |
| `src/lib/piece-context/flows.ts` | `PopulatedFlow` | `LIVE-TOOL` — injected into piece context by `piece-helper.ts` and `trigger-helper.ts` |
| `src/lib/piece-context/waitpoint-client.ts` | `CreateWaitpointRequest`, `CreateWaitpointResponse` | **`DEAD`** — 0 importers; calls `v1/waitpoints`, which no route serves |

Test-only: `test/helper/logging-utils.test.ts`, `test/operations/trigger-hook-operation.test.ts`,
`test/variables/props-resolver.test.ts` (9 bindings).

### Note on `AUTHENTICATION_PROPERTY_NAME`

Declared in `core/execution/src/lib/flows/triggers/trigger.ts` — a *workflow* file — but it is not a
workflow concept. It is the reserved input key (`'auth'`) that `piece-helper.ts:216` uses to inject a
connection into piece input. It is also **duplicated** in
`core/piece-types/src/lib/trigger.ts` (identical). Removing the workflow file only requires the engine
to import the `core-piece-types` copy.

---

## 3. `packages/server/sandbox` — 19 production import sites

This is the densest legacy coupling in the repository.

| Importer | Imported symbols | Reachability |
|---|---|---|
| `src/lib/types.ts` | `FlowVersion`, `FlowVersionState` | `LIVE-SANDBOX` — defines `ResolveResult`, `CodeArtifact` |
| `src/lib/resolver.ts` | `FlowVersion` | `LIVE-SANDBOX` — `createResolver`, called at `sandbox.ts:112` |
| `src/lib/cache/flow/flow-provisioning.ts` | `FlowVersion`, `FlowVersionState`, `FlowActionType`, `Step`, `flowStructureUtil`, `LATEST_FLOW_SCHEMA_VERSION` | `LIVE-SANDBOX` |
| `src/lib/cache/flow/flow-steps.ts` | `FlowVersion`, `FlowActionType`, `FlowTriggerType`, `Step`, `flowStructureUtil` | `LIVE-SANDBOX` |
| `src/lib/cache/flow/flow-cache.ts` | `FlowVersion`, `FlowVersionState`, `LATEST_FLOW_SCHEMA_VERSION` | `LIVE-SANDBOX` |
| `src/lib/cache/flow/flow-bundle-store.ts` | `FlowVersion`, `LATEST_FLOW_SCHEMA_VERSION` | `LIVE-SANDBOX` |

Test-only: `test/lib/cache/flow/code/code-builder.test.ts`,
`test/lib/cache/flow/flow-bundle-store.test.ts`, `test/lib/cache/flow/flow-provisioning.test.ts`
(11 bindings).

### Why this is structural, not incidental

```ts
// packages/server/sandbox/src/lib/types.ts:26
export type ResolveResult =
    | { kind: 'ready', provision: ProvisionInput, flowVersion?: FlowVersion }
    | { kind: 'flow-not-found' }
    | { kind: 'disabled' }

// packages/server/sandbox/src/lib/types.ts:102
export type CodeArtifact = {
    name: string
    sourceCode: SourceCode
    flowVersionId: string
    flowVersionState: FlowVersionState
}
```

The sandbox's public seam is expressed in flow vocabulary: it resolves a *flow version*, keys its code
cache by *flow version id*, and reports *flow-not-found* / *disabled*. `ProvisionInput.flowVersionId`
is also optional-but-present.

**However:** the *headless* path never enters this branch. `HeadlessRuntime` passes
`provision` directly (`packages/runtime/src/index.ts:47`) and never sets `ResolveInput.flow`, and
`resolver.ts:19` guards the whole flow branch with `if (!isNil(input.flow))`. So the coupling is
**compiled and type-level on the headless path, executed only on the flow path** — which is
reachable only through `user-interaction-watcher.ts`, the sole non-`runtime` consumer of
`@inboxfm-connect/sandbox`.

---

## 4. `packages/server/api` — 22 production import sites

| Importer | Imported symbols | Reachability |
|---|---|---|
| `src/app/mcp/tools/mcp-utils.ts` | `flowStructureUtil`, `FlowActionType`, `Step`, `RouterAction`, `BranchOperator`, `singleValueConditions` | `COMPILED-UNROUTED` (`mcpServerModule` off, `app.ts:208`) |
| `src/app/mcp/tools/ap-validate-step-config.ts` | `RouterActionSettingsWithValidation`, `RouterExecutionType`, `BranchExecutionType` | `COMPILED-UNROUTED` |
| `src/app/mcp/mcp-service.ts` | `PopulatedFlow` | `COMPILED-UNROUTED` |
| `src/app/ee/authentication/project-role/rbac-middleware.ts` | `FlowOperationType` | `LIVE` — RBAC runs on every EE request |
| `src/app/ee/authentication/project-role/rbac-service.ts` | `FlowOperationType` | `LIVE` |
| `src/app/ee/platform/admin/admin-platform.controller.ts` | `TriggerStrategy`, `TriggerTestStrategy` | `LIVE` (EE admin) |
| `src/app/health/health-metrics.service.ts` | `FlowRunStatus` | `LIVE` |
| `src/app/helper/telemetry.utils.ts` | `FlowRunStatus` | `LIVE` |
| `src/app/flags/webhook-secrets-util.ts` | `FlowVersion` | `LIVE` |
| `src/app/tables/table/table.entity.ts` | `Folder` | `LIVE` — but `tablesModule` is off (`app.ts:220`) |
| `src/app/database/migration/postgres/1681107443963-AddInputUiInfo.ts` | `FlowVersion` | `MIGRATION-ONLY` |
| `src/app/database/migration/postgres/1745530653784-AddConnectionIdsToFlowVersion.ts` | `flowStructureUtil` | `MIGRATION-ONLY` |
| `src/app/database/migration/postgres/1764777773932-CreateTemplateTable.ts` | `FlowVersion` | `MIGRATION-ONLY` |
| `src/app/database/migration/postgres/1765993826655-MigrateOldTemplatesToNewSchema.ts` | `FlowVersion` | `MIGRATION-ONLY` |

Test-only: 32 bindings across 14 files, incl. `test/helpers/flow-generator.ts` (9 symbols — a test
fixture factory for flows that no longer exist as entities).

---

## 5. `packages/core/shared` — 8 import sites

`core/shared` is the distribution channel. These are the only files that name `core-execution`
directly:

| Importer | Imported symbols |
|---|---|
| `src/index.ts:37` | `export * from '@inboxfm-connect/core-execution'` — **the whole surface** |
| `src/lib/management/template/template.ts` | `FlowVersion`, `Note` |
| `src/lib/automation/mcp/mcp.ts` | `PopulatedFlow` |
| `src/lib/automation/websocket/index.ts` | `StepRunResponse`, `UpdateStepProgressRequest` |
| `src/lib/core/health/health-metrics-request.ts` | `FlowRunStatus` |
| `src/lib/management/analytics/index.ts` | `FlowStatus` |
| `src/lib/core/common/telemetry.ts` | `RunEnvironment` |
| `src/lib/ee/chat/index.ts` | `ChatPromptOverride` |

---

## 6. `packages/cli` — 3 production import sites

| Importer | Imported symbols | Reachability |
|---|---|---|
| `src/lib/commands/replace-project.ts` | `Folder`, `flowStructureUtil`, `FlowState` | **BROKEN** — see below |

`packages/cli` **does not compile today**. `npx turbo run build` fails:

```
src/lib/commands/replace-project.ts(8,5): error TS2305: Module '"@inboxfm-connect/shared"'
  has no exported member 'ProjectReplaceRequest'.
  (9,5)  ... 'ProjectReplaceResponse'
  (10,5) ... 'RequiredPiece'
  (12,5) ... 'TableState'
```

This is a **pre-existing** break from an earlier PR, not introduced by PR7 (no code was changed in
this PR). It is the only failing package out of 759.

---

## 7. `packages/integrations` — 0 legacy import sites

Integrations import **zero** legacy workflow symbols from `shared` / `core-execution`. They receive
their contracts through `@inboxfm-connect/pieces-framework`, which re-exports from
`@inboxfm-connect/core-piece-types` only (`integrations/framework/src/index.ts:38-135`).

The import boundary from `.claude/rules/core-packages.md` **holds for integrations** and is broken only
by the engine (see `HEADLESS_RUNTIME_BOUNDARY.md` §3a).

---

## 8. Symbol-level summary, production only

| Symbol | Prod files | Scopes |
|---|---|---|
| `FlowVersion` | 11 | core/shared, server/api, server/sandbox |
| `flowStructureUtil` | 6 | cli, server/api, server/engine, server/sandbox |
| `FlowVersionState` | 4 | server/engine, server/sandbox |
| `TriggerHookType` | 4 | server/engine |
| `PopulatedFlow` | 3 | core/shared, server/api, server/engine |
| `FlowRunStatus` | 3 | core/shared, server/api |
| `FlowActionType` | 3 | server/api, server/sandbox |
| `Step` | 3 | server/api, server/sandbox |
| `AUTHENTICATION_PROPERTY_NAME` | 3 | server/engine |
| `LATEST_FLOW_SCHEMA_VERSION` | 3 | server/sandbox |
| `Folder` | 2 | cli, server/api |
| `FlowOperationType` | 2 | server/api |
| `StepOutput`, `StepOutputStatus`, `StepOutputType` | 1 each | server/engine |
| `FlowTrigger`, `PieceTrigger`, `TriggerSourceScheduleType` | 1 each | server/engine |
| `CreateWaitpointRequest`, `CreateWaitpointResponse` | 1 each | server/engine (**dead consumer**) |
| `FlowTriggerType` | 1 | server/sandbox |
| `FlowStatus`, `Note` | 1 each | core/shared |
| `TriggerStrategy`, `TriggerTestStrategy` | 1 each | server/api |
| `RouterAction`, `RouterExecutionType`, `RouterActionSettingsWithValidation`, `BranchOperator`, `BranchExecutionType`, `singleValueConditions` | 1 each | server/api (all `COMPILED-UNROUTED`) |
| `FlowState` | 1 | cli (**broken package**) |

### Legacy vocabulary with ZERO importers

These have no consumer anywhere and are the cleanest signal that the builder is gone:

`Flow` (the zod schema itself), `Loop*` (`LoopOnItemsAction`, `LoopStepOutput`, `LoopStepResult`,
`LoopOnItemsActionSchema`, `LoopOnItemsActionSettings`), `Router*` schemas
(`RouterStepOutput`, `RouterActionSchema`, `RouterBranchesSchema`, `RouterActionSettings`),
all `Canvas` symbols (`flowCanvasUtils`, `FLOW_CANVAS_*` — 8 total), all `Waitpoint` beyond the two
dead request types, `SampleData*` (11 of 12 symbols), `Folder*` request DTOs, all 16 builder mutation
operations (`_addAction`, `_deleteAction`, `_moveAction`, `_getOperationsForPaste`, …), and
`PopulatedTriggerSource`.
