> ## ⚠ SUPERSEDED IN PART — 2026-08-27
> The MCP endpoints described below existed only as unreachable code: `mcpServerModule` was commented
> out in `app.ts`, so the entire MCP surface returned 404. The module is now registered, which makes
> `/v1/projects/:projectId/mcp-server` (+ `rotate`, `token`) work. Still absent from this codebase:
> the `POST /mcp` protocol transport and the MCP OAuth authorize/approve flow — they were removed with
> the legacy runtime. See `FE8_IMPLEMENTATION.md` §1 and §11.8.
> This text is preserved as a forensic record.

# FE7 Implementation — MCP Hub & AI Tool Exposure

FE7 turns InboxFM Connect into an MCP-powered integration platform for AI agents.
MCP is implemented strictly as an **exposure layer** over the existing
Integration / Action / Connection / Execution primitives — no new execution
runtime was created.

Companion document: [FE7_API_AUDIT.md](./FE7_API_AUDIT.md) (authoritative backend
contract; the stale `FRONTEND_API_CONTRACT.md` §6 was corrected against it).

---

## 1. MCP backend contract (as implemented)

| Concern | Contract |
| --- | --- |
| Server entity | `GET/POST /api/v1/projects/:projectId/mcp-server` → `PopulatedMcpServer` |
| Token rotation | `POST .../mcp-server/rotate` → new 72-char server token |
| Client token | `POST .../mcp-server/token` → `{ mcpServerUrl, mcpToken }` (short-lived JWT, ~15 min TTL) |
| Protocol endpoint | `POST {frontend}/mcp`, Streamable HTTP, `Authorization: Bearer <JWT>` |
| Tool exposure | `disabledTools: string[]` on the server entity; **wholesale replacement** on POST |
| Auth discovery | Full OAuth2 flow at domain root (`/.well-known/oauth-protected-resource/mcp`, `/register`, `/authorize` PKCE, `/token`) |

The raw `token` column is **not** accepted at `/mcp`; only OAuth access tokens
are verified there. This drove the credential UX (see §4).

## 2. MCP server information

- Real fields displayed from `GET .../mcp-server`: `type` badge (`PROJECT`),
  enabled-tool summary, server URL, `created` / `updated` dates, server id.
- The server URL prefers the **backend-provided** `mcpServerUrl` (captured after
  a token generation call) and falls back to `${window.location.origin}/mcp`
  (matches the Vite dev proxy and single-domain production serving).
- No status enum exists in the backend — none was invented. The card shows
  factual state ("Enabled · N of M tools").

## 3. Tool registry & exposure

- The backend exposes `ap_*` meta-tools, not per-piece-action tools. The
  registry UI mirrors the server truth exactly:
  - 10 locked tools (always exposed, lock icon instead of toggle)
  - 7 controllable tools (toggleable via `disabledTools`)
  - Manifest: `src/lib/mcp/tool-registry.ts` (names, real descriptions,
    annotations, parameter references) — kept in sync with
    `packages/server/api/src/app/mcp/tools/index.ts`.
- Toggling sends the **complete desired array** as `{ disabledTools: [...] }`
  (backend semantics = wholesale replacement), with optimistic cache update,
  rollback on failure, and invalidation on settle
  (`useUpdateMcpTools` in `src/lib/query/hooks.ts`).
- Feedback: accessible toasts "Tool exposed" / "Tool hidden" + failure toast;
  toggles are `role="switch"` buttons with `aria-checked` and per-tool labels.
- Search (name/display name/description) and exposure-status filter are client
  side — the backend has no tool-list API to filter server-side. Zero extra
  network calls for search (pinned by test).
- Known limitation: `AP_TOOL_SEARCH_ENABLED` adds two optional discovery tools
  server-side whose flag state is not observable via any API, so they are not
  rendered rather than guessed.

## 4. Credential lifecycle

- **OAuth mode (recommended)** — URL-only client config; Claude Desktop,
  Cursor and Windsurf all perform OAuth authorization on first connect using
  the served discovery documents.
- **Bearer mode** — `[Generate Token]` calls `POST .../token`; the short-lived
  (~15 min) JWT is shown exactly once in a dialog with copy button and an
  explicit warning ("This token will not be shown again"). React state only.
- **Server token rotation** — masked display (`abcd••••••••••••`); rotation
  requires a destructive confirm dialog with hedged copy ("may stop working");
  success invalidates `['mcp-server']`. No claim of automatic old-token
  revocation beyond what the backend guarantees.

## 5. Client configurations

Generated from real values by `src/lib/mcp/client-config.ts`
(formats verified against current client docs, Aug 2026):

