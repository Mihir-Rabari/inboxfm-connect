# Inboxfm Connect Architecture

This document maps the current repository structure, database schema, and system flows. Inboxfm Connect is a fork of Activepieces with the visual workflow builder, flow engine, and legacy flow-run database layer removed in favor of a headless, MCP-first execution model (direct tool execution, trigger bindings, scheduled tasks).

---

## 1. Monorepo Structure

```
├── packages/
│   ├── core/
│   │   ├── shared/                # @inboxfm-connect/shared — DB/EE/app-level Zod schemas, types (thick, app-level)
│   │   ├── core-utils/            # Lean, framework-agnostic utilities (no DB/EE/web deps)
│   │   ├── piece-types/           # Common type schemas for integrations/pieces
│   │   ├── pieces-framework/      # Framework SDK for building custom integrations
│   │   ├── pieces-common/         # Shared utilities for pieces (OAuth, polling, HTTP helpers)
│   │   └── core-formula/          # Formula parsing and evaluation engine
│   ├── server/
│   │   ├── api/                   # Fastify-based backend REST API server
│   │   ├── engine/                # Headless runtime executor for pieces/tools ("HeadlessRuntime")
│   │   ├── sandbox/                # Code/executor isolation layer (isolated-vm)
│   │   ├── utils/                 # Shared server-side utilities (safeHttp, evlog wiring, version checks)
│   │   └── scheduler/             # Cron/scheduled trigger manager
│   ├── web/                       # React frontend — dashboard, integrations, connections, MCP hub
│   ├── connect-sdk/                # Public client SDK for the Connect platform (API keys, connect sessions)
│   ├── ee/                        # Activepieces Enterprise-licensed code — see LICENSING.md
│   └── integrations/
│       ├── core/                  # Core piece definitions (e.g. tables)
│       ├── common/                # Shared integration utilities
│       └── community/             # Third-party integrations (400+)
```

**Import boundary:** pieces and the engine may import the thin `core-*` packages, but never `@inboxfm-connect/shared` — they get what they need via `@inboxfm-connect/pieces-framework`. See `.claude/rules/core-packages.md`.

---

## 2. Dependency Graph

```
api [packages/server/api] ──────────► shared [@inboxfm-connect/shared] ──► core-utils
  │                                    │
  └────────────────────────────────────┴──► server-utils

engine [packages/server/engine] ────► pieces-framework ──► piece-types / pieces-common
```

- **Server API** depends on `@inboxfm-connect/shared` and server utilities.
- **Integrations (Pieces)** import `@inboxfm-connect/pieces-framework` and are isolated from the database/API layer.
- **Server Engine** loads pieces dynamically and executes them in isolated sandboxes (`isolated-vm`).

---

## 3. Server Modules (`packages/server/api/src/app/`)

- **`authentication/`** — login, registration, federated/SSO auth.
- **`user/`**, **`user-invitations/`** — user identity, profile, and invitation flows.
- **`project/`** — multi-tenant workspace partitioning.
- **`platform/`** — platform administration, branding, billing/plans.
- **`connect-api-keys/`, `connect-oauth-apps/`, `connect-sessions/`** — the Connect platform: project-scoped API keys and the public `/connect/:token` flow. Original code, deliberately kept outside `ee/` (see `LICENSING.md`).
- **`mcp/`** — MCP server endpoints exposing tables and piece actions to LLM agents, plus MCP OAuth (client/code/token).
- **`tables/`** — headless relational data tables (`table`, `field`, `record`, `cell`).
- **`pieces/`** — installation, syncing, versioning of registry pieces; piece metadata, filtering, search.
- **`app-connection/`** — third-party credential storage (OAuth2, API key, basic auth), encrypted at rest.
- **`execution/`** — direct tool execution, tool-call logging, trigger bindings, scheduled tasks.
- **`ai/`** — AI provider configuration (BYO or managed via OpenRouter), used by chat/agent features.
- **`event-destinations/`** — webhook/event streaming targets.
- **`flags/`** — system configuration flags served to the frontend.
- **`file/`** — uploaded file metadata and storage references.
- **`analytics/`** — platform analytics reporting.
- **`tool-search/`** — search index over available tools/actions.
- **`ee/`** — Activepieces Enterprise-licensed code (SSO/SAML, SCIM, audit logs, project members/roles, secret managers, signing keys, embed subdomains, etc.). Being actively decoupled from CE code paths — see issue #7.

