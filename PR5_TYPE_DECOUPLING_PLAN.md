# PR5_TYPE_DECOUPLING_PLAN.md

**Date:** 2026-08-04  
**PR:** PR5 — Type Decoupling for Core Execution Cleanup

---

## Objective

Decouple flow-specific types (`FlowVersion`, `PopulatedFlow`) from strategic modules (MCP, Template) so that PR4E can proceed to delete flow-specific code from `packages/core/execution`.

---

## Root Cause Analysis

### Problem

MCP and Template import flow-specific types from `@inboxfm-connect/core-execution`:
- `FlowVersion` - used by Template for `FlowVersionTemplate`
- `PopulatedFlow` - used by MCP for `PopulatedMcpServer.flows`

However, these imports are **type coupling** (not semantic dependencies):
- Template doesn't actually need flow concepts - it uses `FlowVersion` as a structure template
- MCP doesn't actually need flow concepts - it just declares a `flows` property typed as `PopulatedFlow[]`

The actual `flows` properties on these types are likely **dead code** since flows are obsolete per the product contract.

### Constraint

PR4E cannot modify MCP or Template (except to remove dead imports). So the strategy is:
1. Create minimal replacement interfaces in `packages/core/shared`
2. Migrate MCP and Template to use the new interfaces
3. Delete the flow-specific types from `packages/core/execution`

---

## Phase 1 — New Shared Interfaces

### New Interfaces to Create

#### 1. `ExecutionTemplate` (in `packages/core/shared/src/lib/automation/`)

**Purpose:** Replace `FlowVersion` for template versioning

**Location:** `packages/core/shared/src/lib/automation/template/execution-template.ts` (new file)

**Interface:**
```typescript
export interface ExecutionTemplate {
  id?: string  // Optional for template (omitted on create)
  displayName: string
  trigger: TriggerConfig  // Piece trigger config - not flow-specific
  valid: boolean
  schemaVersion: string
  description?: string
  created?: string
  updated?: string
}

export interface TriggerConfig {
  // Minimal trigger configuration - piece-based
  pieceName?: string
  pieceVersion?: string
  pieceType?: 'TRIGGER' | 'ACTION'
  input?: Record<string, unknown>
}
```

**Migrates:** Template's `FlowVersionTemplate`

---

#### 2. `McpFlowDefinition` (in `packages/core/shared/src/lib/automation/mcp/`)

**Purpose:** Replace `PopulatedFlow` for MCP flow references

**Location:** `packages/core/shared/src/lib/automation/mcp/mcp-types.ts` (new file or extend mcp.ts)

**Interface:**
```typescript
export interface McpFlowDefinition {
  id: string
  displayName: string
  // Minimal properties - only what's needed by MCP
  status?: 'ENABLED' | 'DISABLED'
}
```

**Alternative:** If `PopulatedMcpServer.flows` is dead code, simply remove it.

---

#### 3. `StepExecutionProgress` (in `packages/core/shared/src/lib/automation/websocket/`)

**Purpose:** Already exists as `StepRunResponse` - confirm it stays

**Location:** Already exists in `packages/core/execution/src/lib/flow-run/execution/step-output.ts`

**Interface:** `StepRunResponse` - Keep as-is

---

## Phase 2 — Module Migration Plan

### Order of Migration

```
1. Template → Remove dead flows property, create ExecutionTemplate
2. MCP → Remove dead flows property (or create McpFlowDefinition)
3. Websocket → No change needed (StepRunResponse is correct)
4. PR4E → Delete flow-specific types from core-execution
```

### Migration 1: Template

**File:** `packages/core/shared/src/lib/management/template/template.ts`

**Changes:**
1. Remove `import { FlowVersion, Note } from '@inboxfm-connect/core-execution'`
2. Remove `FlowVersionTemplate` type (or create minimal ExecutionTemplate)
3. Remove `flows: z.array(FlowVersionTemplate).optional()` from Template

**Before:**
```typescript
import { FlowVersion, Note } from '@inboxfm-connect/core-execution'
...
export const FlowVersionTemplate = FlowVersion.omit({...})
export const Template = z.object({
    ...
    flows: z.array(FlowVersionTemplate).optional(),
})
```

**After:**
```typescript
// No import needed if flows property is removed
export const Template = z.object({
    ...
    // flows property removed
    tables: z.array(TableTemplate).optional(),
})
```

---

### Migration 2: MCP

