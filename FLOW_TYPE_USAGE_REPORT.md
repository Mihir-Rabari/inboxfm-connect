# FLOW_TYPE_USAGE_REPORT.md

**Date:** 2026-08-04  
**PR:** PR5 — Strategic Module Flow-Type Elimination

---

## Phase 1 — Import Analysis

### 1. FlowVersion → Template

| Attribute | Finding |
|-----------|---------|
| **Import Location** | `packages/core/shared/src/lib/management/template/template.ts` |
| **Import Statement** | `import { FlowVersion, Note } from '@inboxfm-connect/core-execution'` |
| **Runtime Usage** | NONE - only used in schema definition |
| **Property Accesses** | NONE - only used with `FlowVersion.omit({...})` |
| **Access Pattern** | Type-level only: `FlowVersion.omit({...}).extend({...})` |
| **Schema Decoration?** | YES - Template uses FlowVersion as base schema for FlowVersionTemplate |
| **Can Remove Immediately?** | ❌ NO - Template still imports FlowVersion |

**Details:**
```typescript
// template.ts line 19-35
export const FlowVersionTemplate = FlowVersion.omit({
    id: true,
    created: true,
    updated: true,
    flowId: true,       // flow-specific field - OMITTED
    state: true,        // flow-specific field - OMITTED
    updatedBy: true,   // flow-specific field - OMITTED
    agentIds: true,     // flow-specific field - OMITTED
    connectionIds: true, // flow-specific field - OMITTED
    backupFiles: true,  // flow-specific field - OMITTED
    notes: true,        // flow-specific field - OMITTED (but re-added)
}).extend({
    description: z.string().optional(),
    notes: z.array(Note).optional(),
})
```

The Template only accesses:
- `displayName` (kept)
- `trigger` (kept - but this is flow-specific)
- `valid` (kept)
- `schemaVersion` (kept - implicit from omit not specifying it)

But `trigger` is flow-specific. If `trigger` is used, we cannot simply remove FlowVersion.

**Verdict:** TYPE COUPLING but with `trigger` dependency.

---

### 2. PopulatedFlow → MCP

| Attribute | Finding |
|-----------|---------|
| **Import Location** | `packages/core/shared/src/lib/automation/mcp/mcp.ts` |
| **Import Statement** | `import { PopulatedFlow } from '@inboxfm-connect/core-execution'` |
| **Runtime Usage** | NONE - only used in schema definition |
| **Property Accesses** | NONE - only used as type in `PopulatedMcpServer.extend()` |
| **Access Pattern** | Type-level only: `McpServer.extend({ flows: z.array(PopulatedFlow) })` |
| **Schema Decoration?** | YES - used to type the `flows` property |
| **Can Remove Immediately?** | ❌ NO - MCP still imports PopulatedFlow |

**Details:**
```typescript
// mcp.ts line 23-26
export const PopulatedMcpServer = McpServer.extend({
    flows: z.array(PopulatedFlow),
})
```

**Key Finding:** No API endpoint or runtime code accesses `PopulatedMcpServer.flows` anywhere!

**Search results:**
- `grep 'PopulatedMcpServer' packages/server/api/src/**/*.ts` → NO MATCHES
- `grep '\.flows' packages/server/api/src/app/mcp/**/*.ts` → NO MATCHES

The `flows` property is **DEAD CODE** in MCP!

**Verdict:** TYPE COUPLING - Dead property `flows` with no runtime access.

---

### 3. StepRunResponse → Websocket

| Attribute | Finding |
|-----------|---------|
| **Import Location** | `packages/core/shared/src/lib/automation/websocket/index.ts` |
| **Import Statement** | `import { StepRunResponse, UpdateStepProgressRequest } from '@inboxfm-connect/core-execution'` |
| **Definition Location** | `packages/core/execution/src/lib/flows/sample-data/index.ts` (StepRunResponse), `engine/requests.ts` (UpdateStepProgressRequest) |
| **Runtime Usage** | NONE - only used as type in intersections |
| **Property Accesses** | NONE - only type definitions |
| **Access Pattern** | Type-level only: `StepRunResponse & { projectId: string }` |
| **Schema Decoration?** | YES - used to type step execution progress |
| **Can Remove Immediately?** | ⚠️ DEPENDS - `StepRunResponse` is in `flows/sample-data/` which is marked for deletion |

