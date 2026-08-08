# TRIGGER_MODEL

**Companion to `ADR-001_HEADLESS_RUNTIME.md` — Decision 2.**
What a trigger is when there are no workflows.
Design document. No code changed.

---

## 1. The product case

Without triggers, InboxFM Connect can only act while a human is typing. That reduces an AI-native
integration runtime to a synchronous API gateway and deletes an entire product surface:

- *"Every morning, summarize my inbox and post the highlights to Slack."*
- *"When a Stripe invoice is paid, file the receipt in Drive and update the ledger."*
- *"Watch this Notion database; when a task is marked blocked, draft the escalation email."*

None of these is a workflow feature. They are the difference between an **agent platform** and a
**request/response API**. Deleting triggers would be the largest unforced product reduction available
in this audit.

**Verdict: KEEP, with a new responsibility.**

---

## 2. New responsibility

> A Trigger is a **binding from an external event to an ExecutionRequest**.

It resolves an event into a prompt or a tool invocation and hands it to the runtime. It has no graph,
no steps, no downstream, and it executes nothing itself.

```
         ┌──────────┐    event    ┌──────────┐   ExecutionRequest   ┌───────────┐
         │  SOURCE  │────────────▶│ BINDING  │─────────────────────▶│ EXECUTION │
         └──────────┘             └──────────┘                      └───────────┘
       schedule | webhook       payload → input                    planner or
       | integration event      + connection scope                 direct tool call
```

The critical inversion: in Activepieces the trigger was **step zero of the graph** and its payload
became `trigger.output` for downstream steps to reference via `{{trigger['output'].body.email}}`.
Here the payload is **planner input**. There is no downstream to reference it, and no template
language binding it to later steps.

---

## 3. The model

```ts
type Trigger = {
    id: string
    projectId: string
    platformId: string
    displayName: string
    enabled: boolean

    source: TriggerSource
    target: ExecutionTarget

    // runtime state, owned by the platform
    lastFiredAt?: string
    lastError?: string
    consecutiveFailures: number
    subscription?: TriggerSubscription   // integration-managed handle, see §5
}

type TriggerSource =
    | { kind: 'schedule', cron: string, timezone: string,
        catchUp: CatchUpPolicy, overlap: OverlapPolicy }
    | { kind: 'webhook', path: string, secret?: string,
        responseMode: 'ack' | 'await-result' }
    | { kind: 'integration', binding: TriggerBinding }

type ExecutionTarget =
    | { kind: 'prompt', text: string, agentId?: string }
    | { kind: 'tool', invocation: ToolInvocation }
```

**Two target kinds, deliberately.** `prompt` is the AI-native path — the event payload is
interpolated into the prompt and the planner decides what to do. `tool` is a deterministic escape
hatch for *"when X happens, always do exactly Y"*, where invoking an LLM adds cost, latency, and
non-determinism for no benefit. Forcing every trigger through a planner would be ideological rather
than useful.

**Payload delivery.** The event payload is bound as a named variable, not spliced into the prompt
string. A webhook body is untrusted input, and untrusted input concatenated into a prompt is prompt
injection. It arrives as structured context the planner reads, with the system prompt stating that
its contents are data, not instructions. This is a security property of the design, not a detail.

---

## 4. `TriggerBinding` — what replaces `FlowVersion`

**B4 resolved.** `EXECUTE_TRIGGER_HOOK` stays; its payload changes.

Verified: `trigger-helper.ts` reads exactly four things from `params.flowVersion`:

| Line | Read | Purpose |
|---|---|---|
| 77 | `(flowVersion.trigger as PieceTrigger).settings` → `pieceName`, `pieceVersion`, `triggerName`, `input`, `propertySettings` | Resolve the trigger and its props |
| 103 | `flowVersion.flowId` | Store namespace key |
| 127 | `flowVersion.flowId` | Store namespace key |
| 128 | `flowVersion.id` | Store namespace key |

