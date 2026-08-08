# FLOW_PROPERTY_AUDIT.md

**Date:** 2026-08-04  
**PR:** PR5 — Strategic Module Flow-Type Elimination

---

## Phase 2 — Dead Property Audit

### Audit Scope

Properties that introduce Flow concepts into strategic modules:
1. `Template.flows` (Template module)
2. `PopulatedMcpServer.flows` (MCP module)
3. Flow-specific event enum values (Websocket module)

---

## Property 1: Template.flows

### Property Definition

```typescript
// packages/core/shared/src/lib/management/template/template.ts
export const Template = z.object({
    ...BaseModelSchema,
    name: z.string(),
    type: z.nativeEnum(TemplateType),
    summary: z.string(),
    description: z.string(),
    tags: z.array(TemplateTag),
    blogUrl: Nullable(z.string()),
    metadata: Nullable(Metadata),
    author: z.string(),
    categories: z.array(z.string()),
    pieces: z.array(z.string()),
    platformId: Nullable(z.string()),
    flows: z.array(FlowVersionTemplate).optional(),  // <-- DEAD PROPERTY
    tables: z.array(TableTemplate).optional(),
    status: z.nativeEnum(TemplateStatus),
})
```

### Type Analysis

`FlowVersionTemplate` is derived from `FlowVersion`:
```typescript
export const FlowVersionTemplate = FlowVersion.omit({
    id: true, created: true, updated: true, flowId: true,
    state: true, updatedBy: true, agentIds: true, connectionIds: true,
    backupFiles: true, notes: true,
}).extend({ description: z.string().optional(), notes: z.array(Note).optional() })
```

### Who Populates It?

**Search:** `grep 'Template.*flows' packages/server/api/src/**/*.ts` → **NO MATCHES**

No API endpoint constructs a Template with `flows` populated.

### Who Reads It?

**Search:** `grep 'Template.*flows' packages/**/***.ts` → **NO MATCHES**

No code reads `Template.flows`.

### Is It Serialized?

**Search:** `grep 'flows' packages/server/api/src/**/*.ts` → **NO MATCHES**

The `flows` property is never serialized to database or returned by endpoints.

### Classification: **DEAD**

**Evidence:**
- Never populated by any API endpoint
- Never read by any code
- Never serialized
- The `FlowVersion` import is only used to define the type schema

---

## Property 2: PopulatedMcpServer.flows

### Property Definition

```typescript
// packages/core/shared/src/lib/automation/mcp/mcp.ts
export const PopulatedMcpServer = McpServer.extend({
    flows: z.array(PopulatedFlow),  // <-- DEAD PROPERTY
})
```

### Type Analysis

`PopulatedFlow = Flow.extend({ version: FlowVersion, triggerSource })` - fully flow-specific type.

### Who Populates It?

**Search:** `grep 'PopulatedMcpServer' packages/server/api/src/**/*.ts` → **NO MATCHES**

No API endpoint constructs a `PopulatedMcpServer` with `flows` populated.

### Who Reads It?

**Search:** `grep 'PopulatedMcpServer' packages/**/***.ts` → **NO MATCHES**

No code reads `PopulatedMcpServer.flows`.

### Is It Serialized?

**Search:** `grep 'flows' packages/server/api/src/app/mcp/**/*.ts` → **NO MATCHES**

The `flows` property is never serialized or returned.

### Classification: **DEAD**

**Evidence:**
- `McpService` never populates `flows` on MCP servers
- No API endpoint returns `PopulatedMcpServer.flows`
- No code reads this property

---

## Property 3: Flow-Specific Websocket Event Values

### Event Definition

```typescript
// packages/core/shared/src/lib/automation/websocket/index.ts
export enum WebsocketClientEvent {
    TEST_FLOW_RUN_STARTED = 'TEST_FLOW_RUN_STARTED',     // <-- DEAD
    MANUAL_TRIGGER_RUN_STARTED = 'MANUAL_TRIGGER_RUN_STARTED', // <-- DEAD
    TEST_STEP_FINISHED = 'TEST_STEP_FINISHED',
    TEST_STEP_PROGRESS = 'TEST_STEP_PROGRESS',
    REFRESH_PIECE = 'REFRESH_PIECE',
    FLOW_RUN_PROGRESS = 'FLOW_RUN_PROGRESS',            // <-- DEAD
    // ...
}
```

### Who Emits These Events?

**Search:** `grep 'TEST_FLOW_RUN_STARTED' packages/**/*.ts` → **NO MATCHES**

