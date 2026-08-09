# TYPE_DECOUPLING_MATRIX.md

**Date:** 2026-08-04  
**PR:** PR4E — Core Execution Package Cleanup

---

## Overview

This document analyzes the dependency between strategic modules (MCP, Template, Websocket) and flow-specific types from `@inboxfm-connect/core-execution`.

**Question:** Are these semantic dependencies (the module actually needs flow concepts) or type coupling (the module just needs a type that happens to include flow properties)?

---

## Type Analysis

### 1. FlowVersion

| Attribute | Analysis |
|-----------|----------|
| **Current Type** | `FlowVersion` - flow version schema with `flowId`, `trigger`, `state`, `valid`, `notes`, etc. |
| **Location** | `packages/core/execution/src/lib/flows/flow-version.ts` |
| **Importers** | `packages/core/shared/src/lib/management/template/template.ts` |
| **Properties Used** | `FlowVersion.omit({...})` to create `FlowVersionTemplate` by omitting: `id, created, updated, flowId, state, updatedBy, agentIds, connectionIds, backupFiles, notes` |
| **Properties Kept** | `displayName`, `trigger`, `valid`, `schemaVersion` (plus new `description`) |
| **Properties Never Accessed** | `flowId`, `state`, `updatedBy`, `agentIds`, `connectionIds`, `backupFiles` (omitted in template) |
| **Is 'Flow' Interesting?** | `trigger` property is flow-specific, but template only passes through structure |
| **Dead Code?** | `Template.flows` property may be dead (flows are obsolete) |

**Conclusion:** TYPE COUPLING - Template doesn't actually need flow concepts, it just uses FlowVersion as a structure for templates. However, `FlowVersion.trigger` is flow-specific.

---

### 2. PopulatedFlow

| Attribute | Analysis |
|-----------|----------|
| **Current Type** | `PopulatedFlow = Flow.extend({ version: FlowVersion, triggerSource })` |
| **Location** | `packages/core/execution/src/lib/flows/flow.ts` |
| **Importers** | `packages/core/shared/src/lib/automation/mcp/mcp.ts` |
| **Properties Used** | `PopulatedMcpServer.extend({ flows: z.array(PopulatedFlow) })` - only used as type |
| **Properties Accessed** | None - only used as Zod type definition |
| **Properties Never Accessed** | All properties of `Flow` and `FlowVersion` not accessed |
| **Is 'Flow' Interesting?** | MCP doesn't need flow concepts - it uses this for MCP server flows property |
| **Dead Code?** | `PopulatedMcpServer.flows` may be dead (flows are obsolete) |

**Conclusion:** TYPE COUPLING - MCP doesn't actually need flow concepts. It just declares a `flows` property typed as `PopulatedFlow[]`. If flows are obsolete, this property should be removed.

---

### 3. StepRunResponse

| Attribute | Analysis |
|-----------|----------|
| **Current Type** | `StepRunResponse` from `step-output.ts` - step execution response |
| **Location** | `packages/core/execution/src/lib/flow-run/execution/step-output.ts` |
| **Importers** | `packages/core/shared/src/lib/automation/websocket/index.ts` |
| **Properties Used** | Type used for `EmitTestStepProgressRequest = StepRunResponse & { projectId: string }` |
| **Properties** | `input`, `output`, `agentId`, `stepName`, `status`, `startTime`, `finishTime` |
| **Properties Accessed** | None directly - only used as type definition |
| **Is 'Flow' Interesting?** | NO - This is step execution response, NOT flow-specific |
| **Dead Code?** | NO - This is used by engine for step execution progress |

**Conclusion:** SEMANTIC - `StepRunResponse` is a legitimate runtime execution contract for step execution. **Should NOT be deleted.**

---

## Minimal Replacement Interfaces

### For FlowVersion → Template

**Current:** `FlowVersion` with `flowId, trigger, state, valid, notes, etc.`

**Template Access Pattern:** 
- Uses `FlowVersion.omit()` to create `FlowVersionTemplate`
- Only keeps `displayName`, `trigger`, `valid`, `schemaVersion`
- Adds `description`

**Minimal Interface Needed:**
```typescript
interface ExecutionTemplate {
  displayName: string
  trigger: TriggerConfig  // Could be piece trigger config, not flow-specific
  valid: boolean
  schemaVersion?: string
  description?: string
}
```

**Note:** The `trigger` field is still flow-related. Template may need generic execution config instead.

**Migration Effort:** Medium - Would need to create new type, update Template schema

---

### For PopulatedFlow → MCP

**Current:** `PopulatedFlow = Flow.extend({ version: FlowVersion, triggerSource })`

**MCP Access Pattern:**
- Only uses as type definition: `flows: z.array(PopulatedFlow)`
- No actual property access

**Minimal Interface Needed:**
```typescript
interface McpServerFlows {
  flows: z.array(z.object({ id: string, displayName: string }))  // Minimal
}
```

**Or if flows are dead:** Remove the property entirely.

**Migration Effort:** Low-Medium - Can remove property if flows are obsolete

---

### For StepRunResponse → Websocket

**Current:** `StepRunResponse` is correct - step execution response

**Websocket Usage:**
- `EmitTestStepProgressRequest = StepRunResponse & { projectId: string }`
- `TestStepProgressEvent = UpdateStepProgressRequest | EmitTestStepProgressRequest`

**Minimal Interface:** `StepRunResponse` is already minimal - no change needed

**Migration Effort:** None - Keep as-is

---

## Estimated Migration Effort & Risk

| Type | Module | Effort | Risk | Recommendation |
|------|--------|--------|------|----------------|
| `FlowVersion` | Template | Medium | Medium | Create new `ExecutionTemplate` type; remove flow-specific fields |
| `PopulatedFlow` | MCP | Low | Low | If flows are dead, remove `flows` property from `PopulatedMcpServer` |
| `StepRunResponse` | Websocket | None | None | KEEP - Not flow-specific |

---

## Summary Matrix

| Type | Coupling Type | Can Delete? | Minimal Contract | Blocker? |
|------|--------------|-------------|------------------|----------|
| `FlowVersion` | Type Coupling | ⚠️ Blocked | `ExecutionTemplate` | Yes - Template uses it |
| `PopulatedFlow` | Type Coupling | ⚠️ Blocked | `McpServerFlows` or empty | Yes - MCP uses it |
| `StepRunResponse` | Semantic | ✅ No | `StepRunResponse` (keep) | No - Not flow-specific |

---

## Conclusion

**`StepRunResponse`** is NOT a flow-specific type and should be kept.

**`FlowVersion`** and **`PopulatedFlow`** are flow-specific but are used as type definitions (not for their flow-specific properties). The actual `flows` property on Template and MCP may be dead code.

**However**, since Template imports `FlowVersion` and MCP imports `PopulatedFlow`, deleting these types would break the type system for these modules - which violates the constraint "do NOT touch MCP" and "do NOT touch Template" (except to remove dead imports).

**Recommendation for PR5:**
1. Create minimal replacement interfaces in shared
2. Update MCP to use minimal interface, remove dead `flows` property
3. Update Template to use minimal interface, remove dead `flows` property
4. Then delete `FlowVersion` and `PopulatedFlow` from core-execution