| Client | File | Shape |
| --- | --- | --- |
| Claude Desktop | `%APPDATA%\Claude\claude_desktop_config.json` | `{ url }` (+`headers.Authorization` in bearer mode) |
| Cursor | `.cursor/mcp.json` / `~/.cursor/mcp.json` | same as Claude |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` | uses **`serverUrl`** key |

A credential is embedded **only** when the user explicitly generated a token
and selected bearer mode; bearer configs show "This configuration contains a
credential." Copy buttons write straight to the clipboard; nothing persists.

## 6. Reuse & no duplication

- Integrations callable by agents are listed through the existing
  `useIntegrations()` catalog (single request, no N+1) and link into
  `/integrations/:name?tab=actions`.
- Executions remain visible through the existing Activity pages; a status line
  links `/activity`. Backend executions carry no MCP metadata today, so none
  was fabricated.
- No new connection model, no second execution architecture, no flow/canvas
  concepts introduced.

## 7. Security

- Generated tokens live in component state only; cleared when the dialog
  closes. Never in localStorage/sessionStorage/analytics/URLs/error UI.
- Server token rendered masked; full value never rendered anywhere.
- Tests assert: tokens absent from request URLs, storage, clipboard payloads
  (unless explicitly generated), DOM after close, and that unauthorized
  operations surface clean error messages (401/403 mapped via
  `src/lib/mcp/mcp-errors.ts`).

## 8. Accessibility

- Tool toggles: `role="switch"`, `aria-checked`, `aria-label`, `aria-describedby`,
  sr-only status text per tool.
- Dialogs: Radix primitives (focus trap, Esc, labelled titles).
- Copy buttons: descriptive `aria-label`s; token `<pre aria-label>`.
- Live feedback: `role="alert"` on the one-time-token warning, `role="status"`
  on sync/activity lines; toasts render through Sonner's live region.

## 9. Responsiveness

Two-column desktop grid (`lg:grid-cols-5`, 3+2 split) stacking vertically below
`lg`. Tool table scrolls horizontally (`min-w-[560px]` inside `overflow-x-auto`);
config blocks use `overflow-x-auto` code regions.

## 10. Files changed

```
packages/web/src/
  lib/api/types.ts                     # exact MCP DTOs (McpServer, PopulatedMcpServer, …)
  lib/query/hooks.ts                   # useMcpServerQuery, useUpdateMcpTools (optimistic),
                                       # useRotateMcpToken, useGenerateMcpToken
  lib/mcp/tool-registry.ts             # server-mirrored ap_* tool manifest
  lib/mcp/client-config.ts             # per-client config builder (pure)
  lib/mcp/client-config.test.ts        # unit tests
  lib/mcp/mcp-errors.ts                # safe error normalization
  components/mcp/mcp-server-card.tsx
  components/mcp/mcp-credential-card.tsx
  components/mcp/mcp-token-dialog.tsx
  components/mcp/mcp-client-config-card.tsx
  components/mcp/mcp-tool-table.tsx
  components/mcp/mcp-tool-permission-toggle.tsx
  components/mcp/mcp-tool-inspector.tsx
  pages/mcp/index.tsx                  # rewritten MCP Hub
  pages/mcp/index.test.tsx             # 22 integration tests
  test/fixtures/mcp.ts                 # fixtures + route stubs
  test/api-stub.ts                     # match/respond now receive method + parsed body
```

Also removed: the stale `useMcpQuery()` hook and `McpServerInfo` type that hit
the non-existent `GET /v1/mcp` endpoint.

## 11. Verification

| Check | Result |
| --- | --- |
| `tsc --noEmit -p packages/web` | PASS |
| `turbo run lint --filter=@inboxfm-connect/web` | PASS (0 errors, 0 warnings) |
| `turbo run build --filter=@inboxfm-connect/web` | PASS |
| `vitest run packages/web` | PASS — 151 tests / 25 files (22 new for FE7) |

## 12. Known limitations

1. `AP_TOOL_SEARCH_ENABLED` tools (`ap_search_actions`, `ap_search_triggers`)
   are not shown — their flag isn't queryable via API.
2. Bearer-mode client configs embed a ~15-minute token; users must regenerate
   and re-paste. Long-lived agent auth should use the OAuth flow.
3. The tool registry manifest is static (mirrors server source). If backend
   tools change, `tool-registry.ts` must be updated. A future
   `GET .../mcp-server/tools` endpoint would remove this coupling.
4. Rotation does not force-disconnect active clients (nothing in the backend
   does); copy reflects this honestly.

## 13. FE8 handoff

- MCP executions already flow through HeadlessRuntime into `/v1/executions`;
  FE8 (Activity redesign) can consume them without changes here.
- If FE8 needs provenance, add an MCP source marker on the backend execution
  record first — the frontend will follow the real contract.
- `['mcp-server']` query key is the single cache entry; FE8 surfaces can
  invalidate it if they ever mutate MCP state.
- Scope boundary respected: no activity redesign, SSE streaming, timeline
  overhaul, token-usage dashboards or cost analytics were built.
