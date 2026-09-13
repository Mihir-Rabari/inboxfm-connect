> ## ⚠ SUPERSEDED IN PART — 2026-08-27
> Against the real backend, none of the FE6 read paths worked: every `/v1/trigger-bindings/:id*` and
> `/v1/scheduled-tasks/:id*` route rejected USER principals (`ProjectResourceType.PARAM` reading a
> `projectId` param the routes never expose), and the list/create calls omitted the `projectId` that
> `QUERY`/`BODY` authorization requires. Both were repaired; see `FE8_IMPLEMENTATION.md` §1 and §2.
> This text is preserved as a forensic record.

# FE6 — Implementation (Trigger Bindings & Scheduled Tasks)

FE6 adds the automation layer of the InboxFM Connect developer console: **event-driven
trigger bindings** and **time-driven scheduled tasks**. It completes the three execution
models:

```text
DIRECT      Developer → Action → Connection → POST /v1/execute → HeadlessRuntime   (FE5)
EVENT       External Event → Trigger Binding → Instruction → HeadlessRuntime        (FE6)
SCHEDULED   Cron → Scheduled Task → Instruction → HeadlessRuntime                   (FE6)
```

There is deliberately **no canvas, no flow builder, no nodes/edges, no FlowRun** anywhere in
this phase. Automation is configured through forms, schema-driven inputs, tables and direct
execution primitives.

---

## 1. Product architecture

| Route | Page | Purpose |
|---|---|---|
| `/triggers` | `pages/triggers/index.tsx` | Global trigger discovery catalog (capability browser) |
| `/automations/triggers` | `pages/automations/triggers.tsx` | Trigger bindings hub (table + lifecycle actions) |
| `/automations/triggers/new` | `pages/automations/triggers-new.tsx` | Create binding (prefillable via `?pieceName=&triggerName=`) |
| `/automations/triggers/:id` | `pages/automations/triggers-detail.tsx` | Binding detail + Test Trigger panel |
| `/automations/triggers/:id/edit` | `pages/automations/triggers-edit.tsx` | Edit binding (same form component) |
| `/automations/schedules` | `pages/automations/schedules.tsx` | Scheduled tasks hub (+ Run Now per row) |
| `/automations/schedules/new` | `pages/automations/schedules-new.tsx` | Create scheduled task |
| `/automations/schedules/:id` | `pages/automations/schedules-detail.tsx` | Task detail (enable/disable, Run Now) |
| `/automations/schedules/:id/edit` | `pages/automations/schedules-edit.tsx` | Edit scheduled task |

Navigation: sidebar gained a "Trigger Bindings" item (`components/layout/sidebar.tsx`);
the command palette already listed both hubs.

## 2. Backend contract audit

See [FE6_API_AUDIT.md](./FE6_API_AUDIT.md) for the full authoritative contract. Highlights:

- Lists return `SeekPage<T>` (`{ data, next, previous }`) — the previous frontend hooks that
  assumed bare arrays were fixed.
- Updates use **POST** (`POST /v1/trigger-bindings/:id`, `POST /v1/scheduled-tasks/:id`) per
  repo convention; enable/disable are dedicated endpoints for bindings only. Scheduled task
  status transitions go through update.
- `TriggerBinding` has **no name and no target-tool fields**: identity is
  `pieceName / triggerName`; behavior is driven by `promptTemplate`. `settings` holds the
  trigger's input values (consumed by the engine as trigger input — verified in
  `packages/server/engine/src/lib/helper/trigger-helper.ts::extractTriggerContext`), plus two
  backend-recognized scheduling keys: `settings.cronExpression` and
  `settings.renewCronExpression`.
- `ScheduledTask` has **no name/connection/target tool**: just `prompt`, `cronExpression`,
  `timezone`, `status`, `lastRunAt`, `nextRunAt`.
- `POST /v1/trigger-bindings/:id/run` returns **`Execution[]`** (one record per event item);
  it fails with a validation error if the binding is disabled.
  `POST /v1/scheduled-tasks/:id/run` returns a single `Execution`.
- Execution statuses are `CREATED | RUNNING | COMPLETED | FAILED | CANCELLED`. The web type
  previously claimed `SUCCEEDED`; this was corrected along with all comparisons in
  dashboard/activity pages.

