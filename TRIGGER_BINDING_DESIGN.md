# TriggerBinding Design Specification

## 1. TriggerBinding Model

`TriggerBinding` replaces `FlowVersion` as the atomic unit of event binding in InboxFM Connect.

```ts
export enum TriggerBindingStatus {
    ENABLED = 'ENABLED',
    DISABLED = 'DISABLED',
}

export const TriggerBinding = z.object({
    ...BaseModelSchema,
    projectId: z.string(),
    platformId: z.string(),
    pieceName: z.string(),
    pieceVersion: z.string(),
    triggerName: z.string(),
    connectionId: Nullable(z.string()),
    promptTemplate: z.string(),
    settings: z.record(z.string(), z.unknown()),
    propertySettings: z.record(z.string(), z.custom<PropertySettings>()).optional(),
    status: z.nativeEnum(TriggerBindingStatus),
})

export type TriggerBinding = z.infer<typeof TriggerBinding>
```

---

## 2. Field Justification

| Field | Type | Purpose | Forbidden Workflow Graph Concept? |
|---|---|---|---|
| `id` | `ApId` (string) | Unique binding identity & store namespace key | No |
| `created` | ISO string | Creation timestamp | No |
| `updated` | ISO string | Update timestamp | No |
| `projectId` | `ApId` | Multi-tenant isolation | No |
| `platformId` | `ApId` | Multi-tenant platform isolation | No |
| `pieceName` | string | Integration package name | No |
| `pieceVersion` | string | Integration package version | No |
| `triggerName` | string | Integration trigger identifier | No |
| `connectionId` | string \| null | Safe reference to authentication credentials (never raw secret) | No |
| `promptTemplate` | string | AI Planner prompt template bound to event payload | No |
| `settings` | Record<string, unknown> | Integration trigger parameters (e.g. repo, channel, filter) | No |
| `propertySettings` | Record<string, PropertySettings> | Property validation & processing metadata | No |
| `status` | `ENABLED` \| `DISABLED` | Binding lifecycle state | No |

### Excluded Concepts (Forbidden):
- `flowId`
- `flowVersionId`
- `stepName`
- `nodeId`
- `routerPath`
- `loopIteration`
- graph state
- canvas state

---

## 3. Security Model

- **No Secrets Persisted**: `TriggerBinding` stores only `connectionId`. Raw API keys, OAuth tokens, and secrets are resolved runtime dynamically through `app_connection`.
- **Multi-Tenant Scoping**: All queries filter by `projectId` or `platformId`.
- **Webhook Verification**: Verification of app webhook signatures (`verify`) uses existing secure signature mechanisms.

---

## 4. Lifecycle Transitions

```
                    ┌───────────┐
      Create ──────▶│  ENABLED  │◀──── Enable / Renew
                    └─────┬─────┘
                          │
                   Disable / Fail
                          │
                          ▼
                    ┌───────────┐
                    │ DISABLED  │
                    └───────────┘
```

1. **Enable**: Calls `triggerHelper.executeTrigger` with `TriggerHookType.ON_ENABLE`. On success, sets status `ENABLED`.
2. **Disable**: Calls `triggerHelper.executeTrigger` with `TriggerHookType.ON_DISABLE`. On success, sets status `DISABLED`.
3. **Renew**: Calls `triggerHelper.executeTrigger` with `TriggerHookType.RENEW`.
4. **Run**: On incoming event, calls `triggerHelper.executeTrigger` with `TriggerHookType.RUN`. Emitted items trigger `ExecutionRequest` creation.
