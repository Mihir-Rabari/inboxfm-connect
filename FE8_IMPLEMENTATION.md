# FE8 IMPLEMENTATION — Activity & Execution Observability (complete)

> Status: **FE8-A … FE8-J complete.**
> Authoritative contract source: **backend source code**. `FE8_API_AUDIT.md` remains the forensic
> record of the original audit; where this document disagrees with it, the reason is stated and dated.
> Last updated: 2026-08-27.

| Phase | State |
|---|---|
| FE8-A API contract + types | Done |
| FE8-B Query hooks | Done |
| FE8-C Activity list | Done |
| FE8-D Filters + URL state | Done |
| FE8-E Execution detail | Done |
| FE8-F Tool call viewer | Done |
| FE8-G SSE event stream | Done |
| FE8-J Tests | Done |

The three phases previously blocked by the backend PARAM authorization defect are unblocked because
that defect was fixed (§2), not worked around.

---

## 1. Contract corrections discovered during this pass

The FE8 audit was correct about the execution PARAM defect. Four **additional** contract breaks were
found by exercising the real Fastify app + database, and all four are now repaired. Each one was
first reproduced by a failing test, then fixed, then re-run.

| # | Defect | Evidence | Repair |
|---|---|---|---|
| 1 | `GET /v1/executions/:id`, `/:id/tool-calls`, `/:id/events` rejected every USER principal — `ProjectResourceType.PARAM` reads `request.params.projectId`, but the routes expose `:id` | audit §1.1, reproduced as 403 | backend: switched to `ProjectResourceType.TABLE` on `ExecutionEntity` |
| 2 | Same defect on all `/v1/trigger-bindings/:id*` and `/v1/scheduled-tasks/:id*` routes | reproduced as 403 | backend: `TABLE` on `TriggerBindingEntity` / `ScheduledTaskEntity` |
| 3 | `POST /v1/execute` rejected every USER principal — route is `ProjectResourceType.BODY` but `ExecuteRequestBody` had no `projectId`, and authorization runs at `preHandler`, i.e. *after* zod strips unknown keys | reproduced as 403 (`accepts the target project from the request body`) | backend: `projectId: z.string().optional()` added to `ExecuteRequestBody`; frontend now sends it |
| 4 | Every frontend connection call targeted `/v1/app-connections`, which **does not exist** — the controller is registered at `/v1/connections` (`app-connection.module.ts`); `app-connections` is only an OpenAPI tag | reproduced as 404 | frontend: new `connectionsApi` pinned to `/v1/connections` |
| 5 | FE6 list/create calls omitted `projectId`, which `ProjectResourceType.QUERY`/`BODY` require | reproduced as 403 | frontend: new `automationsApi` injects `projectId` |
| 6 | `mcpServerModule` was commented out in `app.ts`, so the whole FE7 MCP contract 404'd | reproduced as 404 | backend: module registered (entities were already in `getEntities()`) |

Two latent backend bugs were fixed as part of making #2 testable:

- `trigger-binding.service.ts` and `scheduled-task.service.ts` resolved their TypeORM repository at
  **module scope**, binding it to whichever DataSource existed when `app.ts` was first imported. Both
  now use the lazy `repoFactory` pattern every other service uses. Without this, both services raise
  `EntityMetadataNotFoundError` whenever the connection is re-initialised.

---

## 2. Backend changes

### `packages/server/api/src/app/execution/execution.controller.ts`
`ExecutionProjectResource` (`TABLE` → `ExecutionEntity`) now guards `/:id`, `/:id/tool-calls` and
`/:id/events`. Project ownership is derived from the execution row, so it can never be asserted by the
client — no `x-project-id` header, no query parameter, no frontend state. A missing row yields 404
before authorization; a row owned by another project yields 403.

### `trigger-binding.controller.ts` / `scheduled-task.controller.ts`
Same treatment for every `/:id` route (get, update, delete, enable, disable, renew, run).
`POST /` and `GET /` keep `BODY`/`QUERY` — those routes legitimately name a target project, and
membership plus permission are still checked.

### `execute.controller.ts`
`projectId` declared on the request body. Comment records *why* (preHandler ordering vs. zod stripping)
so it is not "cleaned up" later.