## 3. Trigger discovery (`/triggers`)

- Left rail lists integrations with `triggers > 0` from a single `GET /v1/integrations`
  request (client-side search by display/internal name).
- Selecting an integration lazy-loads exactly one `GET /v1/integrations/:name` and renders its
  real triggers: displayName, internal name, type badge (**only `POLLING`/`WEBHOOK` from real
  metadata — nothing invented**), description and auth requirement (`AuthBadge`).
- Every trigger row has **Create Binding**, deep-linking to
  `/automations/triggers/new?pieceName=…&triggerName=…`.
- N+1 avoidance: metadata is fetched only for the selected integration (React Query caches it);
  the test suite pins "one metadata call per selected integration".

## 4. Trigger binding implementation

`components/automations/trigger-binding-form.tsx` powers both create and edit modes as a
numbered single-column developer form:

1. **Source Integration** — select from integrations exposing triggers.
2. **Trigger** — select from the chosen piece's real triggers.
3. **Connection** — reuses FE5's `ConnectionPicker` verbatim (empty state links to
   `/connections/new?pieceName=…`; errored connections are visible but not selectable).
   Optional when the piece needs no auth (`connectionId: null` is sent explicitly — the key is
   required by the create/update schemas).
4. **Trigger Configuration** — reuses FE5's `PropertyField`/`DynamicOptionsSelect` with
   `actionOrTriggerName = triggerName`; serialized via FE5's
   `initialValuesFromProps/serializeValues/validateActionValues`. In edit mode stored
   `binding.settings` prefill the fields.
5. **Execution Instruction** — free-text `promptTemplate` (raw text preserved; no invented
   templating syntax).
6. **Advanced Scheduling** — optional `cronExpression` / `renewCronExpression` settings keys
   (the exact keys recognized by `syncTriggerSchedule` in the backend service), each showing a
   live human-readable interpretation.
7. **Status** — Enabled/Disabled segmented control.

Submit payloads match the audited DTOs exactly (pinned by tests):

```ts
// create
{ pieceName, pieceVersion, triggerName, connectionId: string|null,
  promptTemplate, settings, status }
// update (partial per backend contract, connectionId always present)
{ pieceName, pieceVersion, triggerName, connectionId: string|null,
  promptTemplate, settings, propertySettings?, status }
```

## 5. Trigger binding lifecycle

- **Enable/Disable** — dedicated `POST …/:id/enable` / `POST …/:id/disable` hooks
  (`useEnableTriggerBinding` / `useDisableTriggerBinding`), available inline in the hub table
  and on the detail page. The backend performs ON_ENABLE/ON_DISABLE engine hooks + cron sync;
  the UI makes no additional claims.
- **Delete** — confirmation dialog ("This will stop future event-driven executions") then
  `DELETE /v1/trigger-bindings/:id`. Copy does *not* promise external subscription teardown
  because the backend only best-effort disables locally.
- **Query hygiene** — mutations invalidate `['trigger-bindings']` and
  `['trigger-binding', id]`; delete also removes the single-item cache entry. No page reloads.

## 6. Trigger test / simulation

Detail page hosts a **Test Trigger** panel with an explicit warning that executing invokes
real tools through the connected account. An optional JSON event payload is parsed client-side
(invalid JSON blocks submission) and sent as the body of `POST /v1/trigger-bindings/:id/run`.
The response (`Execution[]`) is rendered verbatim: id, status, created timestamp, linking to
`/activity/:id` for deeper inspection. Empty arrays render an explicit "no records" note.
**No execution ids or results are ever fabricated.**

## 7. Scheduled task implementation

`components/automations/scheduled-task-form.tsx`: instruction textarea → `ScheduleBuilder`
→ status control. Payloads are exactly `{ prompt, cronExpression, timezone?, status? }`
(create) / the partial update equivalent. The hub lists tasks with cron + timezone +
human-readable schedule, last run (rendered only when the backend provides it), Run Now, edit
and delete. Detail page shows all entity fields (nextRunAt renders only when non-null, since
the backend currently leaves it null).

## 8. Cron builder

