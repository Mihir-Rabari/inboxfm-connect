# Frontend Information Architecture: InboxFM Connect

**Product Positioning:** Pipedream Connect / Stripe Dashboard / Postman Developer Console  
**Target User:** Developers, AI engineers, and technical builders looking to connect tools, test direct executions, configure event-driven trigger bindings, schedule tasks, and expose integrations to AI agents via MCP.

---

## 1. Global Navigation & Layout Architecture

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ Header: Project Switcher | Global Command Search (⌘K) | Env | User Profile  │
├──────────────┬──────────────────────────────────────────────────────────────┤
│ Sidebar      │ Main Content View (Floating Card with radius-xl & 1px border)│
│              │                                                              │
│ Overview     │ ┌──────────────────────────────────────────────────────────┐ │
│              │ │ Page Header (Title + Subtitle + Action Buttons)          │ │
│ Integrations │ ├──────────────────────────────────────────────────────────┤ │
│ Connections  │ │                                                          │ │
│ Actions      │ │ Viewport Content (Catalog / Forms / Test / Logs / Code)  │ │
│ Triggers     │ │                                                          │ │
│ Schedules    │ │                                                          │ │
│ MCP          │ └──────────────────────────────────────────────────────────┘ │
│              │                                                              │
│ Activity     │                                                              │
│ Developers   │                                                              │
│ Settings     │                                                              │
└──────────────┴──────────────────────────────────────────────────────────────┘
```

---

## 2. Route Map & Screen Breakdown

### 2.1 Overview / Dashboard (`/`)
- **Purpose:** At-a-glance health and capability status.
- **Key Cards / Stats:**
  - Connected Integrations (Count)
  - Available Tools (Count)
  - Active Connections (Count)
  - Active Trigger Bindings (Count)
  - Scheduled Tasks (Count)
- **Quick Action Affordances:**
  - `[ Connect Integration ]`
  - `[ Explore Tools ]`
  - `[ Test / Execute Tool ]`
  - `[ Create Trigger Binding ]`
  - `[ Create Scheduled Task ]`
- **Recent Activity Stream:** Last 5 tool executions with live status, latency, and shortcut to audit log.

### 2.2 Integrations (`/integrations` & `/integrations/:name`)
- **Catalog View (`/integrations`):**
  - Search bar + Category pills (`All`, `Developer Tools`, `Communication`, `Productivity`, `CRM`, `Storage`)
  - Integration cards: Icon, Display Name, Description, Tool Count, Trigger Count, Connection Status Badge, `[ Connect ]` / `[ View ]` action.
- **Detail View (`/integrations/:name`):**
  - Header: Integration branding, connection status, auth requirements.
  - Tabbed Interface:
    - **Overview:** Description, supported auth methods, quick links.
    - **Actions / Tools:** List of callable actions with parameter summaries. Clicking an action navigates to its interactive Test / Execution runner.
    - **Triggers:** List of event triggers (Webhook / Polling) with payload schemas.
    - **Connections:** Active credentials for this specific piece with `[ + Add Connection ]` button.

### 2.3 Connections (`/connections` & `/connections/:id`)
- **List View (`/connections`):**
  - Table of all credentials: Piece Logo + Display Name, Connection Type (OAuth2, Secret Text, Basic Auth), Status (`Connected` / `Expired` / `Error`), Created Date.
  - Row Actions: `Reconnect`, `Rename`, `Delete`.
- **Detail View (`/connections/:id`):**
  - Account metadata, external ID, token expiry/refresh status, list of tools currently utilizing this connection.

### 2.4 Actions / Tool Discovery & Test Runner (`/actions` & `/actions/:pieceName/:actionName`)
- **Directory (`/actions`):**
  - Global catalog of all callable tools across all integrations.
  - Filters: Integration, Category, Auth required.
- **Interactive Test Runner (`/actions/:pieceName/:actionName`):**
  - Left Panel: Action description, schema-driven input form (supports dynamic dropdowns via `/v1/integrations/options`), Connection selector.
  - Action Bar: `[ Execute Tool ]` (Calls `POST /v1/execute`).
  - Right Panel:
    - **Execution Result:** Status badge (Success/Failure), Duration (ms), Formatted JSON Output, Error viewer.
    - **Code Snippet Generator:** Copy ready-to-run code in **cURL**, **Node.js SDK**, **Python SDK**, or **JSON Request**.

### 2.5 Triggers & Trigger Bindings (`/triggers` & `/automations/triggers`)
- **Triggers Discovery (`/triggers`):**
  - Catalog of all event capabilities across pieces.
- **Trigger Bindings Hub (`/automations/triggers`):**
  - List of active trigger-to-tool bindings: Piece Trigger, Connection, Prompt/Target Tool, Status (Enabled/Disabled).
  - Create / Edit Modal:
    - Source Integration & Trigger selection
    - Connection selector
    - Trigger settings configuration
    - Prompt template / Target tool instruction
    - Actions: `Save`, `Enable/Disable`, `Test Payload Simulation` (`POST /v1/trigger-bindings/:id/run`).

### 2.6 Scheduled Tasks (`/automations/schedules`)
- **List View:**
  - Table: Task Name / Prompt, Cron Expression & Human-Readable Interval (e.g. "Every day at 08:00 UTC"), Timezone, Last Run, Next Run, Status Toggle (`ENABLED` / `DISABLED`).
  - Row Action: `[ Run Now ]` (`POST /v1/scheduled-tasks/:id/run`).
- **Create / Edit Modal:**
  - Name / Prompt input
  - Visual Cron Builder & raw cron expression input
  - Timezone picker
  - Status toggle

### 2.7 MCP Hub (`/mcp`)
- **Purpose:** Connect AI tools (Cursor, Claude Desktop, Windsurf) to InboxFM Connect.
- **Server Overview:**
  - Server Name, Base URL (`/mcp`), Available Tool Count.
- **Tools Permissions:**
  - Checkbox toggle list to enable/disable specific tools from the MCP registry.
- **Credentials & Connection Strings:**
  - `[ Generate Bearer Token ]`
  - `[ Rotate Token ]`
  - 1-Click Copy Config for `claude_desktop_config.json` and `.cursor/mcp.json`.

### 2.8 Activity & Execution Logs (`/activity` & `/activity/:id`)
- **Audit Table (`/activity`):**
  - Time, Trigger Source (Direct / TriggerBinding / Scheduled / MCP), Prompt / Tool, Status (`SUCCEEDED`, `FAILED`, `RUNNING`), Duration, Tokens/Cost.
- **Execution Details View (`/activity/:id`):**
  - Header: Status, Timestamp, Duration, Token Usage.
  - **Tool Calls Timeline:** Step-by-step list of tools executed during this run with input, output, latency, and status.
  - **Live SSE Event Viewer:** Real-time event timeline streaming from `/v1/executions/:id/events`.

### 2.9 Developers Center (`/developers`)
- **Sub-pages:**
  - **API Keys:** Manage platform/project API keys (`packages/server/api/src/app/ee/api-keys`).
  - **SDK & API Reference:** Quickstart guides, TypeScript SDK installation (`@inboxfm-connect/sdk`), REST API documentation.
  - **Code Examples:** Common patterns for calling `/v1/execute`, listening to webhooks, and interacting with MCP.

### 2.10 Settings (`/settings`)
- Project details, members, billing/usage limits, and white-labeling appearance.
