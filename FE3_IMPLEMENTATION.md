# FE3 Implementation Report: Integrations Catalog & Integration Detail

**Phase:** FE3 — Integrations Catalog & Integration Detail
**Package:** `@inboxfm-connect/web` (`packages/web`)
**API Contract:** `FRONTEND_API_CONTRACT.md` (verified against `packages/server/api`)
**Depends on:** FE1 (Audit & API contract) ✅, FE2 (Application Shell) ✅

---

## 1. Executive Summary

FE3 turns the placeholder integration screens into the first major product surface of the developer console: a searchable, filterable, sortable catalog of integrations backed by `GET /v1/integrations`, and a full detail page (`/integrations/:name`) with Overview / Actions / Triggers / Connections tabs driven entirely by real piece metadata. The Connect CTA routes to `/connections/new?pieceName=...`, a reserved placeholder for the FE4 connection flow. Action cards route cleanly to `/actions/:pieceName/:actionName` for FE5.

No legacy Flow/Canvas concepts were introduced. Connection state is never faked in the catalog; it is fetched per-integration on the detail page's Connections tab via a single filtered query.

---

## 2. Files Created

### Components (`src/components/integrations/`)
| File | Purpose |
| :--- | :--- |
| `integration-card.tsx` | Memoized catalog card (logo, name, version, auth indicator, description, category chips, action/trigger counts, View Integration link) + card-shaped skeleton |
| `integration-grid.tsx` | Responsive grid of cards + grid skeleton (1 / sm:2 / lg:3 columns) |
| `integration-search.tsx` | Controlled search input with leading icon and clear button |
| `category-filter.tsx` | Category pills ("All" + API-provided categories), `aria-pressed` toggles, pill skeleton |
| `auth-badge.tsx` | Auth type badge (compact tooltip variant + full label variant), `requiresConnection()` helper; maps OAUTH2 → "OAuth 2.0", SECRET_TEXT → "Secret / API Key", BASIC_AUTH, CUSTOM_AUTH, NO_AUTH |
| `integration-header.tsx` | Detail page header: breadcrumbs, logo, display name, description, version/category/auth badges, Connect CTA |
| `integration-tabs.tsx` | URL-synced accessible tabs (Overview / Actions / Triggers / Connections) with counts |
| `action-card.tsx` | Memoized semantic `<Link>` card navigating to `/actions/:pieceName/:actionName`; shows auth requirement + input count |
| `action-list.tsx` | Grid list of ActionCards |
| `trigger-card.tsx` | Trigger info card with Polling/Webhook type badge, connection requirement, input count (non-navigational by design — binding flow is FE6) |
| `trigger-list.tsx` | Grid list of TriggerCards |
| `connection-summary.tsx` | Connections tab content: filtered query by `pieceName`, loading rows, error retry, empty-state Connect CTA, connected-account list |

### Pages
| File | Purpose |
| :--- | :--- |
| `src/pages/connections/new.tsx` | **FE4 placeholder** at `/connections/new?pieceName=...`. Reads `pieceName`, loads integration metadata, shows what the future flow will cover, back/browse navigation. Clearly marked as a reserved entry point — no fake OAuth UI |

### Lib
| File | Purpose |
| :--- | :--- |
| `src/lib/hooks/use-debounced-value.ts` | Generic debounce hook (300 ms used for search) |
| `src/lib/utils/format.ts` | `formatUtils.titleFromEnum()` for enum labels (`DEVELOPER_TOOLS` → "Developer Tools") |

### Tests & Test Infra
| File | Purpose |
| :--- | :--- |
| `src/test/api-stub.ts` | Reusable `global.fetch` stub router (route matching + call recording) |
| `src/test/fixtures/integrations.ts` | Piece summaries/metadata/connection fixtures |
| `src/pages/integrations/index.test.tsx` | Catalog suite (6 tests) |
| `src/pages/integrations/detail.test.tsx` | Detail suite (7 tests) |
| `src/pages/integrations/navigation.test.tsx` | Navigation suite (4 tests) |

---

## 3. Files Modified

| File | Change |
| :--- | :--- |
| `src/lib/api/types.ts` | Added `IntegrationsSortBy`, `IntegrationsOrderBy`, `IntegrationsListParams`, `ConnectionsListParams`; added optional `categories?: string[]` to `PieceMetadata` (present in backend `PieceMetadataModel`) |
| `src/lib/query/hooks.ts` | Renamed to contract names `useIntegrations`, `useIntegrationCategories`, `useIntegration`; extended `useConnectionsQuery(params?)` with filters; added `keepPreviousData` for stable grids while typing |
| `src/lib/api/client.ts` | Widened `RequestOptions.params` to `Record<string, unknown>` (arrays still serialize as repeated query params) |
| `src/router.tsx` | Registered lazy `/connections/new` route |
| `src/test/test-utils.tsx` | Added `createTestQueryClient()` helper (retry disabled) |
| Hook rename call sites: `pages/actions/index.tsx`, `pages/actions/detail.tsx`, `pages/triggers/index.tsx`, `pages/dashboard/index.tsx`, `pages/mcp/index.tsx` | Mechanical rename to new hook names |
| `src/pages/integrations/index.tsx` | Full rebuild (catalog) |
| `src/pages/integrations/detail.tsx` | Full rebuild (detail) |