Nothing else. The entire `FlowVersion` graph — actions, connections, valid state, schema version — is
carried across the sandbox boundary so that four fields can be read, two of which are used only as
opaque strings for store scoping.

```ts
type TriggerBinding = {
    integration: string
    integrationVersion: string
    triggerName: string
    connectionId: string
    input: Record<string, unknown>
    propertySettings?: PropertySettings
    scope: { triggerId: string }        // replaces flowId + flowVersionId
}

type ExecuteTriggerOperation<HT extends TriggerHookType> = BaseEngineOperation & {
    hookType: HT
    test: boolean
    binding: TriggerBinding             // was: flowVersion: FlowVersion
    webhookUrl: string
    triggerPayload?: TriggerPayload
    appWebhookUrl?: string
    webhookSecret?: string | Record<string, string>
}
```

`scope` collapses two keys into one because there is no version dimension: a trigger has an identity,
not a history. Store keys become `{triggerId}/{key}` instead of `{flowId}/{flowVersionId}/{key}` —
and store data now survives edits to the trigger, which is the behaviour users expect anyway
(re-publishing a flow silently orphaning its trigger store was a long-standing wart).

Also change: `triggerPayload?: JobPayload` → `triggerPayload?: TriggerPayload`. `JobPayload` is a
worker-queue type from the removed flow-execution system; `TriggerPayload` is the actual webhook
shape. See §8 for the duplicate-definition hazard.

---

## 5. Why the integration trigger lifecycle is kept

`TriggerHookType` (`engine-operation.ts:21`) has six members, each implemented per integration across
the 400+ integration library:

| Hook | Responsibility | Example |
|---|---|---|
| `ON_ENABLE` | Register the subscription with the third party | Create a Stripe webhook endpoint; start a Gmail watch |
| `ON_DISABLE` | Tear it down | Delete the endpoint; stop the watch |
| `RENEW` | Refresh an expiring subscription | Gmail `watch` expires after 7 days |
| `HANDSHAKE` | Answer a provider's verification challenge | Slack `url_verification` |
| `RUN` | Convert a raw delivery or poll into events | Dedupe, unwrap, page |
| `TEST` | Fetch recent items for validation | Preview what this trigger would produce |

**This is integration logic, not workflow logic.** Nothing about "renew a Gmail watch before it
expires" belongs to a graph. Its coupling to `FlowVersion` is a transport accident of the original
architecture. Discarding this because of that accident would be exactly the dependency-graph-driven
decision ADR-001 forbids — and it is the second most valuable asset in the repository after the
actions themselves.

`RENEW` in particular is why the trigger plane needs a *durable* scheduler (`SCHEDULER_MODEL.md`): a
missed renewal silently stops delivering events, and the failure is invisible until a user notices
nothing has fired.

---

## 6. Execution paths

### Schedule

```
scheduler tick (durable, leader-elected)
  → load Trigger, check enabled + overlap policy
  → create Execution { trigger: { kind: 'schedule', triggerId } }
  → target.kind === 'prompt'  → planner loop
    target.kind === 'tool'    → runtime.execute(invocation)
```

### Webhook

```
POST /v1/triggers/:id/webhook
  → verify secret / signature
  → EXECUTE_TRIGGER_HOOK { hookType: RUN, binding, triggerPayload }
      (the integration unwraps, dedupes, and may emit 0..n events)
  → per event: create Execution
  → responseMode 'ack'          → 200 immediately  (default)
    responseMode 'await-result' → hold until the execution finishes, bounded by deadline
```

`ack` is the default because a third-party webhook sender times out in seconds while an agent turn
takes tens of seconds. `await-result` exists for the request/response integrations that need it, and
is bounded.

### Integration event (polling)

```
scheduler tick → EXECUTE_TRIGGER_HOOK { hookType: RUN, binding }
               → integration returns new items since its last cursor
               → one Execution per item (or one per batch, per trigger config)
```

