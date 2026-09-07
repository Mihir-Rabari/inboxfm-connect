# Frontend Product Audit: InboxFM Connect

**Repository:** `Mihir-Rabari/inboxfm-connect`  
**Monorepo:** Turbo 2.9.14 + Bun 1.3.3  
**Backend Runtime:** HeadlessRuntime (`@inboxfm-connect/runtime`) — PR #2 (`ff0599cf95`)  
**Target Product Archetype:** Pipedream Connect / Stripe Dashboard / Postman Developer Console  

---

## 1. Executive Summary

The backend migration of InboxFM Connect from the legacy Activepieces Flow Runtime to **HeadlessRuntime** is complete and merged into `main`. The legacy workflow execution engine (DAGs, Flow, FlowVersion, FlowRun, FlowAction, Canvas, Loop, Router, Waitpoints) has been completely eradicated from the server, runtime, database, and package graph.

The frontend is now being built from the ground up as a **developer-first integration and execution platform**.

### Core Mental Model
```text
Developer ──► Integration ──► Connection ──► Action / Tool ──► Test / Execute ──► HeadlessRuntime ──► Result
```

### Event-Driven Model
```text
Event ──► Trigger Binding ──► Target Tool ──► HeadlessRuntime
```

### Scheduled Model
```text
Schedule (Cron) ──► Target Tool ──► HeadlessRuntime
```

### AI / MCP Model
```text
MCP Server ──► Available Tools ──► HeadlessRuntime
```

---

## 2. Forensic Codebase Audit

### 2.1 Monorepo Package Inventory

| Package / Directory | Type | Status | Classification | Purpose / Scope |
| :--- | :--- | :---: | :---: | :--- |
| `packages/core/execution` | Package | Active | **KEEP** | Evaluator, execution events, step run contracts |
| `packages/core/formula` | Package | Active | **KEEP** | Expression and formula resolver |
| `packages/core/piece-types` | Package | Active | **KEEP** | Public integration types and SDK interfaces |
| `packages/core/shared` | Package | Active | **KEEP** | DTOs, domain models, schemas, validators (`@inboxfm-connect/shared`) |
| `packages/core/utils` | Package | Active | **KEEP** | Shared utility primitives (`@inboxfm-connect/core-utils`) |
| `packages/runtime` | Package | Active | **KEEP** | HeadlessRuntime execution core |
| `packages/scheduler` | Package | Active | **KEEP** | Headless scheduler & cron orchestrator |
| `packages/server/api` | Package | Active | **KEEP** | Fastify REST API, auth, controllers, security |
| `packages/server/engine` | Package | Active | **KEEP** | V8 isolate / child process worker engine |
| `packages/server/sandbox` | Package | Active | **KEEP** | Sandbox cache and execution boundaries |
| `packages/server/utils` | Package | Active | **KEEP** | Logging (evlog), safe HTTP (SSRF guard), crypto |
| `packages/integrations/*` | Packages | Active | **KEEP** | 400+ third-party & core integration pieces |
| `packages/ee/embed-sdk` | Package | Active | **KEEP** | Embeddable client bridge SDK |
| `packages/cli` | Package | Active | **KEEP** | CLI developer tools |
| `packages/tests-e2e` | Package | Active | **MIGRATE** | Playwright test harness (migrate from flow tests to developer platform tests) |
| `packages/web` | Package | New / Target | **REWRITE** | Modern Vite + React 18 Developer Console |

---

## 3. Legacy Concept Audit & Deletion Matrix

The following legacy concepts have been completely removed from the backend and are **strictly prohibited** in the frontend:

| Legacy Concept | Backend Status | Frontend Action | Replacement Architecture |
| :--- | :---: | :---: | :--- |
| **Flow / FlowVersion** | Deleted | **DELETE / BAN** | Direct Tool & Action definitions from Piece Metadata |
| **FlowBuilder / Canvas / XYFlow** | Deleted | **DELETE / BAN** | Schema-driven Tool Inspector & Test Console |
| **FlowRun** | Deleted | **DELETE / BAN** | `Execution` & `ToolCall` records (`/v1/executions`) |
| **FlowAction / FlowTrigger** | Deleted | **DELETE / BAN** | Standalone Pieces Actions (`/v1/integrations/:name`) & Triggers |
| **Router / Branch Nodes** | Deleted | **DELETE / BAN** | Headless execution or developer code / prompt evaluator |
| **Loop Nodes** | Deleted | **DELETE / BAN** | Headless execution / developer SDK |
| **Waitpoint Editors** | Deleted | **DELETE / BAN** | Not applicable in HeadlessRuntime |
| **Trigger Builder (Canvas)** | Deleted | **DELETE / BAN** | `TriggerBinding` form (`/v1/trigger-bindings`) |

---

## 4. Frontend Technology Stack & Foundation

The frontend stack leverages the existing enterprise tooling configured in the repository root:

- **Framework:** React 18.3.1 + React DOM 18.3.1
- **Language:** TypeScript 5.5.4 (Strict mode)
- **Bundler & Dev Server:** Vite 6.4.3 (`@vitejs/plugin-react`)
- **Routing:** React Router DOM 6.11.2 (Data / layout routes)
- **Server State & Cache:** TanStack React Query 5.51.1 (`@tanstack/react-query`)
- **Client State:** Zustand 4.5.4
- **Styling:** Tailwind CSS 4.1.17 + `tailwind-merge` + `clsx`
- **UI Primitives:** Radix UI (`@radix-ui/react-*`), Lucide Icons (`lucide-react` 0.407.0)
- **Forms & Validation:** React Hook Form 7.71.2 + Zod 4.3.6 + `@hookform/resolvers`
- **Code & JSON Viewers:** CodeMirror 5 / 6 (`@uiw/react-codemirror`), `react-json-view`
- **Notifications:** Sonner 2.0.3
- **Command Palette:** `cmdk` 1.1.1
- **Motion & Polish:** Framer Motion 12.15.0

---

## 5. Design System Conformance

- **Primary Color:** Brand Purple `#8142E3` (`hsl(257 74% 57%)`) in both light & dark modes.
- **Typography:** Inter 14px (`text-sm`) default body size, `-0.01em` to `-0.02em` letter spacing on headings.
- **Iconography:** Lucide React (16px / `size-4`, 1.5–2px stroke).
- **Layout:** Floating card content area (`radius-xl`, 1px `border-border`, `shadow-xs`) with fixed 260px developer-console sidebar.
- **Tone:** Dense, functional, developer-focused, verb-first microcopy.
