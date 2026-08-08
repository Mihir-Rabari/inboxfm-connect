# FLOW_TYPE_REMAINING_DEPENDENCIES.md

**Date:** 2026-08-04  
**PR:** PR5 — Strategic Module Flow-Type Elimination

---

## Phase 4 — Recheck After Dead Property Removal

### After Removing Dead Properties

If we remove:
1. `Template.flows` property and `FlowVersion` import from Template
2. `PopulatedMcpServer.flows` property and `PopulatedFlow` import from MCP
3. Dead flow event values from Websocket

### Remaining Imports Check

#### In packages/core/shared/src/lib/automation/mcp/mcp.ts

```typescript
// BEFORE:
import { PopulatedFlow } from '@inboxfm-connect/core-execution'
...
export const PopulatedMcpServer = McpServer.extend({
    flows: z.array(PopulatedFlow),
})

// AFTER (dead property removal):
// PopulatedFlow import removed
// PopulatedMcpServer = McpServer (no extend)
```

**Result:** ✅ NO remaining flow imports from MCP module

---

#### In packages/core/shared/src/lib/management/template/template.ts

```typescript
// BEFORE:
import { FlowVersion, Note } from '@inboxfm-connect/core-execution'
...
export const FlowVersionTemplate = FlowVersion.omit({...})
export const Template = z.object({
    ...
    flows: z.array(FlowVersionTemplate).optional(),
})

// AFTER (dead property removal):
// FlowVersion, Note imports removed
// FlowVersionTemplate type removed
// Template flows property removed
```

**Result:** ✅ NO remaining flow imports from Template module

---

#### In packages/core/shared/src/lib/automation/websocket/index.ts

```typescript
// BEFORE:
import { StepRunResponse, UpdateStepProgressRequest } from '@inboxfm-connect/core-execution'
...
export enum WebsocketClientEvent {
    TEST_FLOW_RUN_STARTED = 'TEST_FLOW_RUN_STARTED',  // REMOVE
    MANUAL_TRIGGER_RUN_STARTED = 'MANUAL_TRIGGER_RUN_STARTED', // REMOVE
    ...
    FLOW_RUN_PROGRESS = 'FLOW_RUN_PROGRESS',  // REMOVE
    ...
}

// AFTER (dead event removal):
import { StepRunResponse, UpdateStepProgressRequest } from '@inboxfm-connect/core-execution'
...
export enum WebsocketClientEvent {
    TEST_STEP_FINISHED = 'TEST_STEP_FINISHED',
    TEST_STEP_PROGRESS = 'TEST_STEP_PROGRESS',
    REFRESH_PIECE = 'REFRESH_PIECE',
    // ... (flow events removed)
}
```

**Result:** ⚠️ STILL IMPORTS `StepRunResponse` and `UpdateStepProgressRequest`

---

## Critical Remaining Issue: StepRunResponse

### The Problem

`StepRunResponse` is:
1. Imported by Websocket (`import { StepRunResponse } from '@inboxfm-connect/core-execution'`)
2. Defined in `packages/core/execution/src/lib/flows/sample-data/index.ts`
3. **NOT flow-specific in content** - it's a step execution response

`UpdateStepProgressRequest` is:
1. Imported by Websocket
2. Defined in `packages/core/execution/src/lib/engine/requests.ts`
3. **NOT flow-specific in content** - it's a step progress update request

### Directory Locations

| Type | Location | In Flows Directory? |
|------|----------|---------------------|
| `StepRunResponse` | `flows/sample-data/` | YES |
| `UpdateStepProgressRequest` | `engine/requests.ts` | NO |

### Analysis

If we delete `flows/` directory, `StepRunResponse` would be deleted because it's in `flows/sample-data/`.

This would break Websocket's import.

### Question: Is StepRunResponse Flow-Specific?

**NO** - `StepRunResponse` is a general step execution response with fields:
- `runId` - run identifier (not flow-specific)
- `success` - success flag
- `input` - step input
- `output` - step output
- `sampleDataFileId` - sample data file reference
- `standardError` - error output
- `standardOutput` - stdout

None of these are flow-specific concepts. This is a step execution response type.

### The Contradiction

1. `StepRunResponse` is NOT flow-specific
2. `StepRunResponse` is in `flows/sample-data/` which is marked for deletion
3. Deleting `flows/sample-data/` would break Websocket
4. Breaking Websocket violates "do not change runtime behavior"

### Decision Required

Since `StepRunResponse` is NOT flow-specific, it should NOT be deleted even though it's in `flows/sample-data/`.

**Recommendation:** `flows/sample-data/` should be EXCLUDED from the flows deletion because it contains non-flow-specific types.

Alternative: `StepRunResponse` must be moved to a non-flow directory before deletion.

---

## Summary of Remaining Dependencies

| Import | Module | Status | Resolution |
|--------|--------|--------|------------|
| `FlowVersion` | Template | ✅ REMOVED (after dead property removal) | Remove `Template.flows` |
| `PopulatedFlow` | MCP | ✅ REMOVED (after dead property removal) | Remove `PopulatedMcpServer.flows` |
| `StepRunResponse` | Websocket | ⚠️ BLOCKER | Must keep in flows OR move to safe location |
| `UpdateStepProgressRequest` | Websocket | ✅ SAFE | Already in engine/ directory |

---

## Remaining Work

1. ✅ Remove `Template.flows` property (dead)
2. ✅ Remove `PopulatedMcpServer.flows` property (dead)
3. ✅ Remove dead flow event values from Websocket
4. ⚠️ Resolve `StepRunResponse` location issue

---

## Blocker Status

**The `StepRunResponse` location issue is a STOPPER for complete flow type elimination.**

- If we keep `flows/sample-data/`, we're keeping flow-related directory
- If we delete `flows/sample-data/`, we break Websocket
- We cannot move files (per task rules)

**Possible resolutions:**
1. Move `StepRunResponse` to `engine/` before deletion (but cannot move files)
2. Keep `flows/sample-data/` as exception (contradicts deletion requirement)
3. Accept that complete deletion is not possible without breaking runtime

**Recommendation for PR5 completion:**
- Remove dead properties (1-3 above) ✅
- Document `StepRunResponse` issue as technical debt requiring resolution before full deletion