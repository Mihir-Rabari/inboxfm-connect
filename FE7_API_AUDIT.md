# FE7 API Audit — MCP Hub & AI Tool Exposure

> Audit-first discipline: **the backend implementation is authoritative**. Where
> `FRONTEND_API_CONTRACT.md` §6 disagrees with the code, this document records the
> real contract and the frontend implements *this*, not the stale doc.

Audited sources:

- `packages/server/api/src/app/mcp/mcp-module.ts` — route registration
- `packages/server/api/src/app/mcp/mcp-server-controller.ts` — project REST endpoints
- `packages/server/api/src/app/mcp/mcp-platform-controller.ts` — platform admin endpoints
- `packages/server/api/src/app/mcp/mcp-service.ts` — service semantics
- `packages/server/api/src/app/mcp/mcp-entity.ts`, `mcp-server-builder.ts`, `mcp-permissions.ts`
- `packages/server/api/src/app/mcp/tools/index.ts` + `tools/ap-*.ts` — the actual tool registry
- `packages/server/api/src/app/mcp/oauth/**` — protocol endpoint, OAuth discovery, token service
- `packages/server/api/src/app/server.ts` — mount points
- `packages/core/shared/src/lib/automation/mcp/mcp.ts` — shared schemas
- `packages/web/vite.config.ts` — dev proxy (`/mcp` → backend)

---

## 1. Contract drift found (contract doc vs. reality)

| FRONTEND_API_CONTRACT.md says | Backend actually does |
| --- | --- |
| `GET /v1/mcp` | `GET /v1/projects/:projectId/mcp-server` |
| `POST /v1/mcp` | `POST /v1/projects/:projectId/mcp-server` |
| `POST /v1/mcp/rotate` | `POST /v1/projects/:projectId/mcp-server/rotate` |
| `POST /v1/mcp/token` | `POST /v1/projects/:projectId/mcp-server/token` |
| "tool list" inside GET response | No tool list is returned at all; `flows: []` placeholder only |
| `mcpServerUrl` example `https://api.inboxfm.com/mcp` | `${FRONTEND_URL}/mcp` (frontend origin, proxied to API in dev) |

The existing web page also called `apiClient.post('/mcp/token')` and
`useMcpQuery()` hit `GET /v1/mcp` — both wrong; both replaced by FE7.

## 2. Entities (from `@inboxfm-connect/shared`, `automation/mcp/mcp.ts`)

```ts
McpServerType = 'PLATFORM' | 'PROJECT'

McpServer {
  id: ApId
  created: string   // ISO datetime
  updated: string   // ISO datetime
  platformId: string | null
  projectId: string | null
  type: McpServerType
  token: string            // server entity token, apId(72). NOT accepted at /mcp.
  disabledTools: string[] | null
}

PopulatedMcpServer = McpServer & { flows: unknown[] }   // flows always [] here

UpdateMcpServerRequest { disabledTools?: string[] }
```

There is **no status field**, no `ONLINE/OFFLINE/CONNECTING` enum, no per-tool
permission objects, no masked-token metadata anywhere in these responses.

## 3. REST endpoints (project console)

All require a user session (`Authorization: Bearer <session>`) with
`Permission.READ_MCP` (GET, token) or `WRITE_MCP` (update, rotate).
`projectId` is a **URL parameter** (the `x-project-id` header alone does not
address these routes).

### `GET /api/v1/projects/:projectId/mcp-server`
→ `200 PopulatedMcpServer`. Creates the row on first call (get-or-create,
concurrency-safe).

### `POST /api/v1/projects/:projectId/mcp-server`
Body: `{ "disabledTools": ["ap_create_table", ...] }` (optional field; omitted
→ no change).
→ `200 PopulatedMcpServer`. **Wholesale replacement** of the disabled list —
the client must send the complete desired array.

### `POST /api/v1/projects/:projectId/mcp-server/rotate`
No body. Generates `token = apId(72)`, persists it.
→ `200 PopulatedMcpServer` (contains the new token value).
The backend makes **no guarantee** about what else consumed the old token;
FE7 must not claim automatic old-token invalidation beyond this fact.

### `POST /api/v1/projects/:projectId/mcp-server/token`
No body. Issues a **short-lived internal OAuth access token** (JWT,
`clientId: 'internal-chat'`, `scopes: ['mcp']`,
**TTL 15 minutes** — see `mcp-oauth-token.service.ts`
`ACCESS_TOKEN_TTL_15_MINUTES_SECONDS`) bound to the current user + project.
→ `200 { mcpServerUrl: string, mcpToken: string }`.
This is the only bearer credential that authenticates against `/mcp`.