---

## 4. API Endpoints Consumed

| Endpoint | Used by | Notes |
| :--- | :--- | :--- |
| `GET /v1/integrations` | Catalog | Params: `searchQuery`, `categories` (repeated), `sortBy=NAME\|POPULARITY`, `orderBy=ASC\|DESC`. Only backend-supported values exposed |
| `GET /v1/integrations/categories` | Catalog filter pills | Cached with `staleTime: Infinity` (static enum) |
| `GET /v1/integrations/:name` | Detail page, `/connections/new` | Scoped names (`@scope/name`) handled via single-segment encoding; server resolves both `:name` and `:scope/:name` shapes |
| `GET /v1/app-connections?pieceName=...` | Detail → Connections tab | One filtered request per tab open — no N+1 across the catalog |

`POST /v1/integrations/options` is intentionally not used yet; it belongs to FE5's property/dropdown runtime.

---

## 5. Routes Added

| Route | Component | Status |
| :--- | :--- | :--- |
| `/integrations` | `IntegrationsPage` | Rebuilt |
| `/integrations/:name` | `IntegrationDetailPage` | Rebuilt; active tab deep-linkable via `?tab=overview\|actions\|triggers\|connections` |
| `/connections/new` | `NewConnectionPage` | **New placeholder** for FE4; accepts `?pieceName=` |

Existing routes reused: `/actions/:pieceName/:actionName` (FE5 runner entry).

---

## 6. Components Created

See §2. Design follows the FE2 system: brand purple `#8142E3` via `--primary`, Inter `text-sm` base, compact spacing, `rounded-xl` cards with 1px borders and minimal shadow (`shadow-xs`), Lucide icons, no gradients/animations beyond skeleton pulse and hover transitions.

---

## 7. Query Hooks Created

| Hook | Key | Behavior |
| :--- | :--- | :--- |
| `useIntegrations(params?)` | `['integrations', params]` | `keepPreviousData` avoids skeleton flash between keystrokes |
| `useIntegrationCategories()` | `['integration-categories']` | Infinite stale time |
| `useIntegration(name?)` | `['integration', name]` | Enabled when name present; global retry policy skips 404 → instant "not found" |
| `useConnectionsQuery(params?)` | `['connections', params]` | Now accepts `{ pieceName, status, displayName, cursor, limit }`; existing callers unaffected |

---

## 8. Search / Filter Behavior

- **Search** is debounced (300 ms), trimmed, and executed server-side via `searchQuery`. A clear button resets instantly.
- **Category filtering** is server-side via repeated `categories=` params; pills are generated from the real categories endpoint (never hard-coded).
- **Sorting**: `Name`/`Popularity` + `Ascending`/`Descending` native selects (keyboard-accessible), mapped to `sortBy`/`orderBy`.
- **Action search** inside the detail page is local-only over already-loaded metadata (no network request; verified by test).
- The catalog deliberately shows a neutral `[ View Integration ]` CTA — no per-piece connection lookups (would be 400+ requests). Connection status lives on the detail page only.

---

## 9. Loading / Error / Empty States

| Surface | Loading | Error | Empty |
| :--- | :--- | :--- | :--- |
| Catalog grid | Card-shaped skeletons ×9 | "Unable to load integrations." + Retry | "No integrations found" + suggestion chips (GitHub/Gmail/Slack) + Clear Filters |
| Category pills | Pill skeletons | Silent (auxiliary data) | Hidden if API returns none |
| Result count | Skeleton line, then `aria-live` count | — | — |
| Detail header/tabs/lists | Full-page composition skeleton | "Integration not found" (404-aware) or generic error + Retry + Back to Integrations | — |
| Actions tab | — | — | "No actions available." / "No actions match your search." + clear |
| Triggers tab | — | — | "No triggers available." |
| Connections tab | Row skeletons | ErrorState with retry | "No {name} connections yet." + Connect CTA |
| `/connections/new` | Logo/title skeletons | — | "No integration selected" guidance |

The literal text "Loading…" is never shown as the sole loading experience.

---

## 10. Accessibility Work

- Semantic links (`<a>`) for all navigation targets — cards are never clickable divs; triggers intentionally render as non-clickable info cards until FE6.
- Radix Tabs provide proper `role=tablist/tab/tabpanel`, arrow-key navigation, `aria-selected`.
- Category pills use `aria-pressed`; groups labelled via `role="group"` + `aria-label`.
- Native `<select>`s with visually-hidden labels for sort controls.
- Search inputs have `aria-label`s and clear buttons are labelled.
- Result counter is `aria-live="polite"`.
- Images carry alt text (`{name} logo`); decorative logos in connection rows use empty alt.
- Visible focus rings preserved from FE2 primitives plus explicit `focus-visible:ring-2` on custom interactive elements (pills, chips, links).
- Breadcrumbs use `<nav aria-label="Breadcrumb">`.