### `app.ts`
`mcpServerModule` registered. Explicitly **not** restored: the `POST /mcp` protocol transport and the
MCP OAuth authorize/approve controllers — they were removed with the legacy runtime and do not exist.

### What was deliberately **not** built
No execution lifecycle was invented. `POST /v1/execute` still does not create an `Execution` row, still
returns raw action output, and `executionService.updateStatus` still has no callers. No tool-call writer
was added. No event emitters beyond the existing `ExecutionStarted` were added.

---

## 3. FE5 response-contract repair

The real contract is:

```
POST /v1/execute   { projectId, integration, tool, connectionId, input }
                → 2xx: the RAW piece action output   (response schema is z.unknown())
                → non-2xx: transport / execution-layer failure
```

There is no `{ success, output, error, standardOutput }` envelope. Changes:

- `ExecuteResponse` is now `unknown` with the contract documented on the type.
- `useExecuteTool` goes through `executeApi.run`, which injects `projectId`.
- Success is decided by **HTTP status**, never by `response.success`. A payload that happens to contain
  `success: false` renders as output.
- `standardOutput` removed everywhere, including from the generated code snippets.
- `LocalExecutionRecord` carries `output: unknown` + `hasOutput`, because `undefined` is a legal action
  result and cannot double as "no response yet".
- Duration is still shown but labelled, via `title`, as browser-measured — the backend reports none.
- Generated snippets no longer emit the ignored `x-project-id` header, no longer declare a fake response
  interface, and now check the HTTP status (`if (!response.ok)` / `raise_for_status()`).

Preserved unchanged: Run Again, request sanitization, secret handling, dynamic options, connection
selection, code generation surface.

---

## 4. FE8-E — Execution detail (`/activity/:id`)

`GET /v1/executions/:id` with **no** `projectId` parameter — the tenant comes from the row.

Rendered: id, status, source, created, last updated, prompt, project, requester, metadata.
Rendered **only when non-null**: `finishTime`, `tokenUsage`, `cost` (grouped in one conditional block).
Never rendered: duration, stdout/stderr, input/output of the execution, fake completion.

`CREATED` is labelled **"Recorded"**. Nothing in the runtime calls `updateStatus`, so every execution
stays `CREATED`; labelling it "Running" or "Pending" would assert progress the backend never reports.
`RUNNING`/`COMPLETED`/`FAILED`/`CANCELLED` labels are wired and will appear automatically if the
lifecycle is ever connected.

States: skeleton, 404 (no retry offered), 403/401 (project mismatch), generic error with retry, plus
breadcrumb/back navigation, copy-ID and refresh. Two-column on `lg`, stacked on mobile.

Provenance is inferred only from `metadata.triggerBindingId` / `metadata.scheduledTaskId`, else
Manual/API. **No MCP provenance** — MCP does not create execution rows.

---

## 5. FE8-F — Tool call viewer

`GET /v1/executions/:id/tool-calls`, rendered as an expandable timeline over the real `ToolCall` shape.
All four statuses (`PENDING`, `RUNNING`, `SUCCEEDED`, `FAILED`) are handled. `latencyMs`, `finished` and
`connectionId` render only when present.

Security: `input`, `output` and `error` are untrusted and pass through `JsonViewer`, which stringifies
into a `<pre>`. Nothing is redacted — the backend exposes no sensitivity model, and guessing at secret
field names would be theatre. Payloads live in the React Query cache with `gcTime: 0` and are never
written to `localStorage`/`sessionStorage`.

Empty state says *"No tool calls recorded. The API returned no tool call records for this execution."*
followed by the reason: nothing in the runtime writes them yet. It does **not** claim no tools ran.

---

## 6. FE8-G — SSE event stream

### Why not `EventSource`
`GET /v1/executions/:id/events` authenticates from `Authorization: Bearer <jwt>`, and native
`EventSource` cannot set request headers. The stream is therefore built on `fetch` +
`ReadableStream` + a hand-written frame parser. A test asserts `streamSse` contains no `EventSource`
reference, and the page test asserts a stubbed `window.EventSource` is never constructed.

