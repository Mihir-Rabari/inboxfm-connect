# Frontend Architecture Audit: InboxFM Connect (HeadlessRuntime)

## 1. Executive Summary

This document establishes the verified architectural state of the frontend surfaces in the `Mihir-Rabari/inboxfm-connect` repository following the completion and certification of the backend migration to **HeadlessRuntime** (PR #2 / commit `ff0599cf95`).

The legacy workflow engine (DAGs, Flow, FlowVersion, FlowRun, FlowAction, Canvas, Loop, Router) has been completely severed and permanently removed from the database and runtime execution paths. The purpose of this audit is to map the target frontend architecture that makes **HeadlessRuntime** a first-class citizen.

---

## 2. Repository Forensic State

- **Repository:** `Mihir-Rabari/inboxfm-connect`
- **Current Branch:** `main`
- **HEAD Commit SHA:** `ff0599cf95` (`feat: finalize headless runtime decoupling and release readiness (PR9) (#2)`)
- **Remote Origin:** `origin/main` (in sync with HEAD)
- **Working Tree:** Clean (verified; untracked markdown certifications preserved)
- **Monorepo Engine:** Turbo 2.9.14 + Bun 1.3.3 package manager

### Monorepo Structure & Packages

```text
inboxfm-connect/
├── packages/
│   ├── cli/                               # CLI tooling
│   ├── core/
│   │   ├── execution/                     # Execution contracts & evaluator
│   │   ├── formula/                       # Formula resolver
│   │   ├── piece-types/                   # Public piece types & SDK compatibility
│   │   ├── shared/                        # Schemas, DTOs, domain models (@inboxfm-connect/shared)
│   │   └── utils/                         # Core utility primitives (@inboxfm-connect/core-utils)
│   ├── ee/
│   │   └── embed-sdk/                     # Embedded client SDK (iframe host/guest bridge)
│   ├── integrations/
│   │   ├── common/                        # Common piece helpers
│   │   ├── framework/                     # Pieces SDK framework
│   │   ├── core/*                         # Core built-in pieces (http, webhook, schedule, etc.)
│   │   └── community/*                    # 400+ third-party integrations
│   ├── runtime/                           # HeadlessRuntime execution package
│   ├── scheduler/                         # Headless scheduler package
│   ├── server/
│   │   ├── api/                           # Fastify REST API server
│   │   ├── engine/                        # Headless execution engine (V8 isolates & child-process)
│   │   ├── sandbox/                       # Execution sandbox & cache manager
│   │   └── utils/                         # Server logging (evlog), safe HTTP, crypto
│   └── tests-e2e/                         # Playwright E2E testing framework
```

---

## 3. Frontend Architecture Inventory

### 3.1 Shipping UI Surface Status
- The legacy flow builder frontend (`packages/ui` / `packages/web`) was completely removed during the headless decoupling PRs.
- Root `package.json` retains the production-grade modern web stack:
  - **Framework & Runtime:** React 18.3.1, React DOM 18.3.1, TypeScript 5.5.4, Vite 6.4.3
  - **Routing:** React Router DOM 6.11.2
  - **State Management & Data Fetching:** TanStack React Query 5.51.1, Zustand 4.5.4
  - **Component Primitives:** Radix UI (`@radix-ui/react-*`), Lucide Icons (`lucide-react` 0.407.0)
  - **Forms & Validation:** React Hook Form 7.71.2, Zod 4.3.6, `@hookform/resolvers`
  - **Styling:** Tailwind CSS 4.1.17, `tailwind-merge`, `clsx`, `class-variance-authority`
  - **Notifications & UI Polish:** Sonner 2.0.3, Framer Motion 12.15.0, CodeMirror 5 / 6

### 3.2 Design System Foundations (Canonical Reference)
- Primary Brand Color: `#8142E3` (`hsl(257 74% 57%)`) — persistent in light & dark modes.
- Body Typography: Inter 14px (`text-sm`) default, `-0.01em` to `-0.02em` tracking on headings.
- Iconography: Lucide React (16px default, 1.5–2px stroke).
- Surfaces: Dense, tool-like UI with 1px borders (`neutral-200` light / `white/14` dark), `radius-lg` (10px) cards, no decorative fluff.
- Sentence Case: Consistent across all headings, buttons, and badges.

---

## 4. Current vs. Target Architecture

### 4.1 Dead Legacy Flow Architecture (REMOVED)
```text
[ User ]
   │
   ▼
[ Canvas / Visual DAG Editor ]
   │
   ▼
[ Flow / FlowVersion / FlowAction / FlowTrigger ]
   │
   ▼
[ FlowRun / StepExecution / Loop / Router ]
   │
   ▼
[ Legacy Engine Orchestrator ]
```

### 4.2 First-Class HeadlessRuntime Architecture (ACTIVE)
```text
                                ┌───────────────────────────┐
                                │   Headless Web Frontend   │
                                └─────────────┬─────────────┘
                                              │
              ┌───────────────────────────────┼───────────────────────────────┐
              │                               │                               │
              ▼                               ▼                               ▼
       [ Connections ]                 [ Direct Execution ]             [ Automations ]
              │                               │                         ┌─────┴─────┐
              │                               │                         ▼           ▼
              │                               │                   [ Triggers ] [ Scheduler ]
              │                               ▼                         │           │
              │                      [ HeadlessRuntime ] ◀──────────────┴───────────┘
              │                               │
              ▼                               ▼
      [ OAuth / API Keys ]         [ Tool Execution Engine ]
                                              │
                                              ▼
                                 [ Execution & SSE Events ]
```

---

## 5. Security & Authentication Model

1. **Authentication:** JWT Bearer tokens issued via `/v1/authentication/sign-in` or federated/SSO providers.
2. **Context Resolution:** Every query and mutation is tenant-isolated by `projectId` (header `x-project-id` or JWT payload) and `platformId`.
3. **Permissions:** Gated using `Permission` enum (e.g. `READ_RUN`, `WRITE_RUN`, `READ_APP_CONNECTION`, `WRITE_APP_CONNECTION`).
4. **SSE Event Stream Security:** `/v1/executions/:id/events` streams real-time execution events using project-scoped authorization.

---

## 6. Architecture Verification Matrix

| Area | Backend Entity / Endpoint | Frontend Readiness | Target UI Module |
| :--- | :--- | :--- | :--- |
| **Direct Execution** | `POST /v1/execute` | Complete backend contract | `/execute` Tool Runner |
| **Execution History**| `GET /v1/executions`, `GET /v1/executions/:id` | Complete backend contract | `/executions` Audit List & Details |
| **Live SSE Stream**  | `GET /v1/executions/:id/events` | Complete SSE stream | Execution Live Timeline |
| **Tool Calls**       | `GET /v1/executions/:id/tool-calls` | Complete backend contract | Execution Step Breakdown |
| **Connections**      | `/v1/app-connections` | Complete CRUD & OAuth | `/connections` Connection Hub |
| **Integrations**     | `/v1/integrations`, `/v1/integrations/:name` | Complete Piece Metadata | `/integrations` Directory |
| **Trigger Bindings** | `/v1/trigger-bindings` | Complete CRUD & Webhooks | `/automations/triggers` |
| **Scheduled Tasks**  | `/v1/scheduled-tasks` | Complete CRUD & Cron | `/automations/schedules` |
| **Knowledge Search** | `POST /v1/knowledge-search/query` | Complete Semantic/Keyword | Global Command / Search Bar |
