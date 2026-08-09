# SCHEDULER_MODEL

**Companion to `ADR-001_HEADLESS_RUNTIME.md` — Decision 8.**
What the scheduler becomes when triggers execute prompts instead of workflows.
Design document. No code changed.

---

## 1. Current state

`packages/scheduler` is the only package `HEADLESS_RUNTIME_BOUNDARY.md` graded **Clean** — its sole
dependency is `node-cron`, with zero coupling to `shared` or any workflow type. Four files:

```
src/types.ts             Scheduler interface — once / every / cron / cancel / shutdown
src/local-scheduler.ts   node-cron + setTimeout/setInterval, state in a process-local Map
src/scheduler.ts         const activeScheduler: Scheduler = LocalScheduler
src/index.ts             barrel
```

Its consumer is `server/api/src/app/helper/system-jobs/system-job.ts`, which adapts it to
`SystemJobSchedule` and dispatches through a `systemJobHandlers` registry.

**That cleanliness is also the problem.** Verified deficiencies:

| # | Defect | Evidence |
|---|---|---|
| D1 | **Every failure is silently swallowed.** Each of `once`/`every`/`cron` wraps `fn()` in `try { … } catch { /* empty */ }` and attaches `res.catch(() => {})` | `local-scheduler.ts` — all three methods |
| D2 | **No durability.** `activeTasks` is a process-local `Map`; a pending `once()` is lost on restart | `local-scheduler.ts:4` |
| D3 | **No leader election.** N API replicas each fire every cron tick | no coordination anywhere in the package |
| D4 | **`getJob` is a fabrication.** Returns a stub whose `isFailed()` is hardcoded `false`, cast through `as any` | `system-job.ts:52-60` |
| D5 | **`systemJobsQueue` is `null as any`** — any caller crashes | `system-job.ts` final line |
| D6 | **`cancel` by `jobId` is unreliable.** `upsertJob` stores `activeJobIds.set(job.jobId, taskId)` but `cron()` returns `name` as its id while `once()` returns a randomized id | `system-job.ts:40,47` vs `local-scheduler.ts` |
| D7 | **Not linted.** No `.eslintrc.json`; `turbo run lint` fails outright for this package | `PR7_BLOCKERS.md` B6 |

D1–D3 are acceptable for maintenance chores that are re-derived on boot. They are **not** acceptable
for *"summarize my inbox every morning"*, where a missed tick is invisible and a triple-fired tick
sends three Slack messages.

---

## 2. Three planes

The audit asks whether the scheduler becomes a system scheduler, an agent scheduler, a recurring
prompt scheduler, or a maintenance scheduler. It is **all of them** — but they have materially
different requirements, so they must not share a driver.

| Plane | Workload | Durability | Failure visibility | Cancellable | Status |
|---|---|---|---|---|---|
| **System** | piece sync, file cleanup, tool-search reindex, trial tracker, AI-credit check, hard-delete project/platform, piece bundling | Best-effort. Re-derived on boot | Logged | No | **Exists** — 9 `SystemJobName` members |
| **Trigger** | schedule triggers; polling for integration triggers; `RENEW` for expiring webhook subscriptions | **Durable, at-least-once** | User-visible; auto-disable on repeated failure | Yes (disable) | **New** |
| **Agent** | recurring prompts, deferred agent tasks, retry-with-backoff of failed executions, approval expiry | **Durable, at-least-once** | User-visible per execution | Yes | **New** |

The distinction that matters: **system-plane work is idempotent and re-derivable; trigger- and
agent-plane work has externally visible side effects.** A missed piece sync self-heals on the next
tick. A missed `RENEW` silently stops event delivery until a human notices.

---

## 3. Target architecture

Keep the `Scheduler` interface — it is a good seam and it is already free of workflow vocabulary.
Add a second driver behind it.

```
                     ┌───────────────────────────────────┐
                     │  Scheduler  (types.ts, unchanged) │
                     │  once / every / cron / cancel     │
                     └───────────────┬───────────────────┘
                                     │
                 ┌───────────────────┴───────────────────┐
                 ▼                                       ▼
      ┌────────────────────┐                 ┌──────────────────────────┐
      │  LocalScheduler    │                 │  DurableScheduler        │
      │  node-cron         │                 │  Postgres scheduled_task │
      │  in-memory         │                 │  FOR UPDATE SKIP LOCKED  │
      │                    │                 │                          │
      │  System plane      │                 │  Trigger + Agent planes  │
      │  CE / dev default  │                 │  multi-replica safe      │
      └────────────────────┘                 └──────────────────────────┘
```

