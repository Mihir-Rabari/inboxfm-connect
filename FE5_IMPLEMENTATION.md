  > ## ⚠ SUPERSEDED IN PART — 2026-08-27
> The `POST /v1/execute` contract described below is wrong. The endpoint returns the **raw piece action
> output**, not `{ success, output, error, standardOutput }`, and it requires `projectId` in the request
> body (it returned 403 for every USER principal until that field was added). Connection calls also
> targeted `/v1/app-connections`, which does not exist — the real path is `/v1/connections`.
> All three were repaired; see `FE8_IMPLEMENTATION.md` §1 and §3. Everything else below still holds.
> This text is preserved as a forensic record.

# FE5 Implementation Report: Actions Discovery & Interactive Tool Execution
  
  **Phase:** FE5 — Action Discovery + Connection Selection + Schema-Driven Input + Real Execution + Result Inspection + Code Generation
  **Package:** `@inboxfm-connect/web` (`packages/web`)
  **API Contract:** `FRONTEND_API_CONTRACT.md`, verified against the live backend (`packages/server/api`, `packages/runtime`)
  **Depends on:** FE1 ✅ · FE2 ✅ · FE3 ✅ · FE4 ✅
  
  ---
  
  ## 1. Executive Summary`
  
  FE5 delivers the flagship developer experience of InboxFM Connect:
  
  ```
  Integration → Action → Connection → Input → Execute → Result → Copy Code
  ```
  
  A developer opens `/actions`, browses or semantically searches **every available action** (one request — no N+1), lands on `/actions/:pieceName/:actionName`, sees the action's real metadata, picks a connection from the FE4 data layer, fills a form generated entirely from the action's `props` schema (including server-driven dynamic dropdowns), executes through the real `POST /v1/execute`, inspects output / stdout / errors in separate regions, reviews the sanitized request that was sent, and copies runnable cURL / JavaScript / TypeScript / Python / JSON snippets.
  
  Before implementation, the backend was inspected directly:
  
  - `execute.controller.ts` + `runtime/index.ts` — request body is exactly `{ integration, tool, connectionId, input }`; the runtime **always resolves the piece version through the selected connection**, so even `requireAuth:false` actions require an account selection; responses are `EngineResponse<unknown>` (`success/output/error/standardOutput`) and transport failures surface as HTTP errors.
  - `piece-metadata-controller.ts` — `POST /v1/integrations/options` exists with exactly the contract's payload; knowledge-search supports `objectKind:'action'` with `limit ≤ 50`, `mode: 'semantic'|'keyword'`.
  - `framework/property/*` — the full serialized property-type set (`SHORT_TEXT…COLOR`) drives what the renderer supports. No semantics were invented.
  
  No legacy Flow / FlowVersion / FlowAction / Canvas / Node / Edge / Waitpoint concept exists anywhere in the new code.
  
  ---
  
  ## 2. Phase Coverage
  
  | # | Phase | Delivered where |
  | :--- | :--- | :--- |
  | 1 | Action discovery | `pages/actions/index.tsx` |
  | 2 | Action detail | `pages/actions/detail.tsx` |
  | 3 | Action metadata renderer | `components/actions/property-field.tsx` |
  | 4 | Dynamic options | `components/actions/dynamic-options-select.tsx` + `POST /v1/integrations/options` |
  | 5 | Connection picker | `components/actions/connection-picker.tsx` (FE4 `useConnectionsQuery`) |
  | 6 | Execution form | runner page left column |
  | 7 | Execution API | `useExecuteTool()` mutation hook |
  | 8 | Execution experience | `components/actions/execution-panel.tsx` (UI-local step list only) |
  | 9 | Result viewer | `components/actions/json-viewer.tsx` |
  | 10 | Standard output | separate stdout region in execution panel |
  | 11 | Request preview | `components/actions/request-preview.tsx` + sanitizer |
  | 12 | Code generation | `lib/utils/code-generation.ts` + `components/actions/code-snippets.tsx` |
  | 13–14 | Form state & serialization | React Hook Form store + `lib/utils/action-form.ts` |
  | 15 | Persistence UX | memory-only; zero storage/persistence of inputs |
  | 16–17 | Search & filtering | debounced knowledge-search + URL-synced filters |
  | 18 | URL state | `?q=&integration=&category=&connection=required` |
  | 19 | Execution history hook | local `LocalExecutionRecord` (no fabricated ids) ready for FE8 wiring |
  | 20 | Error handling | `lib/utils/execution-errors.ts` (FE4 pattern) |
  | 21 | Accessibility | labels, descriptions, roles, live regions, focus rings |
  | 22 | Responsive design | desktop two-column, stacks below `lg` |
  | 23 | Loading experience | metadata/form skeleton; input preserved while executing |
  
  ---
  
  ## 3. Action Discovery — `/actions`
  
  Two modes behind one URL, chosen by the presence of a debounced search term (≥2 chars):
  
  - **Browse mode (default).** Renders the integrations catalog from the already-established `useIntegrations()` query — **one request total**. Cards show logo, name, description, action count, auth badge, and deep-link into the integration's Actions tab (`/integrations/:name?tab=actions`). A test pins that no per-integration detail fetches occur.
  - **Search mode.** Typing routes through `POST /v1/knowledge-search/query` with `{ query, limit: 50, objectKind: 'action' }` — the backend's real semantic/keyword discovery endpoint. Flat result rows display *Integration / actionName*, display name, one-line description, and connection requirement (joined with catalog metadata for logos/categories), each linking straight to the runner.
  
  Filters (URL-persisted): **integration** select, **category** pills (reuses FE3 `CategoryFilter`; applied to the catalog query param in browse mode and client-side on joined results in search mode), and **connection required** checkbox (uses `requiresConnection` from search results / `auth.required` from summaries). No filters exist for metadata the backend doesn't provide. Empty states and retryable error states are distinct for both modes.
  
  ## 4. Action Detail — Runner
  
  Header card: logo, `displayName / name`, description, auth requirement badge (`AuthBadge` from real `auth.type`, or explicit "No auth required" when `requireAuth === false`).
  
  Unknown piece (404) and unknown action are distinct error states with navigation back to discovery / the integration's actions tab.
  
  ## 5. Dynamic Property Renderer
  
  `PropertyField` is fully schema-driven — zero per-integration code. Supported types, mapped from the framework's serialized property model:
  
  | Type | Control | Serialization |
  | :--- | :--- | :--- |
  | `SHORT_TEXT` | text input | string |
  | `LONG_TEXT` | textarea | string |
  | `SECRET_TEXT` | password input (`autoComplete=off`) | string (sent, never persisted/rendered) |
  | `NUMBER` | number input | **number** (`"42"` never sent for NUMBER) |
  | `CHECKBOX` | checkbox | **boolean** |
  | `STATIC_DROPDOWN` | select over metadata options (JSON-safe values incl. objects) | raw option value |
  | `STATIC_MULTI_SELECT_DROPDOWN` | checkbox list | array of raw values |
  | `DROPDOWN` / `MULTI_SELECT_DROPDOWN` | dynamic options select | raw option value(s) |
  | `DATE_TIME` | datetime-local input | ISO string |
  | `JSON` / `OBJECT` | monospace JSON textarea | parsed object (invalid JSON blocked by validation) |
  | `ARRAY` | repeatable rows generated from `properties` sub-schema | array of row objects (empty rows dropped) |
  | `COLOR` | color picker + hex field | string |
  | `MARKDOWN` | read-only note (renders its description) | excluded |
  | `FILE`/`DYNAMIC`/`CUSTOM`/… | honest unsupported notice | excluded |
  
  Required markers, descriptions, dynamic/JSON type chips, inline `role="alert"` errors, and disabled states during execution are uniform across types.
  
  ## 6. Dynamic Options
  
  `DynamicOptionsSelect` implements the contract exactly:
  
  - Fires `POST /v1/integrations/options` with `{ pieceName, pieceVersion, actionOrTriggerName, propertyName, input, searchValue? }` **only for fields whose metadata declares a dynamic type**.
  - The query key is `[pieceName, pieceVersion, actionOrTriggerName, propertyName, debouncedSearch]`; the `input` payload is read through a ref at request time. Result: **typing in unrelated fields does not trigger refetches**, while every actual request carries current dependent values.
  - Debounced search (300 ms), loading skeleton, backend `disabled` state (select disabled + placeholder shown), error region with **Retry**, and selected-value preservation (a synthetic option renders the current value even if it leaves the result window).
  
  Known trade-off: piece metadata does not declare which props a dropdown depends on, so dependency-triggered refresh cannot be derived; requests carry fresh input at call time and Retry is available.
  
  ## 7. Connection Picker
  
  Reuses FE4's `useConnectionsQuery({ pieceName })` — same `['connections', params]` key, no second data layer. Auto-selects the first ACTIVE account; errored connections are grouped and non-selectable; empty state shows "Connect {Integration}" deep-linking to `/connections/new?pieceName=…`. Because the verified runtime resolves the piece through the connection, executions always route through the selection (an explanatory hint appears for no-auth actions). Invalidation after creating a connection remains FE4's hook-level behavior, so returning from `/connections/new` reflects instantly.
  
  ## 8. Execute Mutation & Experience
  
  `useExecuteTool()` wraps `POST /v1/execute` with the exact contract body. The page tracks a local `LocalExecutionRecord { status, request, response?, durationMs, transportError? }` exposing idle/pending/success/failed. While pending, the form stays intact and shows UI-local progress steps (connection ✓ / validated ✓ / executing ⟳) — no fabricated backend events. Client-measured duration is displayed on completion. No execution id is invented (the response has none); the record keeps result/request/status shaped for FE8 to swap in `GET /v1/executions`.
  
  ## 9. Result Viewer
  
  `JsonViewer`: pretty-printed JSON, primitive/string/null handling, copy button, collapse beyond ~40 lines with expand ("Show full output"), gradient mask, safe `<pre>` rendering — **never** `dangerouslySetInnerHTML`. Output, standard output, and errors render as three separate regions; success-with-no-output states explicitly.
  
  ## 10. Request Preview & Security
  
  `RequestPreview` is collapsed by default and renders the **sanitized** request via `sanitizeExecuteRequest`:
  
  - `connectionId` → `$CONNECTION_ID` placeholder;
  - `SECRET_TEXT` prop values → `$SECRET`;
  - ARRAY rows sanitized against their sub-property schemas;
  - any nested plain-object key matching `(secret|password|token|api_key|client_secret)` redacted defensively.
  
  Pinned by tests: secrets and connection ids appear in **no URL**, not in the preview, and not in any code snippet. Form values live exclusively in RHF memory — nothing touches localStorage/sessionStorage/Zustand persistence.
  
  ## 11. Code Generation
  
  `generateCode(language, request)` produces cURL (with `$BASE_URL`, `Authorization: Bearer $API_KEY`, `x-project-id: $PROJECT_ID`), JavaScript and TypeScript (fetch-based — **no fictional SDK package exists in this repo**, so none was invented; TS includes a typed `ExecuteResponse` interface), Python (`requests` with `json.loads` payload), and raw JSON — all generated from the sanitized actual request. Per-language copy buttons with toasts.
  
  ## 12. Error Handling
  
  `executionErrors.describe` mirrors FE4's normalization: status-mapped safe copy (400/401/403/404/422/500/504/network), server messages passed through only because the API never echoes credential material. Tool-level failures (`success:false`) render under "Tool error"; transport failures under "Request failed" — separately from output, with **Run Again** re-submitting current form values.
  
  ## 13. Accessibility
  
  Every control: programmatic label (`htmlFor`/aria-label) + description via `aria-describedby`; validation errors use `role="alert"`; the result panel is `role="status" aria-live="polite"` so assistive tech announces completion; pending state announced via progress list; all interactive elements keyboard-reachable with visible focus rings; selects native (free keyboard support); execution disables inputs without destroying them.
  
  ## 14. Tests — 27 new (92 total pass)
  
  | Suite | Covers |
  | :--- | :--- |
  | `pages/actions/index.test.tsx` (6) | browse without N+1, knowledge-search round-trip + runner links, integration filter, URL-state restore, empty state, retryable search failure |
  | `pages/actions/detail.test.tsx` (7) | metadata/auth/picker/schema render, unknown action, exact execute payload with typed values (number/boolean/dropdown-object), required-field blocking, tool-error separation, transport-failure normalization + Run Again, secret/connection leakage (URLs, preview, snippets) |
  | `components/actions/dynamic-options-select.test.tsx` (5) | exact options payload, debounce coalescing, label→raw-value mapping, disabled state, error+retry recovery |
  | `lib/utils/code-generation.test.ts` (9) | cURL/JS/TS/Python/JSON content, placeholder enforcement, sanitization of SECRET_TEXT + nested array secrets |
  
  Test infra: `api-stub.ts` now records method+parsed bodies (`requests`) alongside URLs.
  
  ## 15. Verification
  
  | Gate | Command | Result |
  | :--- | :--- | :--- |
  | Typecheck | `tsc --noEmit -p packages/web` | **PASS** (0 errors) |
  | Lint | `turbo run lint --filter=@inboxfm-connect/web` | **PASS** (0 errors/warnings) |
  | Build | `turbo run build --filter=@inboxfm-connect/web` | **PASS** |
  | Tests | `vitest run` (packages/web) | **PASS** — 17 files, **92/92** |
  
  Repo-wide `npm run lint-dev` currently executes **zero tasks**: its turbo filter uses single quotes (`--filter='!@inboxfm-connect/piece-*'`), which the Windows shell passes literally, yielding "Packages in scope:" (empty). This is a pre-existing repo-wide lint-script configuration problem, unrelated to FE5 code; direct web lint passes cleanly.
  
  ## 16. Known Limitations
  
  1. **Dependency-triggered option refresh** — piece metadata doesn't declare which props feed a dynamic dropdown, so refresh happens on mount/search/retry with fresh input at request time (documented above).
  2. **FILE / DYNAMIC / CUSTOM action props** render an explanatory notice instead of an input (consistent with FE4's auth-prop stance).
  3. **Execution duration is client-measured**; the execute contract exposes no server latency or execution id.
  4. **Scoped piece names** (`@scope/name`) work via encodeURIComponent single-segment params; they were exercised through the shared helpers but not pinned by a dedicated test.
  5. **Browse mode links into FE3's Actions tab** rather than duplicating an inline listing — intentional reuse of existing surfaces.
  
  ## 17. Files Changed
  
  ### Created
  | File | Purpose |
  | :--- | :--- |
  | `src/components/actions/dynamic-options-select.tsx` | Contract-exact dynamic dropdown w/ debounce/states |
  | `src/components/actions/property-field.tsx` | Schema-driven property renderer |
  | `src/components/actions/connection-picker.tsx` | FE4-hook-backed picker |
  | `src/components/actions/json-viewer.tsx` | Safe pretty/copy/collapse viewer |
  | `src/components/actions/execution-panel.tsx` | Progress/result/stdout/error regions |
  | `src/components/actions/request-preview.tsx` | Collapsible sanitized request |
  | `src/components/actions/code-snippets.tsx` | Multi-language snippet tabs + copy |
  | `src/lib/utils/action-form.ts` | Defaults/validation/type-correct serialization |
  | `src/lib/utils/code-generation.ts` | Snippet generator + request sanitizer |
  | `src/lib/utils/execution-errors.ts` | Status-aware safe error mapping |
  | tests × 4 | Catalog, runner, dynamic options, code-gen |
  
  ### Modified
  | File | Change |
  | :--- | :--- |
  | `src/pages/actions/index.tsx` | Placeholder → real discovery (dual-mode, URL state, filters) |
  | `src/pages/actions/detail.tsx` | Raw-JSON editor → flagship runner |
  | `src/lib/api/types.ts` | Knowledge-search/options DTOs, `DropdownState`, `ArraySubProperty` |
  | `src/lib/query/hooks.ts` | `useExecuteTool`, `useIntegrationOptions`, `useKnowledgeSearch` |
  | `src/test/api-stub.ts` | Captures request bodies/methods |
  | `src/test/fixtures/integrations.ts` | Rich multi-type action fixture (`runnerMetadata`) |
  
  Routes were already registered (`router.tsx`); no router changes needed.
  
  ## 18. FE6 Handoff
  
  FE6 (Trigger Bindings + Scheduled Tasks) can proceed independently:
  
  - **Connection selection pattern**: `ConnectionPicker` + auto-select-first-ACTIVE logic is directly reusable for trigger binding `connectionId` fields.
  - **Metadata access**: `useIntegration(name)` provides `triggers` records mirroring the actions shape; `PropertyField`/`DynamicOptionsSelect` accept `actionOrTriggerName`, so trigger prop forms need no new components.
  - **Options endpoint**: `useIntegrationOptions` mutation is available for trigger dropdowns (same payload contract).
  - **Executions**: FE8 will replace the local record with `GET /v1/executions*`; `LocalExecutionRecord` marks the seam.
  - Shared keys remain stable: `['connections', params]`, `['integration', name]`, plus new `['knowledge-search']` and `['action-options']` families.
