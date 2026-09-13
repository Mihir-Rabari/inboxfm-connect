# FE8 API AUDIT — Activity & Execution Observability

> Forensic audit of the backend execution contract. Backend source code is the authority.
> Audit performed at HEAD `ff0599cf95d3853f98475a79e0940076e1305f66` (branch `main`, = `origin/main`).
> **No source code was modified during this audit.**
>
> Where this document conflicts with `FRONTEND_API_CONTRACT.md`, **this document is correct** —
> the contract doc contains stale claims (see §12 Conflict Register).

---

## Contents

1. Route Inventory (verified, not assumed)
2. Execution Entity / Database Forensics
3. Execution List Contract
4. Execution Detail Contract
5. Tool Calls Contract
6. SSE / Event Stream Forensics
7. Execution Lifecycle Reality (dead code paths)
8. Security / Data Exposure Audit
9. FE5 Execution Seam Audit
10. Provenance Matrix: Direct / TriggerBinding / ScheduledTask / MCP
11. Existing Frontend Audit
12. FRONTEND_API_CONTRACT.md Conflict Register

---

## 1. Route Inventory

Module registration: `packages/server/api/src/app/execution/execution.module.ts` → prefix **`/v1/executions`**.

All routes verified in `packages/server/api/src/app/execution/execution.controller.ts`:

| # | Method | Route | Exists | Line | Permission | projectId resource |
|---|--------|-------|--------|------|------------|--------------------|
| 1 | POST | `/v1/executions` | YES | :14 | `WRITE_RUN` | **BODY** |
| 2 | GET | `/v1/executions/:id` | YES | :35 | `READ_RUN` | **PARAM** |
| 3 | GET | `/v1/executions/:id/tool-calls` | YES | :42 | `READ_RUN` | **PARAM** |
| 4 | GET | `/v1/executions/:id/events` | YES | :49 | `READ_RUN` | **PARAM** — SSE |
| 5 | GET | `/v1/executions` | YES | :75 | `READ_RUN` | **QUERY** |

Allowed principals on all five: `USER | ENGINE | SERVICE`.

### Endpoints that do NOT exist — do not design against them

- NO execution cancellation endpoint (`POST /v1/executions/:id/cancel` etc.)
- NO execution retry endpoint
- NO execution delete endpoint
- NO REST event-history endpoint — `executionEventService.getEventsSince()` exists but has **zero HTTP exposure** (only caller: unit test)
- NO date-range / integration / tool / search filters on the list
- NO server-side sort options (fixed `created DESC`)
- NO cursor pagination in practice (accepted by schema, ignored by service)

### 1.1 CRITICAL FINDING — `:id` routes are broken for USER principals

Routes 2/3/4 declare `{ type: ProjectResourceType.PARAM }`. In
`core/security/v2/authz/projectIdExtractor.ts:64-68`, PARAM extraction reads:

```ts
const key = projectParamResource.paramKey ?? 'projectId'   // defaults to 'projectId'
const { [key]: paramValue } = request.params               // route param is ':id', not ':projectId'
return paramValue ?? undefined                             // -> always undefined
```

No fallback exists: `authorize.ts:94-104` throws `AUTHORIZATION "Project ID is required"` when nil.
Only `PrincipalType.ENGINE` works (`authorization-middleware.ts:73-76` uses `principal.projectId`).

**Consequence:** from a browser (USER principal), `GET /v1/executions/:id`,
`/:id/tool-calls`, and `/:id/events` deterministically fail with an AUTHORIZATION error.

The canonical working pattern for `/:id` routes is `ProjectResourceType.TABLE`
(entity lookup derives `projectId` from the row) — used by connections
(`app-connection.controller.ts:190-198`), tables, records, fields. The execution module does not use it.

**Also affected (same defect):** `trigger-binding.controller.ts` and
`scheduled-task.controller.ts` use PARAM for every `/:id` route — FE6 detail pages are impacted too.

**Backend fix options (out of scope for this audit, required before FE8-E ships):**
- switch to `{ type: TABLE, tableName: ExecutionEntity }`, or
- resolve the project from the fetched execution row after param-id lookup.

