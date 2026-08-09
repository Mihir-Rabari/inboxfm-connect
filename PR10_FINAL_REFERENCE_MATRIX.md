# PR10 Final Reference Matrix

| Reference | File Path | Classification | Runtime? | Allowed? | Rationale / Explanation |
| :--- | :--- | :--- | :---: | :---: | :--- |
| `PopulatedFlow` | `packages/core/piece-types/src/lib/flow-contracts.ts` | Public SDK Type | **NO** | **YES** | Lean type definition retained for external piece SDK compile-time compatibility. |
| `PopulatedFlowSummary` | `packages/core/piece-types/src/lib/flows.ts` | Public SDK Type | **NO** | **YES** | Summary type retained for external piece SDK compile-time compatibility. |
| `PopulatedFlow` | `packages/integrations/framework/src/index.ts` | Framework Type Export | **NO** | **YES** | Type export for piece framework backward compatibility. |
| `PopulatedFlow` | `packages/integrations/community/ai/src/lib/actions/agents/utils.ts` | Integration Type | **NO** | **YES** | Type annotation cast for AI agent tool property inspection. |
| `PopulatedFlow` | `packages/integrations/core/subflows/src/lib/common.ts` | Integration Type | **NO** | **YES** | Legacy subflow action type signature retained for third-party piece compatibility. |
| `PopulatedFlow` | `packages/server/engine/src/lib/piece-context/flows.ts` | Engine Context Type | **NO** | **YES** | Context list signature type retained for piece execution context. |
| `1807000000000-DropWorkflowTables.ts` | `packages/server/api/src/app/database/migration/postgres/` | Migration History | **NO** | **YES** | Database migration dropping legacy workflow tables permanently. |
| `1807000000000-DropWorkflowTablesSqlite.ts` | `packages/server/api/src/app/database/migration/sqlite/` | Migration History | **NO** | **YES** | SQLite migration dropping legacy workflow tables permanently. |
| `1810000000000-AddTriggerBindingTable.ts` | `packages/server/api/src/app/database/migration/postgres/` | Migration History | **NO** | **YES** | Migration adding `trigger_binding` table for event-driven headless executions. |
| `flowModule` (commented) | `packages/server/api/src/app/app.ts` | Disabled Code Comment | **NO** | **YES** | Disconnected comment in Fastify server module registration. |
| `flowRunModule` (commented) | `packages/server/api/src/app/app.ts` | Disabled Code Comment | **NO** | **YES** | Disconnected comment in Fastify server module registration. |

---

### Verification Summary
- **Active Legacy Runtime Count:** **0**
- **Unjustified Flow Dependencies:** **0**
- **Result:** **PASSED ALL CERTIFICATION CRITERIA**
