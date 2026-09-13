# FE8 IMPLEMENTATION PLAN — Activity & Execution Observability

> Built strictly on `FE8_API_AUDIT.md` findings. Every UI element below traces to a verified
> backend contract; anything the backend cannot provide is explicitly excluded.
> Target routes: `/activity`, `/activity/:id`.

---

## 0. Ground Rules (from the audit)

1. All executions are `CREATED` forever (`updateStatus` has zero callers) — render that honestly.
2. List = single page, `created DESC`, limit 1-100 default 10, only `status` filter, **no cursor** — no pagination controls.
3. `GET /v1/executions` REQUIRES `?projectId=`; `POST /v1/executions` requires `projectId` in body; server ignores `x-project-id`.
4. BLOCKER for detail/SSE: backend PARAM-extraction bug on `:id` routes (AUDIT §1.1). FE8-E/FE8-G ship behind a feature flag or after the one-line backend fix lands.
5. Tool-calls endpoint always returns `[]` today — render honest empty state; keep component ready.
6. SSE: data-only frames, Bearer-header auth → fetch-based reader, NO EventSource. Only `ExecutionStarted` arrives in practice.
7. No cancellation/retry/delete endpoints — no such buttons.
8. Provenance badges ONLY from `metadata.triggerBindingId` / `metadata.scheduledTaskId`; never "MCP".
9. No duration/token/cost fabrication: show fields only when non-null; otherwise em-dash.

---

## FE8-A — API contract + types

**Files**
- Modify `packages/web/src/lib/api/types.ts`
  - Fix `ExecutionStatus` comment/values (already correct enum strings; add `ExecutionEventType`, `ExecutionEvent`, typed event payload unions per AUDIT §6)
  - Align `ToolCall` (status incl. PENDING/RUNNING; error object; latencyMs nullable)
  - Add `ExecutionsListResponse<T> = { data: T[]; next: string | null; previous: string | null }`
- Create `packages/web/src/lib/api/executions.ts`
  - `executionsApi = { list({projectId,status,limit}), getOne({projectId,id}), listToolCalls({projectId,id}), create(...optional) }`
  - Every call injects `projectId` from `apiClient.getProjectId()` (query param for GETs)
- Exported types/constants grouped at end of file (repo convention).

**Contract:** AUDIT §3, §4, §5, §6.
**Dependencies:** none.
**Acceptance:** types compile; unit test asserts request URL contains `projectId` and correct method.

## FE8-B — Query hooks

**Files**
- Modify `packages/web/src/lib/query/hooks.ts`
  - Rework `useExecutionsQuery({status?, limit?})`: include projectId; type response as `ExecutionsListResponse<Execution>`; `placeholderData: keepPreviousData`
  - Add `useExecutionQuery(id)` and `useExecutionToolCallsQuery(id)` with `meta: { showErrorDialog: true }` on the execution query (primary page data), silent-fail on tool-calls
  - Add invalidation wiring: trigger/schedule mutations invalidate `['executions']` (already partially present)

**Acceptance:** hooks return typed data; failure paths covered in tests.

## FE8-C — Activity list page (rebuild)

**Files**
- Rewrite `packages/web/src/pages/activity/index.tsx`
  - Columns: status badge (CREATED-honest label e.g. "Recorded"), prompt (truncate), provenance badge (from metadata keys only), created timestamp (relative + absolute tooltip), id (mono, copyable)
  - Row -> Link to `/activity/:id`
  - States: loading skeletons, EmptyState (distinct copy for "no executions" vs filtered-empty), ErrorState with retry
  - Duration column ONLY if a future field exists — omit entirely today (audit: NOT AVAILABLE)

**Backend:** `GET /v1/executions?projectId&status&limit`
**Dependencies:** FE8-A/B
**Acceptance:** renders live data against dev backend; empty/error states reachable in tests.

## FE8-D — Filters + URL state

**Files**
- Create `packages/web/src/pages/activity/use-activity-filters.ts`
- Modify `pages/activity/index.tsx`

**Scope (strictly supported filters):**
- `status` select: ALL | CREATED | RUNNING | COMPLETED | FAILED | CANCELLED (real enum)
- `limit` page-size select: 10/25/50/100
- Synced to URL search params (`?status=&limit=`); browser back/forward works
- NO date/integration/tool/search inputs (unsupported by API)

**Acceptance:** URL round-trip tests; filter changes refetch via query-key change.

## FE8-E — Execution detail page

**Files**
- Rewrite `packages/web/src/pages/activity/detail.tsx` (compose from new components)

**Layout (only AVAILABLE data):**
- Header: status badge, id (copy), back link, provenance badge if metadata markers exist
- Facts grid: created, updated, finishTime (em-dash when null), tokenUsage (section hidden when null), cost (hidden when null)
- Prompt card (full text)
- Metadata card: JsonViewer of `metadata` (this is where TriggerBinding/ScheduledTask context lives)
- Tool calls section: renders `listToolCalls` result; today always honest empty-state ("No tool calls have been recorded for this execution.")
- Timeline section: see FE8-G
- Explicitly ABSENT: input/output/error/stdout/request/response panels for the execution itself (not in contract)

**BLOCKER dependency:** backend fix for AUDIT §1.1 (or gate behind flag).
**Acceptance:** success / not-found / malformed-id paths tested.

## FE8-F — Shared JSON/log viewers

