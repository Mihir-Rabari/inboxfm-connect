# Trigger Architecture — Headless Integration Runtime

## 1. Overview & Vision

Triggers are event listeners that initiate headless AI execution upon receiving external signals (Webhooks, Cron schedules, Email, System events).

**Core Trigger Principle**:
Triggers initiate **Prompt / Agent Executions**, NOT workflow graphs.

```
External Event (Webhook / Cron / Signal)
       ↓
  TriggerBinding (Stores piece, triggerName, promptTemplate, config)
       ↓
  Prompt / Agent Planner
       ↓
   Execution (Headless Runtime)
```

---

## 2. TriggerBinding Model

Replace legacy `FlowVersion`-coupled triggers with `TriggerBinding`:

```ts
export type TriggerBinding = {
    id: ApId
    projectId: ProjectId
    platformId: PlatformId
    pieceName: string
    pieceVersion: string
    triggerName: string
    connectionId: string | null
    promptTemplate: string
    settings: Record<string, unknown>
    status: TriggerBindingStatus // ENABLED, DISABLED
    created: string
    updated: string
}
```

---

## 3. Integration Lifecycle Preservation

Existing piece integration lifecycle hooks must be fully preserved:
- **`ON_ENABLE`**: Executes when `TriggerBinding` is activated. Subscribes external webhooks/resources.
- **`ON_DISABLE`**: Executes when `TriggerBinding` is deactivated. Unsubscribes external resources.
- **`RENEW`**: Executes periodically to renew expiring webhook subscriptions (e.g. Google Drive watch channels).
- **`RUN`**: Executes when a trigger event payload arrives, processing and returning raw event payloads to feed into the prompt/agent context.

---

## 4. `trigger-helper.ts` Refactoring Plan

Currently, `trigger-helper.ts` reads `flowVersion.trigger.settings`, `flowId`, and `id`.

**Refactoring Strategy**:
1. Remove `FlowVersion` import and parameters from `triggerHelper` functions (`enable`, `disable`, `executeTrigger`).
2. Replace `FlowVersion` with `TriggerBinding`.
3. Pass `triggerBinding.settings`, `triggerBinding.id`, and `triggerBinding.pieceName` directly to the engine sandbox operation `ExecuteTriggerOperation`.
4. Decouple `engineToken` generation from `flowId` / `flowVersionId`.
