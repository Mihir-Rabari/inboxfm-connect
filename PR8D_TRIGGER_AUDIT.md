# PR8D — Trigger System Audit & Dependency Map

## Executive Summary

Audit performed for PR8D — TriggerBinding & Integration Lifecycle Rework.
The objective of PR8D is to decouple integration triggers from `FlowVersion` and workflow graphs while preserving the integration subscription lifecycle (`ON_ENABLE`, `ON_DISABLE`, `RENEW`, `RUN`, `HANDSHAKE`, `TEST`).

---

## 1. Existing Trigger Architecture

In the legacy runtime, triggers were defined as step 0 of a `FlowVersion` graph:

```
External Event → FlowVersion (Trigger Step) → FlowRun → Engine (Step Execution)
```

The trigger runtime (`trigger-helper.ts`) previously received an entire `FlowVersion` object, but inspection proved it read only four fields:
1. `(flowVersion.trigger as PieceTrigger).settings`: `pieceName`, `pieceVersion`, `triggerName`, `input`, `propertySettings`
2. `flowVersion.flowId`: Store namespace key
3. `flowVersion.id`: Store namespace key

The workflow graph structure, actions, connections, and step configurations were completely unused by `trigger-helper.ts`.

---

## 2. Dependency Map

### Target Headless Architecture:

```
TriggerBinding
    ↓
trigger-helper.ts
    ↓
ExecuteTriggerOperation
    ↓
Engine Sandbox
    ↓
Integration Piece Trigger
    ↓
ON_ENABLE / ON_DISABLE / RENEW / RUN
```

### Event Delivery Paths:

#### 1. Webhook Path
```
POST /v1/trigger-bindings/:id/webhook
    ↓
TriggerBinding lookup (by id, status === ENABLED)
    ↓
ExecuteTriggerOperation { hookType: RUN, triggerBinding, triggerPayload }
    ↓
Integration Trigger.run() → emitted event items
    ↓
per item: ExecutionRequest { prompt, metadata: { triggerBindingId, item } }
    ↓
Execution (AI Planner / Deterministic Tool Call)
```

#### 2. Cron / Scheduled Path
```
Scheduled Tick
    ↓
TriggerBinding lookup (status === ENABLED)
    ↓
ExecuteTriggerOperation { hookType: RUN, triggerBinding }
    ↓
Integration Trigger.run() → new items since last cursor
    ↓
per item: ExecutionRequest { prompt, metadata: { triggerBindingId, item } }
    ↓
Execution
```

#### 3. Renewal Path
```
Renewal Timer
    ↓
TriggerBinding lookup
    ↓
ExecuteTriggerOperation { hookType: RENEW, triggerBinding }
    ↓
Integration Trigger.onRenew() → third-party subscription refreshed
```

---

## 3. Integration Lifecycle Hooks

The six members of `TriggerHookType` represent integration capabilities, NOT workflow graph logic:

| Hook | Purpose | Graph-Independent |
|---|---|---|
| `ON_ENABLE` | Register subscription with external service (e.g. Stripe webhook, Gmail watch) | YES |
| `ON_DISABLE` | Unregister subscription | YES |
| `RENEW` | Refresh expiring subscription before expiry | YES |
| `HANDSHAKE` | Respond to verification challenge (e.g. Slack url_verification) | YES |
| `RUN` | Process incoming webhook payload or poll for new events | YES |
| `TEST` | Preview trigger payload items for validation | YES |

---

## 4. FlowVersion Decoupling Plan

1. Introduce `TriggerBinding` entity and type contract in `@inboxfm-connect/shared`.
2. Update `ExecuteTriggerOperation` to support `triggerBinding` (with optional `flowVersion` fallback for legacy code paths).
3. Refactor `trigger-helper.ts` to read trigger metadata directly from `triggerBinding`.
4. Implement `TriggerBindingService`, `TriggerBindingController`, and database migration `1810000000000-AddTriggerBindingTable`.
5. Ensure trigger execution creates `ExecutionRequest` / `Execution` and ZERO `FlowRun` or `FlowVersion` objects.