**File:** `packages/core/shared/src/lib/automation/mcp/mcp.ts`

**Changes (Option A - Remove dead property):**
```typescript
// Remove PopulatedFlow import and flows property
export const PopulatedMcpServer = McpServer // No extend with flows
```

**Changes (Option B - Create minimal interface):**
```typescript
import { McpFlowDefinition } from './mcp-types'
...
export const PopulatedMcpServer = McpServer.extend({
    flows: z.array(McpFlowDefinition),
})
```

**Recommendation:** Option A if `flows` is never populated.

---

### Migration 3: Websocket

**No changes needed.** `StepRunResponse` is a legitimate runtime contract, not flow-specific.

---

## Phase 3 — Old Flow Models (Post-Migration)

### In `packages/core/execution/src/lib/flows/`

After Template and MCP are migrated, these types can be safely deleted:

| File/Directory | Status After Migration |
|----------------|------------------------|
| `flow.ts` | DELETE - Flow model |
| `flow-version.ts` | DELETE - FlowVersion model |
| `note.ts` | DELETE - Flow-specific note |
| `form.ts` | DELETE - Flow form |
| `test-trigger.ts` | DELETE - Flow test trigger |
| `actions/` | DELETE - Flow actions |
| `dto/` | DELETE - Flow DTOs |
| `folders/` | DELETE - Folder model |
| `operations/` | DELETE - Flow operations |
| `properties/` | DELETE - Flow properties |
| `sample-data/` | AUDIT - May contain non-flow types |
| `triggers/` | DELETE - Flow triggers |
| `util/` | DELETE - Flow utilities |

### In `packages/core/execution/src/lib/flow-run/`

| File/Directory | Status After Migration |
|----------------|------------------------|
| `flow-run.ts` | DELETE - Flow run model |
| `waitpoint/` | DELETE - Waitpoint model |
| `dto/` | DELETE - Flow run DTOs |
| `execution/` | AUDIT - May contain non-flow types |

---

## Phase 4 — Execution

### Pre-requisites (Must Complete First)

1. ✅ Migrate Template to remove `FlowVersion` import
2. ✅ Migrate MCP to remove `PopulatedFlow` import
3. ✅ Verify no other imports of deleted types

### PR4E Execution (After Pre-requisites)

1. Delete `packages/core/execution/src/lib/flows/` (except engine)
2. Delete `packages/core/execution/src/lib/flow-run/` (except execution contracts)
3. Update `packages/core/execution/src/index.ts` exports
4. Update `packages/core/shared/src/index.ts` re-exports

---

## Phase 5 — Verification

After each migration:

1. Run TypeScript compilation
2. Run turbo build
3. Run lint
4. Verify MCP functionality
5. Verify Template functionality
6. Verify Websocket functionality
7. Verify POST /v1/execute works

---

## Risk Assessment

| Risk | Level | Mitigation |
|------|-------|------------|
| Template breaks | Medium | Remove `flows` property only if dead code |
| MCP breaks | Medium | Remove `flows` property only if dead code |
| Type migration incorrect | Medium | Create new interfaces first, test before delete |
| Property access on deleted types | High | Audit all imports before deletion |

---

## Files to Modify

### New Files
- `packages/core/shared/src/lib/automation/template/execution-template.ts` (if needed)
- `packages/core/shared/src/lib/automation/mcp/mcp-types.ts` (if needed)

### Modified Files
- `packages/core/shared/src/lib/management/template/template.ts`
- `packages/core/shared/src/lib/automation/mcp/mcp.ts`

### Deleted Files (after migration)
- `packages/core/execution/src/lib/flows/` (most of it)
- `packages/core/execution/src/lib/flow-run/` (most of it)

---

## Summary

**Problem:** Flow-specific types block PR4E deletion because MCP and Template import them.

**Solution:** Migrate MCP and Template to minimal interfaces, then delete flow types.

**Execution Order:**
1. Create `ExecutionTemplate` interface (optional)
2. Migrate Template (remove dead `flows` property)
3. Migrate MCP (remove dead `flows` property)
4. Execute PR4E deletion
5. Verify

**Outcome:**
- `FlowVersion`, `PopulatedFlow` deleted from core-execution
- Template and MCP still functional with minimal contracts
- Websocket unchanged (StepRunResponse is correct)

---

**Status:** 🟡 PLANNED - Ready for PR5 execution after PR4E blocker resolution