### Framing actually implemented
The backend writes `data: <json>\n\n` and nothing else — no `event:`, `id:`, `retry:`, comments,
heartbeats or terminal sentinel. `SseFrameParser` therefore handles data-only frames, buffers across
arbitrary chunk boundaries, tolerates CRLF and a missing space after `data:`, joins multi-line `data`
fields, ignores frames with no `data` field, and can flush a trailing unterminated frame.

### Behaviour
- Connection state: `idle | connecting | open | closed | error`, surfaced as a badge.
- Malformed JSON in one frame is skipped; the stream keeps running.
- Event **type is rendered from the wire value**, so an event type the backend starts emitting appears
  with no frontend change. `ExecutionEventType` is intentionally an open union.
- A terminal event (`ExecutionCompleted` / `ExecutionFailed` / `ExecutionCancelled`) closes the stream
  and offers Reconnect. Today none of these are ever emitted.
- No fake progress, no synthetic "Executing…", no invented completion, no heartbeat.
- `AbortController` aborts on unmount; a late chunk can never touch an unmounted tree.

### Documented backend behaviour the UI must not hide
There is **no replay**. The server does not backfill events emitted before a subscriber connected, so an
execution recorded before the page opened legitimately shows an empty stream — and the empty state says
exactly that.

---

## 7. Activity list (unchanged behaviour, shared helpers)

`GET /v1/executions?projectId&status&limit` only. No cursor pagination, no date/search/integration/
environment filters, no sort selector — none exist server-side. `next`/`previous` are always `null`.
URL-backed filters, browser back/forward and copy-ID preserved. Status labels, provenance and timestamp
formatting moved to `lib/utils/execution-display.ts` and are now shared with the detail page.

---

## 8. Files

### Created
| File | Purpose |
|---|---|
| `packages/web/src/lib/api/sse.ts` | `SseFrameParser` + `streamSse` (fetch/ReadableStream, Bearer header) |
| `packages/web/src/lib/api/sse.test.ts` | 18 parser/stream tests incl. no-EventSource guard |
| `packages/web/src/lib/hooks/use-execution-event-stream.ts` | React binding: state, terminal handling, reconnect, abort |
| `packages/web/src/lib/api/execute.ts` | `/v1/execute` with projectId injection, raw-output contract |
| `packages/web/src/lib/api/connections.ts` | `/v1/connections` (the real path) with projectId injection |
| `packages/web/src/lib/api/connections.test.ts` | 6 path/projectId/secret-placement tests |
| `packages/web/src/lib/api/automations.ts` | trigger-binding / scheduled-task list+create with projectId |
| `packages/web/src/lib/api/automations.test.ts` | 6 projectId-propagation tests |
| `packages/web/src/lib/utils/execution-display.ts` | shared status/provenance/timestamp presentation |
| `packages/web/src/components/activity/tool-call-timeline.tsx` | FE8-F |
| `packages/web/src/components/activity/execution-event-stream.tsx` | FE8-G renderer |
| `packages/web/src/pages/activity/detail.test.tsx` | 20 detail/tool-call/SSE/security tests |
| `packages/web/src/test/sse-stub.ts` | per-request SSE stream factory for tests |
| `packages/server/api/test/integration/ce/execution/execution-authorization.test.ts` | 23 real-app authorization tests |
| `packages/server/api/test/integration/ce/execution/developer-console-smoke.test.ts` | 7 real-app endpoint smoke tests |