Platform-admin equivalents exist at `/api/v1/mcp-server(+/rotate)` guarded by
platform admin security — not used by the project console.

## 4. MCP protocol endpoint

- `POST {FRONTEND_URL}/mcp` — Streamable HTTP transport
  (`StreamableHTTPServerTransport`, stateless), registered in `server.ts` at
  `/mcp` (project scope) and `/mcp/platform` (platform scope). In development
  the Vite proxy forwards `/mcp` to `localhost:3000`, so the browser origin URL
  works for clients pointed at the frontend.
- Auth: `Authorization: Bearer <JWT>` verified via
  `mcpOAuthTokenService.verifyAccessToken` (audience `MCP_OAUTH_ACCESS`).
  The raw `token` column of `McpServer` is **not** an accepted credential.
- Missing/invalid bearer → `401` with
  `WWW-Authenticate: Bearer resource_metadata="<public-url>/.well-known/oauth-protected-resource/mcp"`
  (`error="invalid_token"` added when a token was supplied but rejected).
- `GET /mcp` → `405` (use POST).
- Full OAuth discovery is served at domain root:
  - `/.well-known/oauth-authorization-server`
  - `/.well-known/oauth-protected-resource/mcp`
  - dynamic client registration `/register`, `/authorize` (PKCE S256),
    `/token`, `/revoke`; access tokens TTL 15 min, refresh tokens 30 days.

**Consequence for client configuration:** OAuth-capable clients (Claude
Desktop connectors, Cursor, Windsurf — all three support OAuth for remote HTTP
servers as of 2026) can connect with the URL alone. Header-based configs need a
freshly generated short-lived token from `POST .../token`.

## 5. Tool registry (server truth)

Registered per request from `tools/index.ts`. There is **no REST endpoint that
lists tools**; the registry lives in server code:

Always on (`LOCKED_TOOL_NAMES`, cannot be disabled):
`ap_research_pieces`, `ap_get_piece_props`, `ap_resolve_property_options`,
`ap_resolve_property_chain`, `ap_validate_step_config`, `ap_list_connections`,
`ap_list_ai_models`, `ap_list_tables`, `ap_find_records`, `ap_setup_guide`

Toggleable (`ALL_CONTROLLABLE_TOOL_NAMES`, enabled unless present in
`disabledTools`):
`ap_create_table`, `ap_delete_table`, `ap_manage_fields`, `ap_insert_records`,
`ap_update_record`, `ap_delete_records`, `ap_run_action`

Conditional (`AP_TOOL_SEARCH_ENABLED` env flag, default off; toggleable but not
listed in either constant): `ap_search_actions`, `ap_search_triggers`. The
flag state is not observable through any API, so FE7 renders it as a known
limitation rather than inventing UI state.

Tool execution permissions: RBAC (Cloud/EE editions) wraps each tool's execute
with the user's project-role permission set (e.g. `ap_run_action` requires
`WRITE_RUN`). CE is allow-all. Not surfaced per-tool by any API.

`disabledTools` matching is exact string equality on tool names.

## 6. Execution linkage

`ap_run_action` executes through `HeadlessRuntime` (`flow-run-utils.ts`).
Executions are visible through the existing `/v1/executions` Activity APIs.
Execution records carry **no MCP-specific metadata** today — FE7 must not
fabricate `source: 'mcp'` filters or badges.

## 7. Client configuration formats (verified Aug 2026)

All three clients use top-level key `mcpServers`; all three support OAuth for
remote HTTP servers; header auth uses the short-lived token.

- Claude Desktop — `%APPDATA%/Claude/claude_desktop_config.json` (Win) /
  `~/Library/Application Support/Claude/claude_desktop_config.json` (mac):
  `{ "url": ..., "headers": { "Authorization": "Bearer ..." } }`
- Cursor — `.cursor/mcp.json` (project) or `~/.cursor/mcp.json`: same shape as
  Claude Desktop (`url` + `headers`), hot-reloaded.
- Windsurf — `~/.codeium/windsurf/mcp_config.json`: remote servers use
  **`serverUrl`** (`url` also accepted) + optional `headers`.

## 8. Security-relevant semantics

- `GET .../mcp-server` returns the full 72-char server token (not masked).
  FE7 chooses to render it masked; rotation re-fetches but never echoes the
  new value into persistent state.
- Short-lived `mcpToken` exists only in the POST response → display once,
  keep in React state only, never persist/log/URL/analytics.
- Errors: Fastify error handler returns `{ statusCode, message }`; messages do
  not contain credentials. 401/403 map to session/permission copy.