**Postgres, not Redis/BullMQ.** `self-hosting.md` requires that any feature default to **zero setup** —
"never ship something that looks enabled in the UI but is silently broken without manual setup". A
recurring-prompt feature that requires provisioning Redis fails that rule. `CLAUDE.md` already
mandates `FOR UPDATE SKIP LOCKED` as one of the sanctioned multi-server primitives, and
`managed-postgresql` constraints are satisfied — no extensions needed.

### The table

```sql
scheduled_task (
    id              varchar primary key,
    platform_id     varchar not null,
    project_id      varchar,
    plane           varchar not null,        -- 'trigger' | 'agent'
    kind            varchar not null,        -- 'cron' | 'once'
    cron_expression varchar,
    timezone        varchar,
    payload         jsonb not null,          -- { triggerId } | { executionId } | { prompt }
    next_run_at     timestamptz not null,
    last_run_at     timestamptz,
    locked_until    timestamptz,             -- lease, not a boolean lock
    catch_up        varchar not null,        -- 'skip' | 'once' | 'all'
    overlap         varchar not null,        -- 'skip' | 'queue' | 'concurrent'
    consecutive_failures int not null default 0,
    enabled         boolean not null default true
)

-- claim loop, every N seconds, on every replica
UPDATE scheduled_task
   SET locked_until = now() + interval '60 seconds'
 WHERE id IN (
     SELECT id FROM scheduled_task
      WHERE enabled
        AND next_run_at <= now()
        AND (locked_until IS NULL OR locked_until < now())
      ORDER BY next_run_at
      LIMIT 50
      FOR UPDATE SKIP LOCKED
 )
RETURNING *;
```

**A lease, not a boolean.** A worker that dies mid-task must not hold the row forever. The lease
expires and another replica picks it up — which is precisely why the guarantee is **at-least-once**,
not exactly-once. Handlers must be idempotent; `Execution.idempotencyKey` (`EXECUTION_MODEL.md` §2)
is what makes that safe at the business level.

Indexes: `(enabled, next_run_at)` for the claim; `(project_id)` for tenant queries.
`platform_id`/`project_id` are non-negotiable per `data-isolation.md`.

---

## 4. Two policies the current implementation has no concept of

These are the reason a recurring *AI task* is not just a recurring *job*.

### Catch-up — the process was down for three ticks

| Policy | Behaviour | Right for |
|---|---|---|
| `skip` | Fire only the next scheduled tick | *"Summarize my inbox every morning"* — three stale summaries at 2pm are noise |
| `once` | Fire once immediately, then resume | **Default.** Most digest-style tasks |
| `all` | Fire every missed tick | *"Sync new orders every 5 minutes"* — each tick covers a distinct window |

Getting this wrong is user-visible in both directions: `skip` on an order sync loses data; `all` on a
digest sends a burst of duplicates. It cannot have one global answer, so it is per-trigger.

### Overlap — the previous run is still going

| Policy | Behaviour | Right for |
|---|---|---|
| `skip` | **Default.** Drop this tick | Anything with a planner target — agent turns are slow and variable |
| `queue` | Run after the current one, max depth 1 | Ordered processing |
| `concurrent` | Run anyway | Independent, fast, side-effect-free work |

`skip` defaults because a planner turn can take tens of seconds against a five-minute cadence; without
it, a slow morning compounds into a backlog that never drains.

---

## 5. What each plane schedules

### System plane — unchanged, keep

Nine `SystemJobName` members, all real operational needs with zero workflow coupling:
`PIECES_ANALYTICS`, `PIECES_SYNC`, `FILE_CLEANUP_TRIGGER`, `TRIAL_TRACKER`, `AI_CREDIT_UPDATE_CHECK`,
`HARD_DELETE_PROJECT`, `HARD_DELETE_PLATFORM`, `TOOL_SEARCH_REINDEX`, `BUNDLE_PIECE`.