### 1.2 List endpoint requires `projectId` query param

`GET /v1/executions` uses `ProjectResourceType.QUERY` (default key `projectId`).
A USER request without `?projectId=...` fails authorization.
The current frontend `useExecutionsQuery` sends only `{status, limit}` — **the existing Activity page cannot work against the live backend as written.**

### 1.3 POST body requires `projectId`

`POST /v1/executions` uses `ProjectResourceType.BODY`; handler reads
`request.projectId || request.body.projectId` (:16). The server ignores the
`x-project-id` header that `apiClient` sends (no reader exists anywhere in `packages/server/api/src`).

---

## 2. Execution Entity / Database Forensics

Files: `execution/execution-entity.ts`, migration `database/migration/postgres/1808000000000-AddExecutionTable.ts`.
Entity registered in `getEntities()` (`database-connection.ts:60`). Table `execution`.

| Field | Type | Nullable | Notes |
|---|---|---|---|
| `id` | varchar(21) apId | NO | PK |
| `created` | timestamptz | NO | default now() — **the only reliable timestamp** |
| `updated` | timestamptz | NO | default now() |
| `projectId` | apId | NO | FK -> project, CASCADE |
| `platformId` | apId | NO | FK -> platform, CASCADE |
| `userId` | apId | nullable | FK -> user, SET NULL |
| `status` | string enum | NO | `CREATED / RUNNING / COMPLETED / FAILED / CANCELLED` (`core/shared/src/lib/execution/execution.ts:4-10`) |
| `prompt` | text | NO | execution is **prompt-centric**, not tool-centric |
| `metadata` | json | NO | free-form; provenance lives here (§10) |
| `tokenUsage` | json `{promptTokens, completionTokens, totalTokens}` | YES | schema exists, always null in practice (§7) |
| `cost` | numeric | YES | same — always null in practice |
| `finishTime` | timestamptz | YES | only writer is dead code (§7) |

Indices: `projectId`, `platformId`, `status`, `created`.

### Fields the Execution model does NOT have

- **NO `startTime`** — duration can at best be approximated as `finishTime - created`
  (and `finishTime` is never set today). Server-side duration is **not available**.
- **NO input/output fields** on the execution itself
- **NO error field**
- **NO stdout/stderr fields**
- **NO integration/action/tool identity columns** (only via `metadata` convention or the `tool_call` table)
- **NO connection identity column**
- **NO parent/child execution links, retry links, or cancellation reason column**

Status transition machine (`executionUtils.isValidExecutionStatusTransition`):
`CREATED -> RUNNING|FAILED|CANCELLED`, `RUNNING -> COMPLETED|FAILED|CANCELLED`, terminal states locked.

---

## 3. Execution List Contract

`GET /v1/executions` — handler `execution.controller.ts:75-81`, service `execution.service.ts:144-169`.

### Request query (schema: `dto/execution-requests.ts:25-30`)

| Param | Schema reality | Service behavior |
|---|---|---|
| `projectId` | optional string | **required by security layer** (QUERY resource); used as THE tenant filter |
| `status` | optional enum | applied as SQL `WHERE status = :status`. Valid values: `CREATED/RUNNING/COMPLETED/FAILED/CANCELLED` |
| `limit` | coerce int, min 1, max 100, default 10 | `.take(limit)` |
| `cursor` | optional string | **ACCEPTED BUT COMPLETELY IGNORED by the service** |

Not supported: search, date ranges, integration/tool filters, environment filter, sort selection.

### Response

```jsonc
// controller response schema :165-170
{
  "data": [ /* Execution[] */ ],
  "next": null,       // z.string().nullable() — service ALWAYS returns null
  "previous": null    // ALWAYS null
}
```

Service always returns `{ data, next: null, previous: null }` (`execution.service.ts:164-168`).

**Pagination verdict:** single-page, most recent N (default 10, max 100), ordered `created DESC`.
There is **no cursor mechanism** despite the query schema accepting `cursor`. The frontend must not render pagination controls that imply server paging.

---

## 4. Execution Detail Contract

`GET /v1/executions/:id` returns the raw entity row (service `getOne`, `execution.service.ts:52-70`),
or throws `ENTITY_NOT_FOUND` when missing.

