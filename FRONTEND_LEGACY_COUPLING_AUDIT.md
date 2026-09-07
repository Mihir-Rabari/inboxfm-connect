# Frontend Legacy Coupling Audit: InboxFM Connect

## 1. Audit Scope & Methodology

This forensic audit investigates all remaining references to legacy workflow runtime concepts across the frontend, shared types, engine interfaces, and client SDKs.

The target criteria:
- **Active HeadlessRuntime functionality**: Real active headless endpoints, models, or services.
- **Type-only compatibility**: SDK compile-time definitions retained strictly for external piece compatibility.
- **Legacy frontend functionality**: UI components/stores expecting the old flow runtime (must NOT be reintroduced).
- **Dead code**: Unused or abandoned code paths that must be removed.

---

## 2. Forensic Reference Classification Matrix

| Symbol / Reference | File / Module | Classification | Runtime Active? | Retained? | Forensic Notes & Rationale |
| :--- | :--- | :--- | :---: | :---: | :--- |
| `PopulatedFlow` | `packages/core/piece-types/src/lib/flow-contracts.ts` | Type-only compatibility | **NO** | **YES** | SDK interface definition retained for compile-time compatibility with external custom pieces. |
| `PopulatedFlowSummary` | `packages/core/piece-types/src/lib/flows.ts` | Type-only compatibility | **NO** | **YES** | SDK interface definition retained for compile-time compatibility with external piece packages. |
| `PopulatedFlow` | `packages/integrations/framework/src/index.ts` | Type-only compatibility | **NO** | **YES** | Framework export ensuring piece authors can build against standard types. |
| `PopulatedFlow` | `packages/integrations/community/ai/src/lib/actions/agents/utils.ts` | Type-only compatibility | **NO** | **YES** | Compile-time type cast for AI agent tool metadata inspection. |
| `PopulatedFlow` | `packages/integrations/core/subflows/src/lib/common.ts` | Type-only compatibility | **NO** | **YES** | Action definition signature for third-party piece compatibility. |
| `PopulatedFlow` | `packages/server/engine/src/lib/piece-context/flows.ts` | Type-only compatibility | **NO** | **YES** | Retained in piece execution context signature. |
| `FlowVersionId` (sentinel) | `packages/server/engine/src/lib/piece-helper.ts` | Sentinel value | **NO** | **YES** | Passes `'headless'` string sentinel for store-key scoping in piece context. |
| `FlowId` (sentinel) | `packages/server/engine/src/lib/piece-helper.ts` | Sentinel value | **NO** | **YES** | Passes `'headless'` string sentinel for store-key scoping in piece context. |
| `STEP_SETTINGS_QUERY_PARAMS` | `packages/ee/embed-sdk/src/index.ts` | Client Embed SDK legacy | **NO** | **MIGRATE** | Embed SDK contains legacy query params (`flowId`, `flowVersionId`, `stepName`). Needs migration to headless execution/tool selection. |
| `ActivepiecesBuilderHomeButtonClicked` | `packages/ee/embed-sdk/src/index.ts` | Client Embed SDK legacy | **NO** | **MIGRATE** | Embed SDK event for navigation; to be updated for headless navigation. |
| `1807000000000-DropWorkflowTables.ts` | `packages/server/api/src/app/database/migration/postgres/` | Migration History | **NO** | **YES** | Permanent DB migration dropping legacy workflow tables (`flow`, `flow_version`, `flow_run`, `folder`, `waitpoint`). |
| `FlowEntity` / `FlowVersionEntity` | `database-connection.ts` | Dead entity | **NO** | **NO** | Completely unregistered from TypeORM. |
| `FlowRunEntity` | `database-connection.ts` | Dead entity | **NO** | **NO** | Completely unregistered from TypeORM. |
| `TriggerBindingEntity` | `packages/server/api/src/app/execution/trigger-binding/` | Active Headless | **YES** | **YES** | Registered entity replacing legacy trigger engine with direct event-to-tool binding. |
| `ScheduledTaskEntity` | `packages/server/api/src/app/execution/scheduled-task/` | Active Headless | **YES** | **YES** | Registered entity replacing legacy flow cron triggers with direct headless task scheduling. |
| `ExecutionEntity` | `packages/server/api/src/app/execution/execution-entity.ts` | Active Headless | **YES** | **YES** | Registered entity tracking headless executions, token usage, cost, and finish status. |
| `ToolCallEntity` | `packages/server/api/src/app/execution/tool-call/` | Active Headless | **YES** | **YES** | Registered entity tracking individual tool execution invocations, latency, inputs, and outputs. |

---

## 3. Frontend Legacy State & Hook Audit

| Legacy Concept | Former Purpose | Target Headless Replacement | Status |
| :--- | :--- | :--- | :--- |
| `flowStore` | Stored active flow graph & nodes | `executionStore` / `executionRunnerState` | Eliminated — No graph state |
| `flowEditorStore` | Managed canvas zoom, pan, dragging | Direct tool configuration form state (`react-hook-form`) | Eliminated — No canvas |
| `flowRunStore` | Tracked step-by-step DAG execution | `useExecutionEvents` (SSE stream) + `useToolCalls` | Replaced by SSE streaming |
| `useFlow` / `useFlows` | Fetched flow lists and versions | `useTriggerBindings` / `useScheduledTasks` | Replaced by direct automations |
| `useFlowRun` | Polled flow run logs | `useExecution` (`GET /v1/executions/:id`) | Replaced by Execution API |
| `usePieceMetadata` | Loaded piece actions & triggers | `useIntegrations` (`GET /v1/integrations`) | Active & verified |
| `useAppConnections` | Managed piece connections | `useAppConnections` (`/v1/app-connections`) | Active & verified |

---

## 4. Banned Frontend Anti-Patterns

1. **NO Fake Flow Construction:** The frontend must never synthesize a `{ id: 'fake-flow', nodes: [...] }` object to satisfy legacy components.
2. **NO Visual Canvas / DAG Renderers:** Executions are rendered as structured timelines and tool-call audit logs, not graphs.
3. **NO FlowRun Polling:** Real-time updates must consume the SSE stream at `GET /v1/executions/:id/events`.
4. **NO Manual Graph Serialization:** Automation triggers directly map to prompt templates and target integrations via `TriggerBinding` and `ScheduledTask`.