`TOOL_SEARCH_REINDEX` is currently registered but commented out at `app.ts:190-194`, including the
cold-start backfill. Decision 9 makes tool search a mandatory planner stage, so **this must be
re-enabled** — an unpopulated index degrades every retrieval to the keyword floor.

### Trigger plane — new

| Task | Cadence | Notes |
|---|---|---|
| Schedule trigger fire | per-trigger cron | `catchUp` + `overlap` apply |
| Integration trigger poll | per-integration `ScheduleOptions` | Cursor state in the engine store under `scope.triggerId` |
| `RENEW` subscription | before expiry, with margin | A missed renewal silently stops delivery — the highest-severity failure in the plane |
| Auto-disable sweep | hourly | Trips on `consecutive_failures` threshold |

### Agent plane — new

| Task | Cadence | Notes |
|---|---|---|
| Recurring prompt | per-trigger cron | Same mechanism as a schedule trigger with a `prompt` target |
| Deferred agent task | one-shot | *"Remind me in 2 hours"* — needs durability; `once()` currently loses these on restart (D2) |
| Execution retry | backoff | Only for retryable terminal failures |
| Approval expiry | one-shot, 24 h | Expires `AWAITING_APPROVAL` → `CANCELLED` (`EXECUTION_MODEL.md` §5) |

---

## 6. Fairness and limits

A durable multi-tenant scheduler needs bounds the current one has no concept of. Without them one
project with 500 triggers starves every other project on the claim query.

| Control | Mechanism |
|---|---|
| Per-project concurrent executions | Cap; excess ticks apply `overlap` policy |
| Per-project daily token budget | Checked before creating a planner-target execution |
| Claim fairness | Batch-claim ordered by `next_run_at`, then round-robin dispatch by `project_id` |
| Global backpressure | Extend leases and defer claims when the execution queue is saturated |

Per-trigger daily budgets are, in my view, a **ship-blocker** for planner-target triggers rather than a
follow-up: an unbounded recurring prompt is an unbounded bill, and the failure mode is discovered on
an invoice.

---

## 7. Required fixes to the existing package

Independent of the new driver, and all mechanical:

| # | Fix |
|---|---|
| F1 | Add `.eslintrc.json` to `packages/scheduler`; `turbo run lint` currently fails outright (D7) |
| F2 | Stop swallowing errors — take an `onError` callback or a logger; empty `catch {}` blocks are how D1 hid (D1) |
| F3 | Make `cancel(id)` reliable — return a consistent id from all three methods (D6) |
| F4 | Delete `systemJobsQueue = null as any` and `getJob`'s fabricated stub, or implement them honestly (D4, D5) |
| F5 | Widen `Scheduler` for the durable driver: `catchUp`, `overlap`, `timezone`, and an async claim loop |

F2 deserves emphasis: a scheduler that swallows every handler error is worse than no scheduler,
because it converts loud failures into silent ones. Every current system job — piece sync, file
cleanup, reindex — can fail today with no signal whatsoever.

---

## 8. Migration

| Step | Action | Risk |
|---|---|---|
| 1 | F1–F4 on the existing package | None — mechanical |
| 2 | Re-enable `TOOL_SEARCH_REINDEX` + backfill (`app.ts:190-194`) | Low; the backfill is explicitly no-op-once-populated |
| 3 | Add `scheduled_task` entity + migration; **register in `getEntities()`** | Low |
| 4 | Implement `DurableScheduler` behind the existing interface | Medium — the claim loop needs test coverage under concurrency |
| 5 | Route the trigger plane to it | Depends on `TRIGGER_MODEL.md` |
| 6 | Route the agent plane to it | Depends on the planner |
| 7 | Leave the system plane on `LocalScheduler` | None — deliberate |

Step 7 is a decision, not an omission: system-plane work is idempotent and re-derivable, so it does
not pay for durability, and keeping `LocalScheduler` as the CE/dev default preserves the zero-setup
guarantee.

---

## 9. What is deleted

Nothing in `packages/scheduler`. The interface is sound and the local driver keeps a job.

Deleted elsewhere: any flow-scoped scheduling remnants — `PollingJobData` and the `repeating`/`delayed`
job types in `job-data.ts` that reference flow versions (18 of its 26 exports already have zero
importers).