---

## 4. Database Schema (TypeORM Entities)

Registered in `packages/server/api/src/app/database/database-connection.ts`. TypeORM does **not** auto-discover entities — anything new must be added there plus a migration (`.claude/rules/entity-registration.md`).

**Core (MIT, outside `ee/`):**

```
PLATFORM ────► PROJECT ────► USER ────► USER_IDENTITY
                 │
                 ├─────────► CONNECTION (app credentials, encrypted)
                 ├─────────► TABLE ────► FIELD
                 │             │
                 │             └───────► RECORD ────► CELL
                 │
                 ├─────────► EXECUTION ──► TOOL_CALL
                 ├─────────► TRIGGER_BINDING
                 ├─────────► SCHEDULED_TASK
                 ├─────────► MCP_SERVER ──► MCP_OAUTH_CLIENT / CODE / TOKEN
                 ├─────────► CONNECT_SESSION
                 ├─────────► AI_PROVIDER / AI_TOOL_CONFIG
                 ├─────────► FILE
                 └─────────► TAG ──► PIECE_TAG

INTEGRATION_METADATA (piece registry)
FLAG (system config)
STORE_ENTRY (key-value store for flows)
TOOL_SEARCH_INDEX
USER_INVITATION
```

**Enterprise (`ee/`-licensed — see LICENSING.md and issue #7 for removal status):**

```
API_KEY, APP_CREDENTIAL, APP_SUMO, AUDIT_EVENT, OTP, CONNECTION_KEY,
EMBED_SUBDOMAIN, OAUTH_APP, CONCURRENCY_POOL, PLATFORM_PLAN,
PROJECT_MEMBER, PROJECT_PLAN, PROJECT_ROLE, SECRET_MANAGER, SIGNING_KEY
```

---

## 5. System Flows

### A. Authentication Flow
1. User authenticates via local password, federated, or SSO provider.
2. Fastify controller validates credentials, fetches the user record, signs a JWT.
3. Every API request passes through `core/security/v2` (`authenticate.ts` → `authorize.ts`), which validates tenant membership (`platformId`/`projectId`) before any handler runs.

### B. Headless Integration (Piece) Execution Flow
1. An LLM agent, MCP client, or API caller invokes a tool/action.
2. The Server API resolves the piece and its connection, then dispatches to the Engine (`packages/server/engine`, "HeadlessRuntime").
3. The engine spins up an isolated sandbox, resolves credentials via `appConnectionService`, and executes the piece's action.
4. Output is returned to the caller as structured JSON; `ToolCall`/`Execution` rows record the run.

### C. Queue System (BullMQ)
- Backed by Redis.
- Manages scheduled task execution, piece installation/syncing, and background maintenance jobs.

### D. Connect Platform Flow
1. A platform issues a project-scoped Connect API key (`cak-` prefix) or opens a `/connect/:token` session for an end-user.
2. `authenticate.ts` recognizes the `cak-` prefix and mints a `SERVICE` principal bound to exactly one project.
3. `authorize.ts`'s `assertServicePrincipalScope()` rejects any attempt to touch a project outside that binding — enforced in core, MIT-licensed code, independent of `ee/rbac-service.ts`.

---

## 6. Database Backends

Selected via `AP_DB_TYPE` (see `packages/server/api/src/app/database/database-connection.ts`):

- **`POSTGRES`** (default) — production path. Connects via `AP_POSTGRES_URL` or discrete host/port/credentials. Runs TypeORM migrations on boot; `synchronize` is always `false`.
- **`PGLITE`** — embedded, Postgres-wire-compatible engine (`@electric-sql/pglite`) for zero-setup local/Community dev. Restricted to Community Edition or the testing environment. Same schema, same migrations.
