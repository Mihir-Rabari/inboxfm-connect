# Frontend Migration Plan: InboxFM Connect (HeadlessRuntime)

## 1. Objectives & Principles

The goal of the frontend migration is to establish a **first-class HeadlessRuntime UI** for InboxFM Connect.

### Core Principles
1. **Source of Truth:** The backend `HeadlessRuntime` and its associated Fastify REST API are the single source of truth.
2. **Zero Legacy DAGs:** No visual canvas, no DAG nodes, and no reconstructed flow graphs.
3. **Direct Tool Invocation:** The primary interactive UX is direct execution (`Connection → Tool → Parameters → Execute → Result`).
4. **First-Class Automations:** Event-driven trigger bindings (`TriggerBinding`) and cron-scheduled tasks (`ScheduledTask`) are independent, clean automation entities.
5. **Real-time Event Streaming:** Live execution progress is delivered via Server-Sent Events (`/v1/executions/:id/events`) and rendered as chronological audit timelines.
6. **Unified Design System:** Faithful adherence to the canonical Activepieces design system tokens (Brand Purple `#8142E3`, Inter 14px body text, 1px neutral borders, sentence case, Lucide icons).

---

## 2. Target Information Architecture & Navigation

```text
InboxFM Connect Web Application
│
├── 🚀 Execute (Interactive Tool Runner)
│   ├── Select Integration (Browse 400+ Pieces)
│   ├── Select Tool / Action
│   ├── Select / Create Connection
│   ├── Dynamic Input Form (with Property Resolvers)
│   └── Real-time Execution Output & Latency Inspector
│
├── ⚡ Automations
│   ├── 🎯 Trigger Bindings (Event/Webhook -> Tool Execution)
│   │   ├── List Active / Disabled Bindings
│   │   ├── Create / Edit Binding (Piece, Trigger, Connection, Prompt Template)
│   │   └── Webhook Simulation & Test Run
│   └── ⏱️ Scheduled Tasks (Cron -> Tool Execution)
│       ├── List Scheduled Tasks (Next Run, Last Run, Status)
│       ├── Create / Edit Task (Cron Expression, Timezone, Prompt)
│       └── Manual "Run Now" Trigger
│
├── 📊 Executions (Audit Trail & Live Monitoring)
│   ├── Execution History Table (Status, Tokens, Cost, Finish Time)
│   └── Execution Details View
│       ├── Live SSE Event Timeline (ExecutionStarted, ToolStarted, ToolFinished)
│       └── Tool Call Breakdown (Inputs, Outputs, Errors, Latencies)
│
├── 🔌 Integrations Catalog
│   ├── Directory of 400+ Pieces & Categories
│   └── Tool & Trigger Documentation / Parameter Schema Inspector
│
├── 🔑 Connections Hub
│   ├── Active Connections List & Health Status
│   ├── OAuth2 Connect & Reconnect Flows
│   └── API Key / Secret Text Credential Manager
│
└── ⚙️ Project & Platform Settings
    ├── AI Providers Configuration
    ├── API Keys
    └── Team Members & Platform Roles
```

---

## 3. Detailed Component & UX Blueprints

### 3.1 Direct Execution UX (`/execute`)
1. **Integration Selector:** Combobox searching pieces via `GET /v1/integrations` and `POST /v1/knowledge-search/query`.
2. **Action/Tool Selector:** Dropdown populated from `piece.actions`.
3. **Connection Selector:** Dropdown populated from `GET /v1/app-connections?pieceName=...`, with an inline "+ New Connection" modal.
4. **Dynamic Property Form:** Generated from `action.props` supporting:
   - Text, Number, Boolean, JSON, Select, Multi-Select, Dynamic Dropdowns (`POST /v1/integrations/options`).
5. **Execute Action:** Dispatches `POST /v1/execute` with `{ integration, tool, connectionId, input }`.
6. **Execution Output:**
   - JSON viewer with formatting and copy functionality.
   - Response status, latency (ms), and error diagnostics.

