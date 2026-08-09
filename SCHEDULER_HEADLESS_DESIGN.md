# Scheduler Headless Architecture Design

## Overview

In the Headless AI Integration Runtime architecture, the scheduler is decoupled from any workflow graph (`Flow`, `FlowVersion`, `FlowRun`). Its sole role is dispatching scheduled work across three conceptual planes:

```
+-----------------------------------------------------------------------+
|                            SCHEDULER PLANE                            |
+-----------------------------------------------------------------------+
        |                               |                       |
        v                               v                       v
+------------------+         +------------------+    +--------------------+
| 1. SYSTEM JOBS   |         | 2. USER TASKS    |    | 3. TRIGGER SCHEDULE|
| (Cleanup, Sync)  |         | (Scheduled Prompt|    | (Polling, Renew)   |
+------------------+         +------------------+    +--------------------+
        |                               |                       |
        v                               v                       v
Direct Service Call           ExecutionRequest          TriggerBinding
(e.g., fileService)             -> Execution             -> Trigger RUN/RENEW
                                -> AI Planner            -> Execution
```

---

## Plane 1: System Jobs

- **Target**: Internal system operations, cleanup tasks, and maintenance jobs.
- **Dispatch Semantics**: Directly executes registered async handlers (`systemJobHandlers`). Does NOT create `Execution`, `FlowRun`, or `ToolCall` records.
- **Jobs Managed**:
  - `FILE_CLEANUP_TRIGGER` (`30 */1 * * *`)
  - `TRIAL_TRACKER` (`*/59 23 * * *`)
  - `AI_CREDIT_UPDATE_CHECK` (on demand / scheduled)
  - `HARD_DELETE_PROJECT` / `HARD_DELETE_PLATFORM`
  - `TOOL_SEARCH_REINDEX`
  - `PIECES_SYNC` / `PIECES_ANALYTICS`
  - `BUNDLE_PIECE`
- **Tenancy**: System-wide / platform-scoped.

---

## Plane 2: User Scheduled Task Plane

- **Target**: Recurring user-defined AI prompts (e.g. "Every day at 9 AM, summarize sales data").
- **Entity**: `ScheduledTask`
  - `id`: Unique identifier (`apId()`)
  - `projectId`: Tenant isolation
  - `platformId`: Platform scope
  - `prompt`: The prompt string to execute
  - `cronExpression`: Standard 5-field cron expression (e.g., `0 9 * * *`)
  - `timezone`: String representation (e.g. `UTC`)
  - `status`: `ENABLED` | `DISABLED`
  - `lastRunAt`: ISO timestamp of previous trigger execution
  - `nextRunAt`: ISO timestamp of upcoming scheduled run
  - `created` / `updated`: Timestamps
- **Dispatch Semantics**:
  1. Cron fires on schedule.
  2. Scheduler calls `executionService.create({ request: { prompt: task.prompt, metadata: { scheduledTaskId: task.id } }, projectId, platformId })`.
  3. `Execution` record is persisted in `RUNNING` status and picked up by AI Planner.
  4. NO workflow graph, NO `FlowRun`, NO `StepRun`.

---

## Plane 3: Trigger Schedule Plane

- **Target**: `TriggerBinding` scheduled polling, cron triggers, and webhook renewal lifecycle hooks (PR8D).
- **Dispatch Semantics**:
  1. Polling / Cron Trigger:
     - Scheduler triggers on cron schedule for `TriggerBinding`.
     - Invokes `triggerBindingService.executeRun({ id, projectId, platformId })`.
     - `executeRun` calls `TriggerHookType.RUN` and dispatches `Execution` for each returned item.
  2. Renewal Lifecycle Hook:
     - Periodic scheduler job triggers `triggerBindingService.renew({ id, projectId, platformId })`.
     - Invokes `TriggerHookType.RENEW` to refresh webhook subscriptions.
- **Tenancy**: Strictly tenant-scoped (`projectId` & `platformId`).

---

## Reliability, Idempotency, and Defect Fixes

### 1. LocalScheduler Defect Fix
- Fixed silent exception swallowing (`catch {}`).
- All execution errors are now captured, wrapped with context (task name/ID, stack trace, timestamp), and logged via the application logger.

### 2. Idempotency & Deduplication
- Task identifiers follow deterministic naming conventions:
  - System Jobs: `system-job-${jobId}`
  - User Tasks: `user-task-${taskId}`
  - Trigger Polling: `trigger-polling-${bindingId}`
  - Trigger Renew: `trigger-renew-${bindingId}`
- Re-registering or updating a task cancels existing active timers/crons before re-scheduling.

### 3. Error Handling & Retries
- System Jobs: Failed executions are logged with structured errors; retries are handled at the service level if necessary.
- User Tasks: If `Execution` creation fails, the dispatch error is logged. Once an `Execution` is created, execution failures are owned by the `Execution` lifecycle (`FAILED` status).
- Trigger Schedules: Renewal or run failures trigger structured logging without breaking future cron schedules.