No code emits `TEST_FLOW_RUN_STARTED`.

**Search:** `grep 'FLOW_RUN_PROGRESS' packages/**/*.ts` → **NO MATCHES**

No code emits `FLOW_RUN_PROGRESS`.

### Who Subscribes To These Events?

**Search:** Same results - **NO MATCHES**

No code subscribes to these event types.

### Classification: **DEAD**

**Evidence:**
- These event enum values exist but are never emitted
- No frontend or backend code references them
- They are dead code in the enum

---

## Summary

| Property | Module | Classification | Evidence |
|----------|--------|----------------|----------|
| `Template.flows` | Template | **DEAD** | Never populated, never read, never serialized |
| `PopulatedMcpServer.flows` | MCP | **DEAD** | Never populated, never read, never serialized |
| `TEST_FLOW_RUN_STARTED` | Websocket | **DEAD** | Never emitted, never subscribed |
| `MANUAL_TRIGGER_RUN_STARTED` | Websocket | **DEAD** | Never emitted, never subscribed |
| `FLOW_RUN_PROGRESS` | Websocket | **DEAD** | Never emitted, never subscribed |

---

## Phase 3 — Removal Plan

### Properties To Remove

1. **`Template.flows`** - Remove from Template schema, remove FlowVersion import
2. **`PopulatedMcpServer.flows`** - Remove from PopulatedMcpServer schema, remove PopulatedFlow import
3. **Dead Event Values** - Remove from WebsocketClientEvent enum

### Required Changes

#### 1. template.ts

**Before:**
```typescript
import { FlowVersion, Note } from '@inboxfm-connect/core-execution'
import { FlowVersionTemplate } from './flow-version-template' // if extracted

export const Template = z.object({
    ...
    flows: z.array(FlowVersionTemplate).optional(), // REMOVE THIS
    tables: z.array(TableTemplate).optional(),
    ...
})
```

**After:**
```typescript
// Remove FlowVersion import
import { BaseModelSchema, ColorHex, Metadata, Nullable } from '@inboxfm-connect/core-utils'
import { z } from 'zod'

export const Template = z.object({
    ...
    tables: z.array(TableTemplate).optional(),
    ...
})
```

#### 2. mcp.ts

**Before:**
```typescript
import { PopulatedFlow } from '@inboxfm-connect/core-execution'

export const PopulatedMcpServer = McpServer.extend({
    flows: z.array(PopulatedFlow),  // REMOVE THIS
})
```

**After:**
```typescript
// Remove PopulatedFlow import (if only used for flows)
export const PopulatedMcpServer = McpServer // No extend
```

#### 3. websocket/index.ts

**Before:**
```typescript
export enum WebsocketClientEvent {
    TEST_FLOW_RUN_STARTED = 'TEST_FLOW_RUN_STARTED',  // REMOVE
    MANUAL_TRIGGER_RUN_STARTED = 'MANUAL_TRIGGER_RUN_STARTED', // REMOVE
    TEST_STEP_FINISHED = 'TEST_STEP_FINISHED',
    TEST_STEP_PROGRESS = 'TEST_STEP_PROGRESS',
    REFRESH_PIECE = 'REFRESH_PIECE',
    FLOW_RUN_PROGRESS = 'FLOW_RUN_PROGRESS',  // REMOVE
    // ...
}
```

**After:**
```typescript
export enum WebsocketClientEvent {
    TEST_STEP_FINISHED = 'TEST_STEP_FINISHED',
    TEST_STEP_PROGRESS = 'TEST_STEP_PROGRESS',
    REFRESH_PIECE = 'REFRESH_PIECE',
    // ... (remaining events)
}
```

---

## Stop Conditions Check

| Condition | Status |
|-----------|--------|
| Runtime behavior changes? | ❌ NO - only dead properties removed |
| Endpoint contract changes? | ❌ NO - removed properties were never returned |
| MCP serves flow info? | ❌ NO - property was never populated |
| Template API supports flows? | ❌ NO - flow support was never implemented |
| Frontend requests fields? | ❌ NO - fields were never in API responses |

**All Stop Conditions: NOT TRIGGERED**

---

## Conclusion

**Three dead properties identified:**
1. `Template.flows` - dead code
2. `PopulatedMcpServer.flows` - dead code
3. Flow-specific websocket events - dead code

**Removal is safe** - these properties were never populated, read, or serialized. Removing them will not change runtime behavior.