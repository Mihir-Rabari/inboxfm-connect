# PR8E Implementation Document

## Changes Made

### 1. Scheduler Defect Fix & Exception Observability (`packages/scheduler`)
- **`packages/scheduler/src/types.ts`**:
  - Added `SchedulerTaskErrorContext` type definition.
  - Added optional `onError` handler parameter to `once`, `every`, and `cron` methods on `Scheduler` interface.
- **`packages/scheduler/src/local-scheduler.ts`**:
  - Removed empty `catch {}` blocks that previously swallowed execution errors silently.
  - Implemented `handleError` helper to route uncaught errors to `onError` handler (or formatted `console.error`), preserving task identity (`name`, `id`) and error stack traces.

### 2. User Scheduled Task Model (`packages/core/shared`)
- **`packages/core/shared/src/lib/execution/scheduled-task.ts`**:
  - Created `ScheduledTask` Zod schema and TypeScript type definitions.
  - Defined `ScheduledTaskStatus` (`ENABLED`, `DISABLED`).
  - Defined `CreateScheduledTaskRequest` and `UpdateScheduledTaskRequest`.
- **`packages/core/shared/src/lib/execution/index.ts`**:
  - Exported `scheduled-task`.
- **`packages/core/shared/package.json`**:
  - Bumped version to `0.115.0`.

### 3. User Scheduled Task Plane (`packages/server/api`)
- **`packages/server/api/src/app/execution/scheduled-task/scheduled-task-entity.ts`**:
  - TypeORM `EntitySchema` for `scheduled_task` table with multi-tenant `projectId` & `platformId` scoping and indices.
- **`packages/server/api/src/app/execution/scheduled-task/scheduled-task.service.ts`**:
  - CRUD operations (`create`, `getOneOrThrow`, `list`, `update`, `delete`, `triggerNow`).
  - Integrates with `@inboxfm-connect/scheduler` via `scheduler.cron`.
  - Dispatches `ExecutionRequest` -> `executionService.create()` without legacy workflow graph entities.
- **`packages/server/api/src/app/execution/scheduled-task/scheduled-task.controller.ts`**:
  - Fastify endpoints (`POST /v1/scheduled-tasks`, `GET /v1/scheduled-tasks`, `GET /v1/scheduled-tasks/:id`, `POST /v1/scheduled-tasks/:id`, `DELETE /v1/scheduled-tasks/:id`, `POST /v1/scheduled-tasks/:id/run`).
- **`packages/server/api/src/app/execution/scheduled-task/scheduled-task.module.ts`**:
  - Fastify plugin registering `/v1/scheduled-tasks` routes.
- **`packages/server/api/src/app/execution/execution.module.ts`**:
  - Registered `scheduledTaskModule`.
- **`packages/server/api/src/app/database/database-connection.ts`**:
  - Registered `ScheduledTaskEntity` in `getEntities()`.

### 4. Trigger Schedule Plane (`packages/server/api`)
- **`packages/server/api/src/app/execution/trigger-binding/trigger-binding.service.ts`**:
  - Added `syncTriggerSchedule` and `unsyncTriggerSchedule` helpers.
  - Syncs `TriggerBinding` cron schedules and webhook renewal jobs (`renewCronExpression`) directly with `scheduler.cron` upon enable/disable/delete.

### 5. Automated Tests
- **`packages/core/shared/test/execution/scheduled-task.test.ts`**:
  - Validates `ScheduledTask` Zod schema and asserts total absence of workflow graph properties (`flowId`, `flowVersionId`, `flowRunId`, `stepRunId`, etc.).
- **`packages/server/api/test/unit/app/scheduler/local-scheduler.test.ts`**:
  - Verifies structured error handling and `onError` callback invocations on `LocalScheduler`.
