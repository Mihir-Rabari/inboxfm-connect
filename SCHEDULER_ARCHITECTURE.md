# Scheduler Architecture — Headless Integration Runtime

## 1. Overview & Conceptual Planes

The Scheduler is responsible for timing-based triggers and system maintenance. Its responsibilities are partitioned into 3 distinct conceptual planes:

```
                      ┌───────────────────────────┐
                      │    Scheduler Interface    │
                      └─────────────┬─────────────┘
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         ▼                          ▼                          ▼
 1. System Jobs             2. User Tasks              3. Trigger Schedules
 (Cleanup, Indexing,        (Scheduled Prompts,        (Cron Bindings,
  Sync, Health)              Agent Executions)          Renew Hooks)
```

---

## 2. Partitioned Planes & Responsibilities

### 2.1 System Jobs
- **Scope**: Platform maintenance, DB cleanup, Knowledge Search vector re-indexing, piece synchronization.
- **Trigger**: System-defined intervals.
- **Execution**: Directly invokes server service methods.

### 2.2 User Scheduled Tasks
- **Scope**: Scheduled prompts (e.g. "Run daily sales report prompt at 9 AM").
- **Trigger**: User crontabs or one-off timers.
- **Execution**: Dispatches `ExecutionRequest` to `HeadlessRuntime`.

### 2.3 Trigger Scheduling
- **Scope**: Polling pieces, renewal hooks (`RENEW` for webhooks), cron-driven integration triggers.
- **Trigger**: `TriggerBinding` schedules.
- **Execution**: Invokes engine `ExecuteTriggerOperation`.

---

## 3. Implementation & Defect Remediation

### 3.1 Defect B Documentation (LocalScheduler Empty Catch Blocks)
- **Issue**: `LocalScheduler` contains empty `catch {}` blocks in error handlers. Failures silently disappear without logging or retry handling.
- **Remediation Plan**: Refactor `LocalScheduler` and `BullMQScheduler` to use `tryCatch` from `@inboxfm-connect/shared`, log structured errors, and emit health metric counters upon job scheduling/execution failures.

### 3.2 Observability, Idempotency & Persistence
- Job locks managed via `distributedLock` or Redis/BullMQScheduler deduplication keys (`jobId = triggerBindingId + timestamp`).
- Execution records created with idempotency keys to prevent duplicate execution dispatches.