### Modified
| File | Change |
|---|---|
| `packages/server/api/src/app/execution/execution.controller.ts` | PARAM → TABLE on the three `/:id` routes |
| `packages/server/api/src/app/execution/trigger-binding/trigger-binding.controller.ts` | PARAM → TABLE on six `/:id` routes |
| `packages/server/api/src/app/execution/scheduled-task/scheduled-task.controller.ts` | PARAM → TABLE on four `/:id` routes |
| `packages/server/api/src/app/execution/trigger-binding/trigger-binding.service.ts` | module-scope repo → `repoFactory` |
| `packages/server/api/src/app/execution/scheduled-task/scheduled-task.service.ts` | module-scope repo → `repoFactory` |
| `packages/server/api/src/app/execute/execute.controller.ts` | `projectId` on the request body |
| `packages/server/api/src/app/app.ts` | register `mcpServerModule` |
| `packages/web/src/pages/activity/detail.tsx` | full implementation (was a stub) |
| `packages/web/src/pages/activity/index.tsx` | use shared display helpers; removed a redundant cast |
| `packages/web/src/lib/api/executions.ts` | added `get` + `listToolCalls` |
| `packages/web/src/lib/api/types.ts` | raw-output `ExecuteResponse`; open `ExecutionEventType`; `projectId` on request types |
| `packages/web/src/lib/query/hooks.ts` | execution detail/tool-call hooks; connections + automations routed through their API modules |
| `packages/web/src/components/actions/execution-panel.tsx` | raw-output rendering, no success envelope |
| `packages/web/src/pages/actions/detail.tsx` | HTTP-status success, projectId in preview |
| `packages/web/src/lib/utils/code-generation.ts` | honest snippets |
| `packages/web/src/test/api-stub.ts` | optional streaming responses |
| `packages/web/src/test/fixtures/executions.ts` | tool-call + event fixtures and routes |
| 9 test files | `/api/v1/app-connections` → `/api/v1/connections` |

---

## 9. Query keys

```
['executions', params, projectId]
['execution', id]
['execution-tool-calls', id]          // gcTime: 0
['connections', params, projectId]
['trigger-bindings', projectId]
['scheduled-tasks', projectId]
```

Event stream state is component state, not a query — it is a live subscription, not a cacheable read.
No second global state layer, no Redux, no optimistic state for lifecycle events the backend never emits.

---

## 10. Verification

| Gate | Result |
|---|---|
| `turbo run typecheck --filter=@inboxfm-connect/web` | pass |
| `turbo run lint --filter=@inboxfm-connect/web` | pass, 0 errors / 0 warnings |
| `turbo run build --filter=@inboxfm-connect/web` | pass |
| `vitest run` (web) | 31 files, 225 tests pass |
| `tsc -p tsconfig.app.json --noEmit` (server/api) | pass |
| `vitest run test/integration/ce/execution` (real app + PGLite + memory Redis) | 2 files, 30 tests pass |
| `vitest run test/unit/app/execution` | 4 files, 24 tests pass |
| `vitest run test/integration/cloud/core` (authorization v2) | 3 files pass |
| forbidden legacy scan (`FlowBuilder`, `FlowVersion`, `FlowRun`, `FlowAction`, `FlowTrigger`, `Canvas`, `XYFlow`, `react-flow`, `RouterNode`, `LoopNode`, `Waitpoint`) | 0 new occurrences |
| `new EventSource` in `packages/web/src` | 0 |

### Pre-existing failures (reproduced at `HEAD` with all changes stashed — not caused by this work)
- `test/unit`: 17 files fail to load. They import `src/app/chat/**`, `src/app/knowledge-base/**`,
  `src/app/workers/job-queue/**`, `src/app/workers/machine/**` — directories deleted by the
  headless-runtime migration. 14 further failures in `canary` / `chat-rpc-handlers` / `machine-service`.
- `test/integration/ce/tables`: 126 failures (the tables module is commented out in `app.ts`).
- `test/integration/ce/app-connection`: 42 failures.
- `test/integration/ce/mcp/mcp-tools.test.ts`: fails to load (imports the deleted `flows/flow/flow.service`).

Both `tables` and `app-connection` were run twice — once with changes, once with
`git stash push -- packages/server/api/src` — and produced byte-identical failure counts.

### Dynamically Verified via Automated Browser Click-Through
A live Fastify backend and Vite dev server were started against a real seeded tenant (`dev@ap.com`, platform `yM3YotgCYYZwTkVkYS20h`, project `aI8Kiljzb25GOgHm90NZu`, execution `m5CLE5gUQTOEY7ug44ZHa`). An automated Playwright test suite (`tools/scripts/gate-browser-verify.mjs`) traversed all 12 frontend application routes:

