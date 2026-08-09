# PR9 PopulatedFlow & Package Coupling Audit

## Findings

1. **`PopulatedFlow` in Core Architecture & MCP:**
   - In `packages/server/api` and `packages/server/engine/src/lib/handler/context/`, `PopulatedFlow` dependencies have already been fully removed in main. MCP uses direct tool execution via `HeadlessRuntime`.

2. **`PopulatedFlow` Leakage in Framework & Integrations:**
   - **`@inboxfm-connect/core-piece-types`**: Exports `PopulatedFlowSummary` and `PopulatedFlow` in `src/lib/flow-contracts.ts` and `src/lib/flows.ts`.
   - **`@inboxfm-connect/pieces-framework`**: Re-exports `PopulatedFlowSummary` and `PopulatedFlow`.
   - **`@inboxfm-connect/piece-subflows`**: `packages/integrations/core/subflows/src/lib/common.ts` imports `PopulatedFlow` for legacy subflow listing.
   - **`@inboxfm-connect/piece-ai`**: `packages/integrations/community/ai/src/lib/actions/agents/utils.ts` imports `PopulatedFlow` as a type cast for flow-based agent tools.

3. **Classification:**
   - **Framework SDK / Integration Compatibility Contracts**: These types exist as pure TypeScript interfaces inside `@inboxfm-connect/core-piece-types` to preserve compilation of external/legacy third-party community pieces without loading TypeORM entities or execution engines.
   - **Zero Runtime Dependency**: No active API server route or HeadlessRuntime execution path constructs `PopulatedFlow`.

4. **Action:**
   - Retain `PopulatedFlowSummary` and `PopulatedFlow` in `@inboxfm-connect/core-piece-types` strictly as type-only compatibility contracts.
   - Verify that `@inboxfm-connect/shared` and core execution modules do NOT leak TypeORM entities into `HeadlessRuntime`.