### 3.2 Trigger Binding UX (`/automations/triggers`)
1. **List View:** Table displaying `TriggerBinding` records with Status toggle (`/enable` / `/disable`), piece icon, trigger name, prompt template preview, and webhook URL.
2. **Binding Editor Modal/Page:**
   - Step 1: Select Piece & Trigger (e.g. `slack` -> `new_message`).
   - Step 2: Select Connection.
   - Step 3: Configure Trigger settings and property filters.
   - Step 4: Define Prompt Template / Target Action.
   - Step 5: Test Webhook / Run (`POST /v1/trigger-bindings/:id/run`).

### 3.3 Scheduled Task UX (`/automations/schedules`)
1. **List View:** Table displaying `ScheduledTask` records with status toggle, readable cron description (using `cronstrue`), timezone, Last Run At, Next Run At, and "Run Now" action button.
2. **Task Editor Modal/Page:**
   - Cron Expression Builder / Presets (Every minute, Hourly, Daily, Weekly, Custom).
   - Timezone Selector (defaulting to UTC or user timezone).
   - Execution Prompt / Target Instruction.

### 3.4 Executions & Event Timeline UX (`/executions/:id`)
1. **Header:** Execution ID, Status Badge (`CREATED`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`), Duration, Total Tokens, Cost.
2. **Live Event Stream:** Connects to `GET /v1/executions/:id/events` using `EventSource`.
   - Renders chronological event cards:
     - `ExecutionStarted`
     - `PlannerStarted` (shows model name)
     - `ToolStarted` (shows tool name & animated pulse loader)
     - `ToolFinished` (shows output snippet & latency badge)
     - `ToolFailed` (shows error stack / message in red)
     - `ExecutionCompleted` (shows final result summary)
3. **Tool Calls Table:** Displays all individual `ToolCall` records (`GET /v1/executions/:id/tool-calls`) with expandable payload viewers.

---

## 4. Implementation Phasing & Dependency Order

```text
Phase FE-1: Audit & Architectural Certification (CURRENT PHASE)
   └── Establish absolute truth, API contracts, design tokens, and migration plan.

Phase FE-2: Web Application Foundation & Routing Shell
   └── Initialize Vite + React 18 + Tailwind setup, Root App layout, Sidebar navigation, Theme provider, Auth context, and QueryClient.

Phase FE-3: Design System Primitives & UI Foundation
   └── Implement Button, Input, Select, Badge, Card, Dialog, Table, Tabs, Switch, JSON Viewer, and Sonner toast host following design tokens.

Phase FE-4: Connections Hub & Integrations Catalog
   └── Build `/connections` CRUD (OAuth2 popups, API keys) and `/integrations` piece marketplace & tool inspector.

Phase FE-5: Direct Execution UX (`/execute`)
   └── Build the interactive tool runner, dynamic property form generator with dynamic options resolver, and result console.

Phase FE-6: Automations: Trigger Bindings & Scheduled Tasks
   └── Build `/automations/triggers` and `/automations/schedules` management, creation modals, and test execution actions.

Phase FE-7: Executions Monitoring & Real-time SSE Timeline
   └── Build `/executions` history table, details page, SSE event subscriber, and tool-call audit breakdown.

Phase FE-8: Global Knowledge Search & Command Bar
   └── Implement global command menu (`Cmd+K`) leveraging `/v1/knowledge-search/query` for instant tool & action discovery.

Phase FE-9: Verification, Linting & E2E Testing
   └── Run `npm run lint-dev`, TypeScript build verification, and end-to-end user flow tests.
```

---

## 5. Verification Strategy

1. **Compilation & Type Safety:** Turbo build `npx turbo run build` across all packages must pass with 0 errors.
2. **Linting:** `npm run lint-dev` must pass cleanly without warnings.
3. **API Contract Integrity:** All client calls must strictly adhere to the Zod schemas defined in `@inboxfm-connect/shared`.
4. **No Legacy Regression:** Zero imports of legacy flow entities, zero canvas libraries, zero mock DAG objects.
