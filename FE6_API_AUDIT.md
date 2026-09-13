# FE6 — API Contract Audit (Trigger Bindings & Scheduled Tasks)

Audited against the live backend source (authoritative over `FRONTEND_API_CONTRACT.md` where they differ):

- `packages/server/api/src/app/execution/trigger-binding/` (controller, service, entity, module)
- `packages/server/api/src/app/execution/scheduled-task/` (controller, service, entity, module)
- `packages/core/shared/src/lib/execution/trigger-binding.ts`
- `packages/core/shared/src/lib/execution/scheduled-task.ts`
- `packages/core/shared/src/lib/execution/execution.ts`
- `packages/core/shared/src/lib/execution/dto/*`

## Discrepancies found in `FRONTEND_API_CONTRACT.md`

| Contract doc says | Backend actually does | Resolution |
|---|---|---|
| `GET /v1/trigger-bindings` → `TriggerBinding[]` | Returns `SeekPage<TriggerBinding>` (`{ data, next, previous }`) | Frontend unwraps `.data` |
| `GET /v1/scheduled-tasks` → `ScheduledTask[]` | Returns `SeekPage<ScheduledTask>` (`{ data, next, previous }`) | Frontend unwraps `.data` |
| `POST .../:id/run` → `Execution` | Trigger binding run returns `Execution[]` (one per event item); scheduled task run returns a single `Execution` | Documented below |
| — | Extra endpoints not in the doc: `POST /v1/trigger-bindings/:id/renew`, enable/disable endpoints exist as separate routes | Documented below |

All updates use **POST** (repo convention: no PUT/PATCH).

---

## 1. Trigger Bindings — `/v1/trigger-bindings`

Registered in `trigger-binding.module.ts` with prefix `/v1/trigger-bindings`.

### Entity (`TriggerBinding`, Zod schema in shared)

```ts
{
  id: string            // BaseModelSchema
  created: string       // ISO timestamp
  updated: string       // ISO timestamp
  projectId: string
  platformId: string
  pieceName: string
  pieceVersion: string
  triggerName: string
  connectionId: string | null
  promptTemplate: string
  settings: Record<string, unknown>
  propertySettings?: Record<string, unknown>
  status: 'ENABLED' | 'DISABLED'
}
```

Notes:
- **No display name field.** Identity is `pieceName / triggerName`.
- **No target tool fields.** The binding's `promptTemplate` is the instruction handed to
  HeadlessRuntime when an event fires (`executionService.create({ prompt: binding.promptTemplate, metadata })`).
  Target tool selection is NOT part of the backend model and is therefore **omitted from the UI**.
- `settings` is opaque to the controller/service except for two recognized keys used by the
  scheduler sync (`syncTriggerSchedule` in the service):
  - `settings.cronExpression?: string` — registers a cron job that runs the binding periodically.
  - `settings.renewCronExpression?: string` — registers a cron job that calls the renew hook
    (used by triggers whose provider subscriptions expire).
- `propertySettings` is optional and unused by service logic; frontend does not need to populate it.

### Endpoints

| Operation | Method + Path | Request body | Success response |
|---|---|---|---|
| Create | `POST /v1/trigger-bindings` | `CreateTriggerBindingRequest` | `201` + `TriggerBinding` |
| List | `GET /v1/trigger-bindings` | – | `200` + `SeekPage<TriggerBinding>` |
| Get | `GET /v1/trigger-bindings/:id` | – | `200` + `TriggerBinding` |
| Update | `POST /v1/trigger-bindings/:id` | `UpdateTriggerBindingRequest` | `200` + `TriggerBinding` |
| Delete | `DELETE /v1/trigger-bindings/:id` | – | `204` empty |
| Enable | `POST /v1/trigger-bindings/:id/enable` | – | `200` + `TriggerBinding` |
| Disable | `POST /v1/trigger-bindings/:id/disable` | – | `200` + `TriggerBinding` |
| Renew hook | `POST /v1/trigger-bindings/:id/renew` | – | `200` + `Record<string, never>` (empty object) |
| Run / Test | `POST /v1/trigger-bindings/:id/run` | optional JSON body = simulated event payload (`z.unknown().optional()`), route is `securityAccess.public()` (webhook-style) | `200` + `Execution[]` |

### `CreateTriggerBindingRequest`

```ts
{
  projectId?: string          // ignored; derived from security context (x-project-id header)
  platformId?: string         // ignored; derived from principal
  pieceName: string           // required
  pieceVersion: string        // required
  triggerName: string         // required
  connectionId: string | null // key REQUIRED in body (nullable, not optional). Send null for no-auth triggers.
  promptTemplate: string      // required
  settings: Record<string, unknown> // required; send {} minimum. Trigger input values go here.
  propertySettings?: Record<string, unknown>
  status?: 'ENABLED' | 'DISABLED'   // defaults to ENABLED server-side; creating ENABLED fires the ON_ENABLE hook immediately
}
```

### `UpdateTriggerBindingRequest`

```ts
{
  pieceName?: string
  pieceVersion?: string
  triggerName?: string
  connectionId: string | null // NOTE: required key in schema (Nullable(z.string()) without .optional())
  promptTemplate?: string
  settings?: Record<string, unknown>
  propertySettings?: Record<string, unknown>
  status?: 'ENABLED' | 'DISABLED'
}
```

Update semantics (service):
- Partial merge onto existing row; `updated` refreshed.
- Status transition DISABLED→ENABLED fires ON_ENABLE hook + re-registers cron schedules.
- Status transition ENABLED→DISABLED fires ON_DISABLE hook + cancels cron jobs.
- The dedicated `/enable` and `/disable` endpoints delegate to update with `{ status }`.