**StepRunResponse Definition:**
```typescript
// flows/sample-data/index.ts lines 41-52
export const StepRunResponse = z.object({
    runId: z.string(),
    success: z.boolean(),
    input: z.unknown(),
    output: z.unknown(),
    sampleDataFileId: z.string().optional(),
    sampleDataInputFileId: z.string().optional(),
    standardError: z.string(),
    standardOutput: z.string(),
})
```

**UpdateStepProgressRequest Definition:**
```typescript
// engine/requests.ts lines 35-40
export const UpdateStepProgressRequest = z.object({
    projectId: z.string(),
    runId: z.string(),
    output: z.unknown(),
})
```

**Key Finding:** Neither type has flow-specific properties! They are general execution response types.

**BUT:** `StepRunResponse` is in `flows/sample-data/` which is in the flows directory!

**Verdict:** TYPE COUPLING - But must move `StepRunResponse` to non-flow directory first.

---

### 4. UpdateStepProgressRequest → Websocket

| Attribute | Finding |
|-----------|---------|
| **Import Location** | `packages/core/shared/src/lib/automation/websocket/index.ts` |
| **Definition Location** | `packages/core/execution/src/lib/engine/requests.ts` (NOT in flows/) |
| **Runtime Usage** | NONE - only used as type definition |
| **Property Accesses** | NONE - only type definition |
| **Schema Decoration?** | YES - used to type step progress |
| **Can Remove Immediately?** | ✅ YES - definition is NOT in flows/ directory |

**Key Finding:** `UpdateStepProgressRequest` is defined in `engine/requests.ts` which is NOT in the flows directory. It's safe.

**Verdict:** NOT flow-specific, NOT in flows directory. Safe to keep.

---

## Summary Matrix

| Type | Module | In Flow Directory? | Runtime Access | Property Access | Can Remove? |
|------|--------|-------------------|----------------|-----------------|-------------|
| `FlowVersion` | Template | YES (flows/) | NONE | None | ❌ NO |
| `PopulatedFlow` | MCP | YES (flows/) | NONE | None | ❌ NO (but dead property) |
| `StepRunResponse` | Websocket | YES (flows/sample-data/) | NONE | None | ⚠️ MOVE first |
| `UpdateStepProgressRequest` | Websocket | NO (engine/) | NONE | None | ✅ YES |

---

## Dead Property Classification

| Property | Module | Classification | Evidence |
|----------|--------|----------------|----------|
| `Template.flows` | Template | **DEAD** | Never accessed in API |
| `PopulatedMcpServer.flows` | MCP | **DEAD** | Never accessed in API |
| `TEST_FLOW_RUN_STARTED` event | Websocket | **DEAD** | Never emitted/subscribed |
| `MANUAL_TRIGGER_RUN_STARTED` event | Websocket | **DEAD** | Never emitted/subscribed |
| `FLOW_RUN_PROGRESS` event | Websocket | **DEAD** | Never emitted/subscribed |

---

## Critical Dependency Chain

```
Websocket imports StepRunResponse
  → from flows/sample-data/index.ts
  → flows/sample-data is in flows/ directory
  → flows/ is marked for deletion
  
Websocket imports UpdateStepProgressRequest
  → from engine/requests.ts
  → engine/ is NOT in flows/ directory
  → NOT affected by flows deletion
```

---

## Conclusion

1. **`FlowVersion`** - TYPE COUPLING but cannot remove yet due to Template import
2. **`PopulatedFlow`** - TYPE COUPLING with DEAD property `flows` - can remove dead property
3. **`StepRunResponse`** - TYPE COUPLING but location is in flows/ - must move first
4. **`UpdateStepProgressRequest`** - NOT flow-specific and NOT in flows/ - SAFE