**Files**
- Promote/re-export `components/actions/json-viewer.tsx` usage into activity components
- Create `packages/web/src/components/activity/metadata-viewer.tsx` (thin wrapper: safe stringify, depth cap, size guard for huge metadata)
- Create `packages/web/src/components/activity/tool-call-card.tsx` (input/output/error panes via JsonViewer; latencyMs shown only when non-null)

**Rule:** render untrusted payloads as text only (never dangerouslySetInnerHTML).

## FE8-G — SSE live events viewer

**Files**
- Create `packages/web/src/lib/sse/fetch-event-source.ts` — fetch+ReadableStream SSE reader:
  - sets `Authorization: Bearer <token>` + `x-project-id` not needed here (id-route auth uses Authorization only)
  - parses `data:`-only frames (ignore comments/empty lines), yields ExecutionEvent objects
  - AbortController-based close; no auto-reconnect loop beyond optional single retry with backoff (server sends no `retry:` hint; reconnect semantics undefined server-side)
  - stops reading cleanly on terminal event types OR stream end
- Create `packages/web/src/lib/hooks/use-execution-events.ts`
  - enabled only while execution status is non-terminal-in-practice (`CREATED`) AND page focused; cleanup on unmount; no setState after unmount
  - exposes `{events, connected, error}`
- Create `packages/web/src/components/activity/event-timeline.tsx`
  - Renders RECEIVED events only (timestamp, type chip, payload JsonViewer expandable)
  - Honest empty state: "Live events will appear here while the execution runs."
  - Live indicator dot bound to connection state; error banner with manual Reconnect button

**Wire truth:** first frame received will be `ExecutionStarted`; nothing else arrives today. The component must not synthesize steps like "Connection resolved / Input validated".

## FE8-H — Security & redaction posture

**Files:** none new (behavioral rules) + `lib/utils/redact.test.ts` if a trivial helper is needed for logs.

- No client-side redaction engine (no backend sensitivity model to drive it — AUDIT §8)
- Tokens never in URLs (projectId only, as required by security layer)
- Payloads stay in react-query memory cache; never persisted to localStorage
- Copy buttons copy raw JSON (user-initiated, acceptable); document in code that backend performs no secret filtering of metadata/prompt

## FE8-I — Accessibility & responsive UX

- Status conveyed by text + icon (not color alone); badges have visible labels
- Timeline as semantic list (`ol/li`) with `aria-live="polite"` region for appended events
- Focus-visible rings on all interactive rows/buttons; keyboard-navigable list
- Mobile: facts grid stacks; tables collapse to cards at `md` breakpoint (matches existing pages)

## FE8-J — Tests (see matrix §Test Plan)

**Files**
- `pages/activity/index.test.tsx`, `pages/activity/detail.test.tsx`
- `lib/sse/fetch-event-source.test.ts`, `lib/hooks/use-execution-events.test.ts`
- `lib/api/executions.test.ts`

## FE8-K — Verification

Commands (from repo root):

```bash
npx turbo run typecheck --filter=@inboxfm-connect/web
npx turbo run lint --filter=@inboxfm-connect/web   # or npm run lint-dev before done
npx turbo run test --filter=@inboxfm-connect/web
npx turbo run build --filter=@inboxfm-connect/web  # vite production build
```

Gate checklist: no Flow/FlowVersion/FlowRun/Canvas/XYFlow imports; no legacy execution UI revived;
every network call matches AUDIT contracts; grep gates in CI script optional.

---

## Test Matrix

### Activity list
| Case | Expectation |
|---|---|
| successful load | rows render, sorted as returned |
| status filter | query key changes; URL updated; refetch |
| limit change | refetch with new limit |
| empty (no data) | EmptyState "no executions" |
| empty (filtered) | EmptyState variant "no matches" |
| backend failure | ErrorState, no crash |
| retry | refetch succeeds |
| URL state restore | deep link with ?status=FAILED preselects filter |

### Execution detail
| Case | Expectation |
|---|---|
| success | header + prompt + metadata render |
| failed-execution shape (future) | terminal badge renders when status present |
| unknown id | ENTITY_NOT_FOUND error state |
| missing optional fields | finishTime/tokenUsage/cost show em-dash or hide |
| malformed metadata | MetadataViewer degrades gracefully (string fallback) |
| tool-calls empty | honest empty message |

### SSE
| Case | Expectation |
|---|---|
| connect | headers include Authorization; reader opens |
| ExecutionStarted frame | parsed, timeline appends |
| unknown/large frame | parser tolerant, no throw |
| completion event (synthetic test) | stream closes, indicator turns idle |
| server disconnect | error banner + manual reconnect |
| unmount mid-stream | abort() called; no post-unmount setState (asserted in test) |
| auth failure (401) | surfaced as error, no retry storm |

### Security/regression
| Case | Expectation |
|---|---|
| URLs contain no tokens | asserted |
| payloads not persisted | localStorage untouched by FE8 code |
| FE2-FE7 suites | all existing web tests remain green |

---

## Sequencing & Dependencies

```
FE8-A -> FE8-B -> FE8-C/D (shippable immediately against live backend)
                -> FE8-E/F/G (gated on backend PARAM fix, AUDIT §1.1)
FE8-H/I woven throughout; FE8-J alongside each phase; FE8-K final gate
```

Recommended order: A, B, C, D, J(list), then escalate the §1.1 backend fix, then E, F, G, J(detail/sse), K.