Field-by-field honesty table for `/activity/:id`:

| Data point | Verdict | Source |
|---|---|---|
| execution id | AVAILABLE | `id` |
| status | AVAILABLE (but see §7: will be `CREATED`) | `status` |
| created time | AVAILABLE | `created` |
| updated time | AVAILABLE | `updated` |
| finished time | AVAILABLE FIELD, ALWAYS NULL in practice | `finishTime` |
| duration | NOT AVAILABLE (no startTime; finishTime never set) | derived only client-side |
| prompt | AVAILABLE | `prompt` |
| metadata (provenance) | AVAILABLE | `metadata` record |
| token usage | AVAILABLE FIELD, ALWAYS NULL in practice | `tokenUsage` |
| cost | AVAILABLE FIELD, ALWAYS NULL in practice | `cost` |
| project / platform / user ids | AVAILABLE | `projectId`, `platformId`, `userId?` |
| integration name | METADATA ONLY (TriggerBinding runs put `pieceName` in metadata; nothing standardizes it) | `metadata.pieceName?` |
| action/tool | NOT AVAILABLE on execution | — |
| connection | NOT AVAILABLE on execution | — |
| input | NOT AVAILABLE (only per tool-call, and none are written) | — |
| output | NOT AVAILABLE on execution | — |
| error | NOT AVAILABLE on execution | — |
| request/response capture | NOT AVAILABLE | — |
| stdout | NOT AVAILABLE anywhere in the executions contract | — |
| stderr | NOT AVAILABLE | — |

`AVAILABLE BUT SENSITIVE`: nothing on this endpoint. Sensitive surface lives in ToolCall.input/output (§5, §8).

---

## 5. Tool Calls Contract

Files: `execution/tool-call/tool-call-entity.ts`, `tool-call.service.ts`; migration `1809000000000-AddToolCallTable.ts`.
Table `tool_call`, FK -> execution (CASCADE), FK -> project (CASCADE). Entity registered in `getEntities()`.

Schema (`core/shared/src/lib/execution/tool-call.ts:34-48`):

```ts
{
  id, created, updated,
  executionId, projectId,
  pieceName, pieceVersion, actionName,
  connectionId?: string | null,
  input: Record<string, unknown>,        // raw, stored as json
  output?: unknown | null,
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED',
  error?: { message, code?, stack? } | null,
  latencyMs?: number | null,
  finished?: string | null,
}
```

Endpoint: `GET /v1/executions/:id/tool-calls` returns `ToolCall[]` ordered by
`created ASC` (`tool-call.service.ts:218-229`). No pagination.

### THE CRITICAL CAVEAT