`lib/utils/cron.ts` wraps two real libraries already present in the monorepo lockfile (now
declared dependencies of `@inboxfm-connect/web`):

- **cron-validator** (`isValidCron(expr, { seconds: false })`) — same validator family used by
  the engine (`trigger-helper.ts`) and scheduler (`node-cron`). No fake parser.
- **cronstrue** — human-readable interpretations (`0 8 * * *` → "At 8:00 AM").

`components/automations/schedule-builder.tsx` offers seven presets (every minute/5 minutes/
hour/day/weekday/week/month), a raw cron input (developers keep full control), a live
"`<expr>` → `<description>`" line, error messaging, and a summary strip showing
`Schedule … | Timezone …`. Presets never silently rewrite a custom expression — typing raw
cron simply marks the builder "Custom".

## 9. Timezone handling

`components/automations/timezone-select.tsx` is an accessible combobox over
`Intl.supportedValuesOf('timeZone')` (~400 zones): keyboard navigation, `role="combobox"`
+ `listbox`/`option` semantics, filtered searching, current-zone marker. Default value comes
from `Intl.DateTimeFormat().resolvedOptions().timeZone` (initial UI convenience only); the
chosen IANA zone is sent verbatim to the backend and displayed alongside the cron — the
expression itself is never converted.

## 10. Run Now

Row-level and detail-level **Run Now** calls `POST /v1/scheduled-tasks/:id/run` once, shows a
pending state scoped to that row, and surfaces the created `Execution` id via toast with an
"Inspect" action into Activity. It is labelled a *scheduled task execution*, never a workflow
run. Works regardless of status (backend imposes no ENABLED guard) — UI copy reflects what the
backend actually does.

## 11. Shared components

Under `src/components/automations/`:

- `automation-status-badge.tsx` — maps only the real `ENABLED`/`DISABLED` states (no
  RUNNING/PAUSED/FAILED inventions), distinct dot + text so color isn't the sole signal.
- `timezone-select.tsx` (component + `timezoneUtils`)
- `schedule-builder.tsx`
- `automation-delete-dialog.tsx` (kind-specific destructive copy)
- `trigger-binding-table.tsx` / `scheduled-task-table.tsx` — responsive tables
  (`overflow-x-auto` + min-width on small screens), semantic `<th scope>`, aria-labelled icon
  buttons, row links to detail pages.
- `trigger-binding-form.tsx` / `scheduled-task-form.tsx`

Reused unchanged from earlier phases: `PropertyField`, `DynamicOptionsSelect`,
`ConnectionPicker`, `PieceLogo`, `AuthBadge`, `JsonViewer`, `ConfirmDialog`,
`EmptyState`, `ErrorState`, `PageHeader`.

## 12. Query & API layers

- `lib/api/types.ts` — added `CreateTriggerBindingRequest`, `UpdateTriggerBindingRequest`,
  `CreateScheduledTaskRequest`, `UpdateScheduledTaskRequest`, `AutomationStatus`;
  corrected `Execution.status` to the shared enum and widened `ToolCall` to the real shape
  (`PENDING/RUNNING/SUCCEEDED/FAILED`, nullable latency/error).
- `lib/query/hooks.ts` — list hooks unwrap `SeekPage` via `select`; added
  `useTriggerBindingQuery`, `useCreateTriggerBinding`, `useUpdateTriggerBinding`,
  `useEnableTriggerBinding`, `useDisableTriggerBinding`, `useDeleteTriggerBinding`,
  `useRunTriggerBinding`, `useScheduledTaskQuery`, `useCreateScheduledTask`,
  `useUpdateScheduledTask`, `useDeleteScheduledTask`, `useRunScheduledTaskNow`. Stable keys:
  `['trigger-bindings']`, `['trigger-binding', id]`, `['scheduled-tasks']`,
  `['scheduled-task', id]`.

## 13. Error handling

Reuses `executionErrors.describe()` for 401/403/404/422/500/network normalization; mutation
failures surface as destructive toasts plus inline alert regions (`form-general-error`),
never leaking stack traces. List failures render `ErrorState` with retry; validation errors
are field-level with `aria-invalid`/`role="alert"` wiring.

## 14. Security