| Route | Label | HTTP Status | Heading / Title | Rendered | Console Errors | Network Failures |
|---|---|---|---|---|---|---|
| `/` | Dashboard | 200 | Welcome back, Developer | 1427 chars | 0 | 0 |
| `/integrations` | Integrations list | 200 | Integrations | 929 chars | 0 | 0 |
| `/integrations/%40...%2Fpiece-google-sheets` | Integration detail | 200 | Google Sheets | 656 chars | 0 | 0 |
| `/connections` | Connections | 200 | Connections | 492 chars | 0 | 0 |
| `/actions` | Actions catalog | 200 | Actions | 1041 chars | 0 | 0 |
| `/actions/%40...%2Fpiece-google-sheets/insert_row` | Action runner | 200 | Google Sheets / insert_row | 1579 chars | 0 | 0 |
| `/triggers` | Trigger catalog | 200 | Trigger Discovery | 1018 chars | 0 | 0 |
| `/automations/triggers` | Trigger bindings | 200 | Trigger Bindings | 583 chars | 0 | 0 |
| `/automations/schedules` | Scheduled tasks | 200 | Scheduled Tasks | 554 chars | 0 | 0 |
| `/mcp` | MCP hub | 200 | MCP | 5909 chars | 0 | 0 |
| `/activity` | Activity list | 200 | Activity | 1058 chars | 0 | 0 |
| `/activity/m5CLE5gUQTOEY7ug44ZHa` | Execution detail | 200 | Execution | 1418 chars | 0 | 0 |

**All 12 routes reported `navStatus: 200`, 0 console errors, and 0 failed network requests.**

### Release Gate Remediations Applied
1. **DOM Nesting Fixed**: Replaced `<p>` parent container with `<div>` at `packages/web/src/pages/integrations/index.tsx` (lines 135-144) to eliminate invalid `<p>/<div>` DOM nesting warning.
2. **Vite `/mcp` HTML Bypass Added**: Added `bypass: (req) => { if (req.headers.accept?.includes('text/html')) return '/index.html' }` to `packages/web/vite.config.ts`, ensuring direct browser navigation to `/mcp` serves the SPA instead of returning 405 Method Not Allowed from the Fastify API.
3. **Dynamic Options Guard**: In `packages/web/src/pages/actions/detail.tsx` and `dynamic-options-select.tsx`, dynamic property fields are disabled with `(actionRequiresAuth && !selectedConnectionId)`, preventing invalid remote options requests when no connection is selected.
4. **Sandbox SSRF & Property URL Propagation**: Fixed `create-sandbox-for-job.ts` to defend against nullish `SSRF_ALLOW_LIST`, and updated `user-interaction-watcher.ts` to properly pass `publicApiUrl`, `internalApiUrl`, and `engineToken` to the engine sandbox.

---

## 11. Known backend limitations (real, not frontend gaps)

1. **No execution lifecycle.** `executionService.updateStatus` has zero callers; every execution stays
   `CREATED`. Terminal statuses, `finishTime`, `tokenUsage` and `cost` are unreachable.
2. **No tool-call writers.** `toolCallService` write methods have zero callers, so
   `/:id/tool-calls` always returns `[]`.
3. **Only `ExecutionStarted` is emitted.** `PlannerStarted`, `ToolStarted`, `ToolFinished`,
   `ToolFailed` and all terminal events have no emitters.
4. **No SSE replay.** New subscribers receive nothing that was emitted before they connected.
5. **SSE unsubscribe is per-execution, not per-subscriber.** When one viewer disconnects, the server
   drops every in-memory listener for that execution, so two concurrent viewers interfere. Left as-is
   (out of scope) and recorded here.
6. **`POST /v1/execute` creates no `Execution` row** and returns no id, so a direct tool run cannot be
   linked to `/activity`. FE5 therefore keeps `LocalExecutionRecord` as a local-only UX seam.
7. **MCP creates no executions**, so MCP provenance is absent from Activity by design.
8. **No `POST /mcp` transport.** The MCP protocol endpoint and the MCP OAuth authorize/approve flow do
   not exist in this codebase; only the project MCP *configuration* endpoints are served.
9. **Cursor pagination is accepted but ignored.** `next`/`previous` are always `null`.
10. **`POST /v1/trigger-bindings/:id/run` is registered as a public route** and passes an undefined
    `projectId` into the service. Pre-existing, untouched, flagged for a follow-up security review.