Delete semantics:
- Cancels associated cron jobs (`trigger-cron-*`, `trigger-renew-*`) and best-effort ON_DISABLE hook if enabled.
- **The backend does NOT claim external provider subscriptions are removed** — UI copy must not promise it.

Run/Test semantics (`executeRun`):
- Throws `ActivepiecesError(VALIDATION)` (HTTP 400-ish via error handler) if binding is DISABLED.
- Calls the engine RUN hook with `triggerPayload` = request body (may be undefined).
- Wraps each output item into an `Execution` created via `executionService.create` with
  `prompt = binding.promptTemplate` and `metadata.triggerBindingId/pieceName/triggerName/item`.
- Response is `Execution[]`; empty array possible if the trigger returned no items.

### Errors

Standard `ApiClientError` mapping applies: 401 (auth), 403 (permission), 404
(`ENTITY_NOT_FOUND` — "TriggerBinding {id} not found"), 422/validation, 500. Delete of an
unknown id → 404. Run on disabled binding → validation failure message
(`TriggerBinding {id} is currently disabled`).

---

## 2. Scheduled Tasks — `/v1/scheduled-tasks`

Registered with prefix `/v1/scheduled-tasks`.

### Entity (`ScheduledTask`)

```ts
{
  id: string
  created: string
  updated: string
  projectId: string
  platformId: string
  prompt: string
  cronExpression: string     // standard 5-field cron, interpreted by node-cron (@inboxfm-connect/scheduler)
  timezone: string           // default 'UTC' applied server-side when omitted
  status: 'ENABLED' | 'DISABLED'
  lastRunAt: string | null
  nextRunAt: string | null   // always null today: backend never computes it (see Known limitations)
}
```

Notes:
- **No name field** — the `prompt` doubles as the identity shown in lists.
- **No target tool / connection fields.** Execution is prompt-driven via HeadlessRuntime
  (`dispatchExecution` → `executionService.create({ prompt: task.prompt, metadata: { scheduledTaskId, cronExpression, timezone } })`).

### Endpoints

| Operation | Method + Path | Request body | Success response |
|---|---|---|---|
| Create | `POST /v1/scheduled-tasks` | `CreateScheduledTaskRequest` | `201` + `ScheduledTask` |
| List | `GET /v1/scheduled-tasks` | – | `200` + `SeekPage<ScheduledTask>` |
| Get | `GET /v1/scheduled-tasks/:id` | – | `200` + `ScheduledTask` |
| Update | `POST /v1/scheduled-tasks/:id` | `UpdateScheduledTaskRequest` | `200` + `ScheduledTask` |
| Delete | `DELETE /v1/scheduled-tasks/:id` | – | `204` empty |
| Run Now | `POST /v1/scheduled-tasks/:id/run` | – | `200` + `Execution` |

There are **no dedicated enable/disable endpoints** for scheduled tasks; status transitions go
through update (`status: 'ENABLED' | 'DISABLED'`). Update re-syncs or cancels the BullMQ cron job.

### `CreateScheduledTaskRequest`

```ts
{
  projectId?: string    // ignored
  platformId?: string   // ignored
  prompt: string        // required
  cronExpression: string // required
  timezone?: string     // default 'UTC'
  status?: 'ENABLED' | 'DISABLED' // default ENABLED; ENABLED registers the schedule immediately
}
```

### `UpdateScheduledTaskRequest`

```ts
{ prompt?, cronExpression?, timezone?, status? } // all optional
```

Run Now semantics: creates one `Execution` synchronously (returns the record), then sets
`lastRunAt` on the task. Works regardless of task status (no ENABLED guard, unlike trigger run).

Cron engine: `node-cron` (5-field). Timezone is passed at scheduling time; changing
`cronExpression`/`timezone` requires an update call, which re-registers the job.

---

## 3. Execution records (shared by both features)

`Execution` (from `packages/core/shared/src/lib/execution/execution.ts`):

```ts
{
  id, created, updated,
  projectId, platformId,
  userId?: string | null,
  status: 'CREATED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED',
  prompt: string,
  metadata: Record<string, unknown>, // triggerBindingId / scheduledTaskId etc.
  tokenUsage?: TokenUsage | null,
  cost?: number | null,
  finishTime?: string | null
}
```

Important: statuses are `CREATED`/`COMPLETED` — **not** `SUCCEEDED`. The previous web type
(`'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'`) was wrong and has been corrected.

Executions created by FE6 endpoints carry only an id/status initially — there is no inline
"result payload". Deep inspection happens through existing Activity endpoints
(`GET /v1/executions/:id`, `GET /v1/executions/:id/tool-calls`). The UI links test/run results
to `/activity/:id` instead of fabricating results.

## 4. Pagination

Both list endpoints currently return ALL rows for the project (`repo.findBy`, `next: null`,
`previous: null`). No query params are read. The UI therefore renders the full `data` array
without cursor handling but keeps the `SeekPage` shape so cursors can be added later without
frontend churn.

## 5. Security notes

- Create/list/get/update/delete/enable/disable/run-now require USER or SERVICE principal with
  READ_RUN/WRITE_RUN permissions scoped to the project (`x-project-id` header supplies projectId).
- `POST /v1/trigger-bindings/:id/run` is public (webhook-style) — the UI still calls it with the
  normal bearer token; the endpoint tolerates unauthenticated webhook calls.
- Neither entity stores secrets. `promptTemplate`/`prompt` may contain user-sensitive text:
  never placed in URLs, query strings, localStorage, or error messages by the frontend.