- No OAuth tokens/API keys/passwords exist on these entities; connection rows are referenced
  by id only (detail page resolves display names server-side data via one cached query).
- Prompts/instructions/payloads never appear in URLs, query strings or localStorage — ids are
  `encodeURIComponent`-escaped path segments only (asserted in tests via exact request URLs).
- The run endpoint accepts arbitrary event payloads but the frontend only sends what the user
  typed in the test box, and displays back only what the API returned.

## 15. Accessibility

Labeled inputs (`htmlFor`/`id`), `srOnly` labels where placeholders alone would be ambiguous,
`aria-pressed` segmented controls and preset chips, `role="alert"` validation messages,
`aria-live="polite"` result regions, focus-visible rings throughout, keyboard-complete
timezone combobox, dialogs inherit Radix focus trapping, status badges pair text with color.

## 16. Responsive design

Forms max out at `max-w-3xl` and stack naturally; tables scroll horizontally below their
min-width instead of squishing; header action groups wrap; the discovery page collapses its
two-pane layout to a single column on mobile.

## 17. Tests

32 new tests (all passing), following the repo's `stubApi`/mount patterns:

- `src/lib/utils/cron.test.ts` — validity, descriptions, interpretation, preset integrity.
- `src/pages/triggers/index.test.tsx` — real metadata rendering, N+1 pinning (one metadata
  request per selected piece), deep-link creation, search empty state.
- `src/pages/automations/triggers.test.tsx` — SeekPage listing, empty/error states, disable →
  enable endpoint exactness, delete-after-confirm with exact DELETE URL + cache invalidation.
- `src/pages/automations/triggers-create.test.tsx` — schema-driven property rendering, exact
  create body, required-field blocking, invalid-cron blocking, API-failure surfacing without
  navigation.
- `src/pages/automations/triggers-detail.test.tsx` — overview fidelity, run-test exact
  endpoint/body, response-only execution ids, failure handling, edit-mode prefill + exact
  partial update payload.
- `src/pages/automations/schedules.test.tsx` — hub listing/empty/error, preset + timezone
  combobox + exact create payload, invalid cron rejection, edit payload, Run Now endpoint,
  delete confirmation, detail status toggling via update.

Also fixed pre-existing type errors in `pages/actions/detail.test.tsx` (missing `StubResponse`
import, optional `renderRunner` argument) surfaced by the strict typecheck gate.

## 18. Verification results

| Gate | Command | Result |
|---|---|---|
| Typecheck | `tsc --noEmit -p packages/web` | ✅ PASS |
| Lint | `eslint src --ext .ts,.tsx` (web) | ✅ PASS (0 problems) |
| Build | `vite build` (web) | ✅ PASS |
| Tests | `vitest run` (web) | ✅ 124 passed / 124 (23 files) |

No backend changes were made, so backend suites were not re-run.

## 19. Known limitations

- `nextRunAt` is always `null` today (the backend never computes it); the UI hides it until
  populated. If the scheduler later fills it, no frontend change is needed beyond rendering.
- List endpoints return all project rows without cursor pagination; `SeekPage` shapes are
  kept end-to-end so cursors can be introduced without frontend churn.
- Trigger discovery loads metadata per selected integration (lazy, cached) rather than
  eagerly fetching every piece's metadata — a deliberate trade against N+1 requests.
- `POST /v1/trigger-bindings/:id/renew` exists but is intentionally not surfaced in the UI;
  renewal crons can be configured through Advanced Scheduling.
- The binding run endpoint is webhook-public on the backend; the console still calls it with
  normal session auth.

## 20. FE7 handoff

- MCP Hub should consume the same `useIntegrations`/`PieceMetadata` model and the
  `['executions']` activity keys established here; do not fork new API clients.
- `McpServerInfo` types and `/v1/mcp*` endpoints are documented in
  [FRONTEND_API_CONTRACT.md](./FRONTEND_API_CONTRACT.md) §6 and untouched by FE6.
- The automation layer is complete: direct (FE5) + event (FE6) + scheduled (FE6) execution all
  terminate at HeadlessRuntime. FE7 (MCP exposure of tools to Cursor/Claude Desktop) builds on
  the same primitives without any new execution model.