Polling cursor state lives in the engine's store under `scope.triggerId`.

---

## 7. Lifecycle and failure

| Transition | Action |
|---|---|
| Trigger created, `enabled: true` | `ON_ENABLE`; persist `subscription`; schedule `RENEW` if the integration declares an expiry |
| Trigger disabled | `ON_DISABLE`; cancel scheduled renewals and polls |
| Trigger deleted | `ON_DISABLE` best-effort, then delete. Never block deletion on a third-party call |
| `RENEW` due | Re-register; on failure, retry with backoff, then auto-disable and alert |
| `consecutiveFailures` exceeds threshold | Auto-disable with a recorded reason |

**Auto-disable is a product requirement, not a safety valve.** A trigger bound to a revoked
connection will fail on every tick forever, burning third-party rate limit and generating noise. The
threshold must be paired with a visible, queryable reason — the old system's silent disabling on a
missing piece (`flow-provisioning.ts`) was a recurring support burden precisely because the reason
was not surfaced.

---

## 8. `TriggerPayload` — resolve the duplicate

Two definitions exist and they **disagree**:

```ts
// core-execution/src/lib/engine/engine-operation.ts:116  — schema validates `method`
method: z.string().optional(),

// core-piece-types/src/lib/engine.ts:3                   — `method` absent from the schema
//                                                          but present on the TS type
```

Both TS types declare `method?: string`; only one schema validates it. A webhook payload parsed with
the `core-piece-types` copy **silently drops `method`** — and `method` is how a trigger distinguishes
a `POST` delivery from a `GET` verification challenge.

Per ADR-001 B2: **`core-piece-types` owns the piece-facing contract**, and its schema is fixed to
include `method`. The `core-execution` copy is deleted. This is one of only two semantically real
divergences among 58 duplicated declarations, and it sits directly on the trigger path.

---

## 9. What is deleted

| Concept | Reason |
|---|---|
| `FlowTrigger`, `FlowTriggerType`, `PieceTrigger` | Trigger-as-a-graph-node |
| `TriggerSource` entity (flow-scoped) | Replaced by `Trigger` |
| `trigger-run.ts`, `test-trigger.ts`, `TriggerTestStrategy` | Builder trigger-testing |
| `triggers/index.ts` barrel | Only forwards the above |
| `ExecuteTriggerOperation.flowVersion` | → `binding` |
| `JobPayload` on the trigger path | Worker-queue type from the removed flow system |
| `AUTHENTICATION_PROPERTY_NAME` (if only used for flow trigger auth) | Verify before deleting |

## 10. What is kept

| Concept | Reason |
|---|---|
| `EXECUTE_TRIGGER_HOOK` | Live engine operation; new payload |
| `TriggerHookType`, all six members | Real integration subscription lifecycle |
| `trigger-helper.ts` | Retyped, not rewritten — it reads four fields |
| `TriggerPayload` (`core-piece-types`, fixed) | The actual webhook shape |
| Every integration's trigger implementation | The asset |
| `ScheduleOptions` | Integration-declared polling cadence |

---

## 11. Open questions

Flagged rather than guessed, because each changes the data model:

1. **Fan-out cap.** One poll returning 500 new rows creates 500 executions. Cap, batch, or run one
   execution over the batch? Recommendation: per-trigger `batchMode`, defaulting to batch, because an
   agent summarizing 500 emails in one turn is usually what the user meant.
2. **Trigger-scoped memory.** Should *"escalate if this is the third time this week"* be expressible?
   That needs cross-execution state, which the model currently forbids. Recommendation: defer;
   revisit only with a concrete request, and implement it as an integration-backed store rather than
   runtime state.
3. **Per-trigger budgets.** A runaway trigger with a planner target can burn a token budget quickly.
   A per-trigger daily cap is probably required before triggers ship, not after.