`toolCallService.createPending / markRunning / markSucceeded / markFailed` have **ZERO callers**
in the entire repo (repo-wide grep; only the controller's `listForExecution` is referenced).
Nothing — not `/v1/execute`, not HeadlessRuntime, not trigger/scheduled flows — ever writes a tool_call row.

**Verdict:** the endpoint exists and is well-typed, but it will always return `[]` today.
A tool-call timeline UI would render an empty state for every execution. The schema is a
forward-looking contract only.

---

## 6. SSE / Event Stream Forensics

Endpoint: `GET /v1/executions/:id/events` (`execution.controller.ts:49-73`).
Implementation: `execution-event.service.ts`.

### Wire contract (exact)

- Hand-rolled headers: `200`, `Content-Type: text/event-stream`,
  `Cache-Control: no-cache`, `Connection: keep-alive` (:56-60). Fastify serialization bypassed via `reply.raw`.
- Frames are **data-only**: `'data: ' + JSON.stringify(event) + '\n\n'` (:62-64):
  - NO `event:` name lines, NO `id:` lines, NO `retry:` hint
  - NO heartbeat/comment keep-alive frames
  - NO explicit terminal "done" sentinel event
- Each frame body is an `ExecutionEvent`:

```ts
// core/shared/src/lib/execution/execution-event.ts:87-94
{
  id: `${executionId}:${seq}`,   // monotonic per-execution sequence
  executionId: string,
  type: ExecutionEventType,
  timestamp: string,
  payload: Record<string, unknown>,
}
```

Event types and payloads (same file :3-85) with emission reality:

| type | payload shape | actually emitted today? |
|---|---|---|
| `ExecutionStarted` | `{executionId, prompt, timestamp}` | YES — on every create |
| `PlannerStarted` | `{executionId, model, timestamp}` | NEVER (no emitter anywhere) |
| `ToolStarted` | `{executionId, toolCallId, pieceName, actionName, input}` | NEVER (writer dead) |
| `ToolFinished` | `{executionId, toolCallId, output, latencyMs}` | NEVER |
| `ToolFailed` | `{executionId, toolCallId, error{message,code?,stack?}}` | NEVER |
| `ExecutionCompleted` | `{executionId, output?, totalTokens?, durationMs?}` | UNREACHABLE (dead `updateStatus`) |
| `ExecutionFailed` | `{executionId, error{message}}` | UNREACHABLE |
| `ExecutionCancelled` | `{executionId, reason?}` | UNREACHABLE |

### Authentication

Global `authenticationMiddleware` (`core/security/v2/authn/authentication-middleware.ts:16`)
authenticates from **`request.headers['authorization']` only** — JWT Bearer. No cookie fallback.
Therefore:

> **Native browser `EventSource` CANNOT be used** — it cannot set an `Authorization` header.
> Frontend must use a fetch-based streaming reader (`fetch()` + `ReadableStream` + SSE frame parser).

### Connection lifecycle

- On connect: handler verifies the execution exists first (404 path), then registers a
  process-local listener + Redis pub/sub subscription on channel `execution:{id}:events`
  (`execution-event.service.ts:83-109`).
- On client disconnect: `request.raw.on('close')` calls `unsubscribe({executionId})`
  (:111-123), which **deletes ALL memory listeners for that execution** and tears down the
  pub/sub subscription. Two tabs watching the same execution break each other — the first to
  disconnect kills delivery for the second. Known multi-viewer defect; do not rely on concurrent viewers.
- NO replay/backfill on connect. History IS stored (Redis list `execution:{id}:events`,
  TTL 3600s, cap 1000 non-critical; seq key TTL 3600s; in-memory fallback) but never flushed to new subscribers.
- Cross-instance fan-out works via Redis pub/sub (`helper/pubsub.ts`).

### What events contain

Every event carries the full envelope including `executionId`. Tool events would carry
input/output payloads (sensitive surface, §8) but are never emitted today.
In practice a subscriber receives exactly one event: `ExecutionStarted`.

---

## 7. Execution Lifecycle Reality (dead code paths)

This is the single most important section for FE8 honesty.

**Who creates executions:**

| Creator | File | Status at creation |
|---|---|---|
| `POST /v1/executions` (external API callers) | `execution.controller.ts:14-33` | CREATED + emits `ExecutionStarted` |
| TriggerBinding run | `trigger-binding.service.ts:155-166` | CREATED + `ExecutionStarted` |
| ScheduledTask dispatch (`cron` or "run now") | `scheduled-task.service.ts:115-128` | CREATED + `ExecutionStarted` |
| **`POST /v1/execute` / HeadlessRuntime / MCP** | — | **creates NOTHING** |

**What never happens:**

- `executionService.updateStatus` (`execution.service.ts:72-142`) has **zero callers**.
  No backend path ever moves an execution out of `CREATED`.
  The `ExecutionCompleted/Failed/Cancelled` emitters inside it are unreachable dead code.
- Every row in `/activity` will display status `CREATED` forever.
  A RUNNING/COMPLETED/FAILED badge would be fabricated UI.
- `tokenUsage`, `cost`, `finishTime` are schema fields whose only writer is dead code → always null.

**Implication for the UX:** the list/detail must render `CREATED` honestly
(e.g. label it "Recorded" / "Accepted"), and any live-transition behavior is future-proofing
for when the runtime is wired to `updateStatus` — build the SSE viewer generically, but do not
fake progress.

---

## 8. Security / Data Exposure Audit

### What is protected

- Connection secrets are encrypted at rest (`helper/encryption.ts` via
  `encryptUtils.encryptObject`, `app-connection-service.ts:61`) and only decrypted inside
  runtime paths (`decryptAndRefresh`). They do NOT appear in execution/tool-call/event payloads
  because those payloads are never produced with decrypted values today.
- Auth for all execution routes: JWT Bearer in `Authorization` header; RBAC permission
  `READ_RUN`/`WRITE_RUN`; tenant isolation via projectId extraction (§1).

### What is NOT redacted

- `sanitizeObjectForPostgresql` (`core/utils/src/lib/object-utils.ts:50-62`) strips NUL bytes and
  unpaired surrogates ONLY. It is a storage-safety function, **not a secret redactor**.
- If tool-calls were written, `tool_call.input` / `output` would be stored raw. Any secret a tool
  accepts as a plain input prop (e.g. an api-key field) would be persisted in plaintext and
  returned verbatim by `GET .../tool-calls`. Same applies to `ToolStarted.input` /
  `ToolFinished.output` SSE payloads. There is no field-level sensitivity model
  (no SECRET_TEXT marking) on the execution side.
- Execution `metadata` and `prompt` are stored and returned raw; callers may embed anything.

### Frontend obligations

- Never place tokens/projectIds in URLs beyond what the API requires (`projectId` query param is required by the security layer — that one is unavoidable, it is an id not a secret).
- Treat `ToolCall.input/output`, event payloads, `prompt`, and `metadata` as untrusted content:
  render as text/JSON, never as HTML.
- Do not persist execution payloads to localStorage; keep them in query-cache/memory.
- No client-side "redaction engine" should be invented — there is no backend sensitivity data
  model to drive it. Honest approach: display raw values behind explicit expanders, with copy
  affordances, and document that the backend performs no secret filtering.

---

## 9. FE5 Execution Seam Audit

FE5's `LocalExecutionRecord` (`components/actions/execution-panel.tsx:8-19`) remains **necessary**:

1. **`POST /v1/execute` returns no execution id.** Controller (`execute.controller.ts:51-63`)
   returns `runtime.execute(...)`; HeadlessRuntime (`packages/runtime/src/index.ts:15-63`)
   returns `result.response` — the RAW piece action output. Response schema is `z.unknown()`
   (:85). No record is created anywhere along this path; nothing correlates with
   `GET /v1/executions`. Navigation from a tool-run result to `/activity/:id` is **impossible today**.
2. **The frontend's `ExecuteResponse {success, output?, error?, standardOutput?}` does NOT match
   the backend.** Engine truth: `piece-helper.ts executeTool` (:204-282) returns
   `{status:'OK', response: output}` where output is whatever `pieceAction.run()` returned;
   failures throw and surface as HTTP-level errors from the controller
   (`result.status !== 'OK'` -> thrown Error -> 500). Therefore:
   - `response.success` (`pages/actions/detail.tsx:204`) reads a field that does not exist ->
     every successful run without a literal `success` property in its output is classified FAILED by FE5.
   - `standardOutput` is never present in the current contract.
3. Client-measured `durationMs` in LocalExecutionRecord is the only duration that exists.

**Verdict: FE5 INTEGRATION SEAM = FAIL.** Activity cannot show direct-tool executions;
FE5 result classification is misaligned with the real response contract (separate bug worth filing).

---

## 10. Provenance Matrix

Executions are distinguishable ONLY through the untyped `metadata` record, by convention:

| Execution Type | Backend Identifier | Frontend Can Distinguish? |
|---|---|---|
| Direct `POST /v1/executions` | none — metadata is caller-supplied, no marker | **NO** (only inferable as "no marker", not reliable) |
| TriggerBinding | `metadata.triggerBindingId`, `metadata.pieceName`, `metadata.triggerName` (`trigger-binding.service.ts:157-162`) | **YES** (convention, untyped) |
| Scheduled Task | `metadata.scheduledTaskId` (+`cronExpression`,`timezone`) (`scheduled-task.service.ts:118-122`) | **YES** (convention, untyped) |
| MCP | none — MCP never creates executions | **NOT AVAILABLE** |
| Direct tool run `/v1/execute` | none — creates no execution at all | N/A |

Badges for Trigger/Scheduled are honest IF derived from those exact metadata keys with graceful
fallback ("Manual/API" or unknown). MCP provenance must NOT be fabricated.

---

## 11. Existing Frontend Audit

All under `packages/web/src`. Router already registers `/activity` and `/activity/:id` (`router.tsx:119-125`).

### Exists and REUSABLE

| Asset | Location | Notes |
|---|---|---|
| Activity list page | `pages/activity/index.tsx` | status tabs, skeleton/empty states; broken in practice (no `projectId` param — §1.2); no URL-state, no pagination |
| Execution detail page | `pages/activity/detail.tsx` | status/created/id cards + tool-call table; will always show "No tool calls recorded"; no SSE |
| API client | `lib/api/client.ts` | Bearer auth, ApiClientError, params serialization; sends `x-project-id` header which the server IGNORES |
| Types | `lib/api/types.ts:247-283` | `Execution`, `ToolCall`, `ExecutionStatus` — mostly accurate vs backend (minor: `metadata`/`platformId` optionality) |
| Query hooks | `lib/query/hooks.ts:327-332` | `useExecutionsQuery`; invalidations on trigger/schedule mutations |
| JsonViewer | `components/actions/json-viewer.tsx` | copy + collapse; reuse everywhere |
| ExecutionPanel + LocalExecutionRecord | `components/actions/execution-panel.tsx` | FE5 seam (§9) |
| UI primitives | `components/ui/*` | badge, card, empty/error/loading states, skeleton, tabs, tooltip, dialog, button… |
| Test infra | root vitest 3.2.6; examples: `pages/mcp/index.test.tsx`, `pages/automations/schedules.test.tsx` | pattern to follow |

### Does NOT exist (FE8 gaps)

- Any SSE/streaming utility (zero matches for EventSource / event-stream in `web/src`)
- Execution event types (`ExecutionEvent`) in `types.ts`
- URL-synced filters, pagination UI
- Timeline component
- Redaction/safe-render helpers

---

## 12. FRONTEND_API_CONTRACT.md Conflict Register

Verified conflicts in `FRONTEND_API_CONTRACT.md` §7 (lines 290-318) vs backend code:

1. **Status filter values** — doc claims `'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'`.
   Real enum: `CREATED | RUNNING | COMPLETED | FAILED | CANCELLED` (there is no SUCCEEDED).
   Filtering by SUCCEEDED would be a validation error.
2. **Cursor** — doc implies cursor paging works; service ignores it and always returns `next:null`.
3. **ToolCall.status** — doc claims only `'SUCCEEDED' | 'FAILED'`; real enum adds PENDING/RUNNING.
4. **ToolCall.error** — doc claims `string`; real shape is `{message, code?, stack?} | null`.
5. **ToolCall.latencyMs** — doc shows required number; real field is nullable/optional.
6. **SSE section** — lists all 8 event types as flowing; today only `ExecutionStarted` is emitted.
   Doc omits Authorization-header requirement and data-only framing.
7. **Doc omits** the required `projectId` query/body param behavior entirely (§1).

---

## Appendix A — Verification commands used

Repo-wide greps for writers/readers of execution + tool-call services, route registrations,
security middleware chain, migrations, entity registration, frontend inventory.
No servers were started; no code was modified.

## Appendix B — Key source files

- `packages/server/api/src/app/execution/execution.controller.ts`
- `packages/server/api/src/app/execution/execution.service.ts`
- `packages/server/api/src/app/execution/execution-entity.ts`
- `packages/server/api/src/app/execution/execution-event.service.ts`
- `packages/server/api/src/app/execution/tool-call/tool-call.{entity,service}.ts`
- `packages/server/api/src/app/execution/{trigger-binding,scheduled-task}/*.ts`
- `packages/server/api/src/app/execute/execute.controller.ts`
- `packages/runtime/src/index.ts`
- `packages/server/engine/src/lib/helper/piece-helper.ts` (executeTool)
- `packages/core/shared/src/lib/execution/*.ts`
- `packages/server/api/src/app/core/security/v2/authz/*.ts`

