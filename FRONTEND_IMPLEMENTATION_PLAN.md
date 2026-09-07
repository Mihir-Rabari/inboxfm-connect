# Frontend Implementation Plan: InboxFM Connect

**Target Archetype:** Pipedream Connect-Style Developer Integration Platform  
**Repository:** `Mihir-Rabari/inboxfm-connect`  
**Execution Runtime:** HeadlessRuntime (`@inboxfm-connect/runtime`)

---

## 1. Implementation Phases & Milestones

```text
FE1: Forensic Audit & API Contract Definition (COMPLETE)
 └──► FE2: App Shell & Developer Navigation Baseline (ACTIVE)
       └──► FE3: Integrations Catalog & Integration Details
             └──► FE4: Connections Management & OAuth Flows
                   └──► FE5: Actions Discovery & Interactive Tool Runner (/v1/execute)
                         └──► FE6: Trigger Bindings & Scheduled Tasks
                               └──► FE7: MCP Hub & Configuration Exporter
                                     └──► FE8: Activity & Live Event Streamer
                                           └──► FE9: Developer Center (API Keys & SDK)
                                                 └──► FE10: Verification & E2E Testing
```

---

## 2. Phase-by-Phase Technical Specification

### Phase FE1 — Forensic Audit & Contract Mapping (COMPLETE)
- [x] Map all backend endpoints in `packages/server/api`.
- [x] Verify zero remaining coupling to legacy Flow/Canvas/XYFlow runtime.
- [x] Produce `FRONTEND_PRODUCT_AUDIT.md`.
- [x] Produce `FRONTEND_API_CONTRACT.md`.
- [x] Produce `FRONTEND_INFORMATION_ARCHITECTURE.md`.
- [x] Produce `FRONTEND_IMPLEMENTATION_PLAN.md`.

---

### Phase FE2 — Application Shell & Developer Console Foundation
**Goal:** Build the robust, developer-first layout shell with theme support, navigation sidebar, topbar context, and design system tokens.

1. **Web App Workspace Setup (`packages/web`):**
   - Configure `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`.
   - Setup Tailwind v4 with `#8142E3` brand purple, neutral scales, and typography.
   - Configure React Router DOM 6 with root layout and lazy routes.
   - Configure TanStack React Query 5 client with error boundary and global toast handler.
2. **Global Components & Shell Layout:**
   - **Sidebar:** Fixed 260px left navigation with groups:
     - *Core:* Overview, Integrations, Connections, Actions, Triggers, Scheduled Tasks, MCP
     - *Monitoring:* Activity
     - *Platform:* Developers, Settings
     - *Footer:* Theme Toggle (☀️/🌙), User Profile pill.
   - **Header:** Project Switcher, Global Command Search (`Cmd+K`), Environment Badge, Notification Drawer.
   - **Floating Card Main Container:** 8px inset, `radius-xl`, 1px `border-border`, subtle `shadow-xs`.
   - **Global States:** Reusable Skeleton loaders, Empty states, Error boundaries, Confirmation dialogs, Toast provider (Sonner).

---

### Phase FE3 — Integrations Catalog & Integration Detail
**Goal:** Seamless discovery of 400+ integrations with capability inspector.

1. **Integrations Catalog (`/integrations`):**
   - Fast filtering by category (`DEVELOPER_TOOLS`, `COMMUNICATION`, etc.).
   - Live search querying `/v1/integrations` and `/v1/knowledge-search/query`.
   - Integration cards displaying logo, title, tool count, trigger count, and connection status.
2. **Integration Detail (`/integrations/:name`):**
   - Header with branding, version, and quick connection status.
   - Tabs:
     - **Actions:** Cards for each action with input schemas and `[ Test Tool ]` shortcut.
     - **Triggers:** Cards for each webhook/polling trigger.
     - **Connections:** Account connection list with `[ + Connect ]` action.

---

### Phase FE4 — Connection Hub & Authentication
**Goal:** Credential management with frictionless OAuth and API key flows.

1. **Connections List (`/connections`):**
   - Table of active connections with status indicators (`Active`, `Expired`, `Error`).
   - Actions: Reconnect, Rename, Delete.
2. **Connection Modals:**
   - OAuth 2.0 popup initiator calling `/v1/app-connections/oauth2/authorization-url`.
   - Dynamic credentials form for API Keys / Basic Auth / Custom Auth based on piece `auth` properties.

---

### Phase FE5 — Action Discovery & Interactive Tool Runner
**Goal:** The flagship developer experience — discover, test, execute, and generate code for any action.

1. **Action Discovery (`/actions`):**
   - Searchable catalog of all available actions across pieces.
2. **Interactive Tool Execution Screen (`/actions/:pieceName/:actionName`):**
   - Schema-driven input form supporting text, numbers, booleans, objects, and dynamic dropdown options (`POST /v1/integrations/options`).
   - Connection picker.
   - `[ Execute Tool ]` trigger invoking `POST /v1/execute`.
   - Formatted JSON response viewer with latency timer, status badge, and copy tools.
   - Instant Code Snippet generator: **cURL**, **TypeScript SDK**, **Python SDK**, **Raw JSON**.

---

### Phase FE6 — Automations: Trigger Bindings & Scheduled Tasks
**Goal:** Event-driven and time-driven automation without visual DAG builders.

1. **Trigger Bindings (`/automations/triggers`):**
   - Table of active event bindings.
   - Create/Edit Binding drawer: Source Integration, Event Trigger, Connection, Prompt/Target Tool instructions.
   - Enable/Disable toggle and Webhook test payload runner (`POST /v1/trigger-bindings/:id/run`).
2. **Scheduled Tasks (`/automations/schedules`):**
   - Table of scheduled cron jobs with next run time and timezone.
   - Create Schedule modal with natural language cron builder.
   - `[ Run Now ]` manual trigger.

---

### Phase FE7 — MCP Hub
**Goal:** Expose tools to AI agents (Cursor, Claude Desktop, Windsurf).

1. **MCP Server Overview (`/mcp`):**
   - Project MCP endpoint URL and active status.
   - Tool selection matrix: enable/disable individual tools from MCP exposure.
   - Bearer token generator and rotation action.
   - 1-Click JSON config exporters for Claude Desktop (`claude_desktop_config.json`) and Cursor (`.cursor/mcp.json`).

---

### Phase FE8 — Activity & Live Execution Streams
**Goal:** Full observability and live execution tracing.

1. **Executions Table (`/activity`):**
   - Filterable table of past and ongoing executions.
2. **Execution Detail & Live Stream (`/activity/:id`):**
   - Step breakdown of tool calls with input/output payloads.
   - Real-time Event Stream viewer consuming SSE from `/v1/executions/:id/events`.

---

### Phase FE9 — Developers Center
**Goal:** Developer self-service credentials and documentation.

1. **API Keys:** Issue and revoke project API keys.
2. **SDK Documentation & Quickstart:** Copy-paste SDK examples for Node.js and REST.

---

### Phase FE10 — Verification & Delivery
- Run `npm run lint-dev`.
- Verify full type safety with `npx tsc --noEmit`.
- Run API and E2E verification suites.