---

## 11–14. Verification Results

```text
Tests:       PASSED — 41/41 across 10 files (Vitest 3.2.6, jsdom)
Typecheck:   PASSED — tsc --noEmit, zero errors
Build:       PASSED — Vite production bundle built in ~12.7s (dist/packages/web)
Lint (@inboxfm-connect/web): PASSED — eslint 0 errors, 0 warnings
             (also verified via `npx turbo run lint --filter=@inboxfm-connect/web`: 6 tasks successful)
```

Repo-wide `npm run lint-dev`: executes **0 packages** ("No tasks were executed") because the `--filter='!@inboxfm-connect/piece-*'` quoting does not resolve under Windows PowerShell. This is a pre-existing repo tooling issue unrelated to FE3; per Phase 13 the `@inboxfm-connect/web` package itself was verified directly and passes.

### Tests Added (17)

**Catalog (`index.test.tsx`)**
- integrations load from backend (cards, counts, categories, view links, request URLs)
- debounced search hits the API (`searchQuery=slack`) and renders server-filtered results
- category pill filtering hits the API (`categories=COMMUNICATION`)
- sorting exposes only backend-supported values and sends `sortBy=POPULARITY&orderBy=DESC`
- empty search shows suggestions + Clear Filters
- error state renders with working Retry (recovers without remount)

**Detail (`detail.test.tsx`)**
- integration loads; header renders version/categories/OAuth badge; Connect href verified
- every action renders with mono name, description, input counts, auth indicators
- local action search filters without additional network requests (call count asserted)
- triggers render with Polling/Webhook badges
- connections tab issues `app-connections?pieceName=github` and renders accounts/status
- unknown integration → "Integration not found" + Back link
- active tab persists in URL (`?tab=triggers`) with `aria-selected` verified

**Navigation (`navigation.test.tsx`)**
- catalog card → `/integrations/github`
- action click → `/actions/github/createIssue`
- Connect click → `/connections/new?pieceName=github`
- browser-back from the connect placeholder restores the detail page

---

## 13bis. Known Limitations

1. **Connections count on the tab label** shows no number (`null` passed) — showing it would require fetching connections even before the tab opens; deferred to avoid surprise requests.
2. **Trigger-level auth** is derived from the piece-level `auth` schema since the contract's trigger shape has no `requireAuth` field; nothing is invented.
3. **Popularity sort** relies on backend ordering semantics; the frontend only forwards the parameter.
4. **Scoped piece names** (`@scope/name`) are supported through single-segment percent-encoded URLs (matching Fastify's decode-after-route behavior); covered by the same code path but not exercised with a scoped fixture.
5. Repo-wide `lint-dev` runs zero packages on Windows (pre-existing; see above).

---

## 14bis. FE4 Handoff Notes

- **Entry point:** `/connections/new?pieceName=<name>` (lazy route registered in `src/router.tsx`; page at `src/pages/connections/new.tsx`). Replace the placeholder panel with the real flow; keep the breadcrumb + header structure.
- **Auth metadata:** `useIntegration(pieceName)` gives `auth.type` (`OAUTH2 | SECRET_TEXT | BASIC_AUTH | CUSTOM_AUTH | NO_AUTH`) and `auth.props`. `AuthBadge`/`requiresConnection` in `src/components/integrations/auth-badge.tsx` centralize labeling.
- **Contract endpoints awaiting FE4:** `POST /v1/app-connections`, `POST /v1/app-connections/oauth2/authorization-url` (OAuth redirect caveat documented in AGENTS.md for `--mode=cloud`).
- After creating a connection, invalidate `['connections']` query keys (`queryClient.invalidateQueries({ queryKey: ['connections'] })`) so the detail page's Connections tab refreshes.
- The catalog stays connection-neutral by design; do not add per-card connection fetches.

**FE5 handoff:** action cards already route to `/actions/:pieceName/:actionName`; the runner page exists from FE2 and can consume `props` metadata plus `POST /v1/integrations/options` for dropdowns.

---

## Success Criteria Checklist

- [x] `/integrations` works against the real API
- [x] Real backend listing with search, category filters, sorting
- [x] Cards render real metadata (logo, counts, categories, auth indicator)
- [x] `/integrations/:name` works with Overview / Actions / Triggers / Connections
- [x] Actions and triggers render from actual metadata
- [x] Integration connections displayed via filtered query (no faking, no N+1)
- [x] Connect CTA routes to `/connections/new?pieceName=...` (FE4 placeholder created)
- [x] Action CTA routes to `/actions/:pieceName/:actionName`
- [x] Loading, error, and empty states everywhere (no bare "Loading…")
- [x] Accessibility baseline (semantic links, tabs, labels, focus, alt text)
- [x] Frontend tests pass (41/41), typecheck passes, lint passes, build passes
- [x] No legacy Flow/Canvas/XYFlow UI introduced
