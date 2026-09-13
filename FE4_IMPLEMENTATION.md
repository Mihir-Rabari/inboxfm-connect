# FE4 Implementation Report: Connections, OAuth & Credential Management

**Phase:** FE4 — Connections Management + OAuth / Credential Creation
**Package:** `@inboxfm-connect/web` (`packages/web`)
**API Contract:** `FRONTEND_API_CONTRACT.md`, corrected against the live backend (`packages/server/api`)
**Depends on:** FE1 ✅ · FE2 ✅ · FE3 ✅

---

## 1. Executive Summary

FE4 delivers the second major product capability of the developer console: a complete credential lifecycle. A developer can browse an integration, press **Connect**, choose between OAuth 2.0 / Secret (API Key) / Basic Auth / schema-driven Custom Auth, authenticate with a real provider, land back on the integration with the new account listed — without ever seeing or storing a raw credential twice.

The frontend never invents backend behavior. Before implementation, the backend was inspected directly:

- `app-connection.controller.ts` — routes, security access, zod schemas
- `oauth2-util.buildAuthorizationUrl` — `clientId` is **required** (resolved through secret managers; plain strings pass through unchanged) and the response may carry a PKCE `codeVerifier`
- `app.ts GET /redirect` — the backend serves a handshake HTML page that does `window.opener.postMessage({ code }, '*')`; this is the backend-supported callback mechanism
- `upsert-app-connection-request.ts` — exact value schemas per connection type; upsert is keyed by `externalId`, so reconnecting = re-upserting with the same `externalId` updates in place
- `secret-text / basic-auth / custom-auth / oauth2` request shapes drive the forms exactly (BASIC_AUTH value is fixed `{ username, password }` — not derived from props; CUSTOM_AUTH value is `{ props }` from the piece's `auth.props` schema)

No legacy Flow/Canvas concepts were introduced. A connection is an account credential, nothing else.

---

## 2. Connection API Hooks (Phase 1)

All HTTP flows through the existing `apiClient` — zero scattered `fetch` calls in components.

| Hook | Key / Semantics | Behavior |
| :--- | :--- | :--- |
| `useConnectionsQuery(params?)` | `['connections', params]` | Existing; supports `pieceName`, `status`, `cursor`, `limit` |
| `useConnection(id?)` | `['connection', id]` | Single non-sensitive connection; enabled when `id` present |
| `useCreateConnection()` | mutation → `POST /v1/app-connections` | Invalidates `['connections']` on success |
| `useDeleteConnection()` | mutation → `DELETE /v1/app-connections/:id` | Invalidates `['connections']` + `['connection']` |
| `useCreateOAuthAuthorizationUrl()` | mutation → `POST /v1/app-connections/oauth2/authorization-url` | Returns `{ authorizationUrl, codeVerifier? }` |

Types added to `lib/api/types.ts`: `AppConnectionType`, `AppConnectionStatus`, `CreateConnectionRequest`, `CreateConnectionValue` (discriminated union mirroring the backend zod union), `OAuth2ConnectionValueInput`, `OAuth2AuthorizationUrlRequest/Response`, `PieceAuthMetadata` (`scope?`, `authorizationMethod?` now modeled — they exist in serialized piece metadata and are consumed server-side), and typed STATIC_DROPDOWN `options`.

---

## 3. Connections List (Phase 2) — `/connections`

Professional credential-manager table exactly per spec columns: **Integration · Connection name · Auth type · Status · Created · Actions**.

- Integration names/logos resolved via the integrations catalog query (single lookup map, memoized); falls back to raw `pieceName` + key icon when unknown.
- Status rendered exclusively from backend states: `ACTIVE → Connected` (success badge), `ERROR → Error` (destructive badge). No invented states.
- Actions per row: **Reconnect** (deep-links into `/connections/new` carrying `externalId` + `displayName`) and **Delete** (confirmation dialog).
- Rows link to `/connections/:id`.
- Loading skeleton, error state with retry, empty state ("Browse Integrations"), horizontal scroll wrapper for narrow viewports.
- Credential values are never rendered anywhere in the table (pinned by test).

---

## 4. Connection Detail (Phase 3) — `/connections/:id`

Non-sensitive metadata only: Connection name, Integration, Authentication (mapped label), Status badge, Created, Updated, External ID (mono font). Explicit note that credentials are stored encrypted and never displayed after creation.

Actions: **Reconnect** and **Delete** (dialog → `DELETE` → toast → navigate back to `/connections`). Handles 404 ("Connection not found") distinctly from network errors.

---

## 5. New Connection Flow (Phases 4–11) — `/connections/new?pieceName=…`

The FE3 placeholder is fully replaced. Page reads `pieceName` (+ optional `externalId` / `displayName` for reconnect), loads `GET /v1/integrations/:name`, and routes the UX by `auth.type`:

| Backend auth.type | UX | Create payload `value` (backend-verified shape) |
| :--- | :--- | :--- |
| `OAUTH2` | Client ID + Client Secret (+ dynamic `auth.props`) + scope chips → popup authorization | `{ type:'OAUTH2', client_id, client_secret, code, scope, redirect_url, code_challenge?, props?, authorization_method? }` |
| `SECRET_TEXT` | Password input for API key/token | `{ type:'SECRET_TEXT', secret_text }` |
| `BASIC_AUTH` | Username + password (backend schema is fixed — not hard-coded beyond what the backend defines) | `{ type:'BASIC_AUTH', username, password }` |
| `CUSTOM_AUTH` | Fully dynamic form generated from `auth.props` | `{ type:'CUSTOM_AUTH', props: { … } }` |
| `NO_AUTH` / none | Informational state: nothing to connect | — |
| other (e.g. `OIDC`) | Honest "unsupported authentication type" notice | — |

Missing `pieceName` keeps the friendly "pick an integration" state. Unknown `pieceName` → "Integration not found".

### Validation (Phase 10)

React Hook Form throughout (`Controller` + rules derived from the backend schema): required checks per field, number coercion, checkbox booleans. The backend remains authoritative — the frontend does not duplicate or diverge from its zod constraints. Field-level errors render inline with `role="alert"`; submit button enters pending state; server errors surface in an accessible error banner mapped through `connectionErrors.describe` (401 session expired, 403 forbidden, 404 not found, network failure, provider rejection pass-through).

### Creation & Post-Creation Flow (Phase 11)

On success every path: invalidates `['connections']` + `['integration', pieceName]`, clears secret inputs (`reset()`), success toast ("<name> connected"), then navigates to `/integrations/:name?tab=connections` — completing the core journey *Integration → Connect → Authenticate → Created → See Connected Account*.

---

## 6. OAuth Implementation (Phases 5–6, 14)

Follows the backend's actual mechanism end-to-end:

```
Continue → POST /v1/app-connections/oauth2/authorization-url
           { pieceName, pieceVersion, clientId, redirectUrl, props? }
         ← { authorizationUrl, codeVerifier? }
         → window.open(authorizationUrl)          // named popup
provider consent → backend GET /redirect?code=…
         → postMessage({ code }, '*') to opener   // origin+source verified
→ POST /v1/app-connections (type OAUTH2, value incl. code,
   code_challenge = codeVerifier for PKCE pieces, redirect_url)
→ invalidate → toast → integration connections tab
```

- **Permissions display**: derived from real metadata — `auth.scope` chips; explicit copy when none declared.
- **PKCE**: `codeVerifier` from the response is forwarded as `code_challenge` (matching the server's claim contract).
- **authorization_method**: passed through from piece metadata when present.
- **Denial/cancel**: popup closed without a code → clear message "closed before access was granted", no changes made, no fake success.
- **Popup blocked** → actionable error state.
- Message listener verifies `event.origin === window.location.origin` and `event.source === popup`.
- Listener + poller cleanup on settle and on unmount (StrictMode-safe).
- Dev parity: `/redirect` added to the Vite proxy so the backend handshake works locally exactly as in production.

**Reconnect (Phase 14)** re-runs this flow with the existing connection's `externalId`; because the backend upserts keyed by `externalId`, the credential updates in place — no duplicates. The UI states this explicitly. Non-OAuth reconnects open the same form prefilled with name only (secrets are write-only and unreadable).

---

## 7. Secret / Basic / Custom Auth (Phases 7–9)

- **SECRET_TEXT**: masked input (`type="password"`, `autoComplete="new-password"`), cleared after submit.
- **BASIC_AUTH**: username + password per the backend's fixed value schema.
- **CUSTOM_AUTH**: `AuthPropertyRenderer` generates the form from `auth.props` — supporting the property types the framework actually serializes: `SHORT_TEXT`, `LONG_TEXT`, `SECRET_TEXT`, `NUMBER`, `CHECKBOX`, `STATIC_DROPDOWN` (real option lists, JSON-safe value encoding). Unsupported types (FILE/OBJECT/JSON/DYNAMIC…) render an explanatory notice instead of a fake input. Nothing is GitHub-specific — it is generic over any piece schema.

---

## 8. Credential Safety (Phase 18)

Treated as write-only end-to-end; pinned by tests where feasible:

- ❌ localStorage / sessionStorage / Zustand persistence of credentials — never used
- ❌ secrets in URLs — verified in tests (recorded request paths contain no secret values; OAuth `redirect_url` is bare origin + `/redirect`)
- ❌ logging credentials — no logging of form values anywhere
- ❌ analytics exposure — no credential values leave the form component except inside the request body
- ❌ rendering after creation — inputs cleared via `reset()` immediately after success; list/detail pages show only non-sensitive fields returned by the API
- ❌ secrets in error boundaries/error messages — server errors are shown verbatim only if provided (the API never echoes secrets); local failures use fixed safe copy

---

## 9. Query Invalidation (Phase 16)

Single source of truth via hook-level invalidation plus the shared `useConnectionCreated(pieceName)` helper:

| Operation | Invalidates |
| :--- | :--- |
| Create / Reconnect | `['connections']` (prefix-covers `['connections', { pieceName }]`) + `['integration', pieceName]` |
| Delete | `['connections']` + `['connection']` |

Integration detail's Connections tab therefore reflects new/deleted accounts instantly without reload (covered by a dedicated test asserting content updates while the route stays identical).

---

## 10. Files Changed

### Created — lib
| File | Purpose |
| :--- | :--- |
| `src/lib/query/hooks.ts` *(extended)* | `useConnection`, `useCreateConnection`, `useDeleteConnection`, `useCreateOAuthAuthorizationUrl` |
| `src/lib/api/types.ts` *(extended)* | Connection DTOs, discriminated create-value union, `PieceAuthMetadata`, dropdown typing |
| `src/lib/hooks/use-connection-created.ts` | Shared post-create invalidation + toast + navigation |
| `src/lib/utils/connection-links.ts` | URL builders (new / reconnect / integration tab) |
| `src/lib/utils/connection-errors.ts` | Safe status-aware error mapping |
| `src/lib/utils/connection-ids.ts` | `externalId` minting for new connections |
| `src/lib/utils/connection-format.ts` | Auth-type → label mapping (shared by list/detail) |

### Created — components (`src/components/connections/`)
| File | Purpose |
| :--- | :--- |
| `auth-property-renderer.tsx` | Schema-driven field renderer + per-property validation helper |
| `connection-form-shell.tsx` | Shared accessible form card (error banner, pending submit) |
| `form-field.tsx` | Label/description/error-wrapped controlled text field |
| `oauth-connect.tsx` | Full OAuth UX + popup/postMessage orchestration |
| `secret-text-connect.tsx` | Secret/API-key flow |
| `basic-auth-connect.tsx` | Username/password flow |
| `custom-auth-connect.tsx` | Dynamic props flow |
| `connection-status-badge.tsx` | ACTIVE/ERROR → Connected/Error |
| `delete-connection-dialog.tsx` | Exact-spec confirmation copy |
| `piece-logo.tsx` | Logo with icon fallback |

### Created — pages / tests
| File | Purpose |
| :--- | :--- |
| `src/pages/connections/detail.tsx` | `/connections/:id` |
| `src/pages/connections/index.test.tsx` | List suite (6 tests) |
| `src/pages/connections/new.test.tsx` | Creation suite (12 tests incl. OAuth trio) |
| `src/pages/connections/detail.test.tsx` | Detail suite (4 tests) |

### Modified
| File | Change |
| :--- | :--- |
| `src/pages/connections/index.tsx` | Placeholder → real table with columns/actions/states |
| `src/pages/connections/new.tsx` | Placeholder → real creation flow orchestrator |
| `src/router.tsx` | Registered lazy `/connections/:id` |
| `vite.config.ts` | Dev proxy `/redirect` → backend (OAuth handshake parity) |
| `src/components/integrations/connection-summary.tsx` | Rows link to detail, Reconnect CTA, shared status badge/logo |
| `src/test/fixtures/integrations.ts` | Typed connections w/ `externalId`, ERROR variant, SECRET/BASIC/CUSTOM auth metadata fixtures |

---

## 11. Verification (Phase 24)

| Gate | Command | Result |
| :--- | :--- | :--- |
| Typecheck | `tsc --noEmit -p packages/web` | **PASS** (0 errors) |
| Lint | `turbo run lint --filter=@inboxfm-connect/web` | **PASS** (0 errors, 0 warnings) |
| Build | `turbo run build --filter=@inboxfm-connect/web` | **PASS** (vite build ✓) |
| Tests | `vitest run` (packages/web) | **PASS** — 13 files, **65/65 tests** |

Repo-wide `npm run lint-dev` still trips on the **pre-existing** `@inboxfm-connect/runtime` eslint configuration issue ("all files matching the glob are ignored") — the previously documented repo-wide lint problem, unrelated to and untouched by FE4. `@inboxfm-connect/web` itself lints clean both standalone and within the full run.

---

## 12. Known Limitations

1. **OAuth is popup-based by design.** It follows the backend's only callback mechanism (`/redirect` handshake page → `postMessage`). There is intentionally **no full-page-redirect fallback**, because completing the connection after leaving the SPA would require persisting client credentials across navigation — violating the credential-safety rules. Popup-blocked browsers get an actionable error instead.
2. **OAUTH2 connections are bring-your-own OAuth app.** The backend requires `client_id`/`client_secret` on both the authorization-url and upsert calls for the contract's four types, so the form collects them. Managed-cloud variants (`CLOUD_OAUTH2`, `PLATFORM_OAUTH2`) exist in the server but are outside the documented FE contract and are not offered.
3. **Exotic auth property types** (FILE/OBJECT/JSON/DYNAMIC/MULTI_SELECT…) render an explanatory notice directing to API-based creation rather than a degraded input.
4. **List pagination**: fetched with `limit=100` single page; cursor controls exist in the hooks but no pager UI was specified.
5. **Status set** is exactly `ACTIVE | ERROR`; if the backend later adds states, only `connectionFormat`/badge mapping needs updating.

---

## 13. FE5 Handoff

FE5 (action test/execution experience) builds directly on this foundation:

- **Connections for gating**: `useConnectionsQuery({ pieceName })` returns ready-to-use accounts; action pages should gate execution on `data.data.length > 0` and deep-link `connectionLinks.newConnection({ pieceName })` when empty.
- **Execution wiring**: `POST /v1/execute` needs `{ integration, tool, connectionId, input }` — the connection picker can consume `useConnectionsQuery({ pieceName })` directly; ids are stable across reconnects thanks to `externalId` upsert semantics.
- **Property runtime**: `POST /v1/integrations/options` remains unused and belongs to FE5's dynamic dropdown loading; `AuthPropertyRenderer` provides the pattern (and validation approach) to extend for action `props`.
- **Result surfacing**: execution output/errors map onto the same `connectionErrors`-style safe messaging conventions.
- Nothing in FE4 blocks FE5; no breaking changes to shared keys — FE5 should reuse `['connections', params]` and `['integration', name]` keys rather than introducing parallel ones.
