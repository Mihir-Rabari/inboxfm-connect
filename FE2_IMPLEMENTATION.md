# FE2 Implementation Summary: InboxFM Connect Application Shell & Navigation

**Phase:** FE2 — Application Shell & Developer Console  
**Repository:** `Mihir-Rabari/inboxfm-connect`  
**Package:** `@inboxfm-connect/web` (`packages/web`)  
**Product Archetype:** Pipedream Connect-Style Developer Integration Platform  
**Target Backend Runtime:** HeadlessRuntime (`@inboxfm-connect/runtime`)

---

## 1. Executive Summary

Phase **FE2** has successfully established the application shell and developer console navigation baseline for **InboxFM Connect**.

The architecture adheres strictly to the **Pipedream Connect-style integration and direct tool execution model** on top of the newly merged **HeadlessRuntime** backend. No visual DAGs, canvas builders, flow nodes, or legacy FlowRun concepts were introduced.

---

## 2. Files Created & Modified

### Modified Files:
- [`package.json`](file:///K:/Projects/activepieces/package.json) — Registered `"packages/web"` in the monorepo `workspaces` array.

### Created Files:

#### Configuration & Build Setup:
- [`packages/web/package.json`](file:///K:/Projects/activepieces/packages/web/package.json) — Package definition for `@inboxfm-connect/web`.
- [`packages/web/tsconfig.json`](file:///K:/Projects/activepieces/packages/web/tsconfig.json) — Strict TypeScript configuration extending `tsconfig.base.json`.
- [`packages/web/vite.config.ts`](file:///K:/Projects/activepieces/packages/web/vite.config.ts) — Vite 6 config with `@vitejs/plugin-react`, `@tailwindcss/vite`, path aliases (`@/*`), and backend proxy (`/api` & `/mcp` -> `http://localhost:3000`).
- [`packages/web/vitest.config.ts`](file:///K:/Projects/activepieces/packages/web/vitest.config.ts) — Vitest 3 config with `jsdom` environment, `@/*` alias, and global test setup.
- [`packages/web/src/test/setup.ts`](file:///K:/Projects/activepieces/packages/web/src/test/setup.ts) — jsdom polyfills (`matchMedia`, `ResizeObserver`, `scrollIntoView`, React `act` environment flag, minimal `Request` shim).
- [`packages/web/src/test/test-utils.tsx`](file:///K:/Projects/activepieces/packages/web/src/test/test-utils.tsx) — Reusable test harness: raw `createRoot` mounting with auto-cleanup, provider wrappers (Theme + Auth + MemoryRouter), async `waitFor`, and DOM text queries.
- [`packages/web/.eslintrc.json`](file:///K:/Projects/activepieces/packages/web/.eslintrc.json) — ESLint configuration extending monorepo rules.
- [`packages/web/index.html`](file:///K:/Projects/activepieces/packages/web/index.html) — HTML entry point with Inter font, theme pre-init, and viewport meta.
- [`packages/web/public/favicon.svg`](file:///K:/Projects/activepieces/packages/web/public/favicon.svg) — Brand purple SVG logo.
- [`packages/web/src/styles/globals.css`](file:///K:/Projects/activepieces/packages/web/src/styles/globals.css) — Tailwind CSS v4 variables with `#8142E3` brand purple, dark mode tokens, and custom scrollbars.

#### Core Libraries & State:
- [`packages/web/src/lib/utils/cn.ts`](file:///K:/Projects/activepieces/packages/web/src/lib/utils/cn.ts) — Utility function for `clsx` and `tailwind-merge`.
- [`packages/web/src/lib/api/types.ts`](file:///K:/Projects/activepieces/packages/web/src/lib/api/types.ts) — Type-safe DTOs for `ExecuteRequest`, `ExecuteResponse`, `PieceMetadata`, `AppConnection`, `TriggerBinding`, `ScheduledTask`, `McpServerInfo`, and `Execution`.
- [`packages/web/src/lib/api/client.ts`](file:///K:/Projects/activepieces/packages/web/src/lib/api/client.ts) — Centralized HTTP client supporting `Bearer` tokens, `x-project-id` tenant isolation headers, and typed `ApiClientError` error handling.
- [`packages/web/src/lib/api/client.test.ts`](file:///K:/Projects/activepieces/packages/web/src/lib/api/client.test.ts) — Unit tests for `ApiClient` storage, error handling, and parameter parsing (jsdom environment).
- [`packages/web/src/lib/query/query-client.ts`](file:///K:/Projects/activepieces/packages/web/src/lib/query/query-client.ts) — TanStack React Query 5 client with 2-minute stale time and global error toast handler.
- [`packages/web/src/lib/query/hooks.ts`](file:///K:/Projects/activepieces/packages/web/src/lib/query/hooks.ts) — Query hooks wired directly to real backend endpoints.
- [`packages/web/src/lib/theme/theme-provider.tsx`](file:///K:/Projects/activepieces/packages/web/src/lib/theme/theme-provider.tsx) — Light / Dark / System theme context with `localStorage['ap-theme']` persistence.
- [`packages/web/src/lib/auth/auth-context.tsx`](file:///K:/Projects/activepieces/packages/web/src/lib/auth/auth-context.tsx) — Session bootstrap and project switching context.

#### UI Primitives (`src/components/ui/`):
- [`button.tsx`](file:///K:/Projects/activepieces/packages/web/src/components/ui/button.tsx) — CVA Button with default (purple), secondary, outline, ghost, destructive, link variants and loading spinner.
- [`badge.tsx`](file:///K:/Projects/activepieces/packages/web/src/components/ui/badge.tsx) — CVA Badge with dot indicators (default, secondary, outline, success, destructive, warning).
- [`input.tsx`](file:///K:/Projects/activepieces/packages/web/src/components/ui/input.tsx) — Input with leading icon and thin (32px) variants.
- [`card.tsx`](file:///K:/Projects/activepieces/packages/web/src/components/ui/card.tsx) — Card layout primitives (Header, Title, Description, Content, Footer).
- [`separator.tsx`](file:///K:/Projects/activepieces/packages/web/src/components/ui/separator.tsx) — Radix Separator.
- [`skeleton.tsx`](file:///K:/Projects/activepieces/packages/web/src/components/ui/skeleton.tsx) — Animated pulse placeholder.
- [`avatar.tsx`](file:///K:/Projects/activepieces/packages/web/src/components/ui/avatar.tsx) — Radix Avatar with fallback initials.
- [`dialog.tsx`](file:///K:/Projects/activepieces/packages/web/src/components/ui/dialog.tsx) — Radix accessible Modal dialog.
- [`dropdown-menu.tsx`](file:///K:/Projects/activepieces/packages/web/src/components/ui/dropdown-menu.tsx) — Radix DropdownMenu.
- [`tooltip.tsx`](file:///K:/Projects/activepieces/packages/web/src/components/ui/tooltip.tsx) — Radix Tooltip with 300ms delay.
- [`tabs.tsx`](file:///K:/Projects/activepieces/packages/web/src/components/ui/tabs.tsx) — Radix Tabs supporting `default`, `underline`, and `pills` variants.
- [`empty-state.tsx`](file:///K:/Projects/activepieces/packages/web/src/components/ui/empty-state.tsx) — Standardized empty state.
- [`error-state.tsx`](file:///K:/Projects/activepieces/packages/web/src/components/ui/error-state.tsx) — Standardized error state with retry.
- [`loading-state.tsx`](file:///K:/Projects/activepieces/packages/web/src/components/ui/loading-state.tsx) — Standardized skeleton loading table.
- [`confirm-dialog.tsx`](file:///K:/Projects/activepieces/packages/web/src/components/ui/confirm-dialog.tsx) — Modal confirmation dialog.
- [`command.tsx`](file:///K:/Projects/activepieces/packages/web/src/components/ui/command.tsx) — `cmdk` Command palette primitives.
- [`sonner.tsx`](file:///K:/Projects/activepieces/packages/web/src/components/ui/sonner.tsx) — Sonner toast host component.

#### Layout Components (`src/components/layout/`):
- [`app-shell.tsx`](file:///K:/Projects/activepieces/packages/web/src/components/layout/app-shell.tsx) — Developer console shell with 260px Sidebar, Header, Floating Card viewport (`radius-xl`, 1px border), Command Palette, and Toaster.
- [`sidebar.tsx`](file:///K:/Projects/activepieces/packages/web/src/components/layout/sidebar.tsx) — Dense left navigation grouped into Core, Monitoring, and Platform, with Workspace Switcher and User Pill footer.
- [`header.tsx`](file:///K:/Projects/activepieces/packages/web/src/components/layout/header.tsx) — Top header bar with Command Palette search bar (`⌘K`), Environment badge, and SDK docs shortcut.
- [`page-header.tsx`](file:///K:/Projects/activepieces/packages/web/src/components/layout/page-header.tsx) — Reusable page header with Title, Subtitle, Breadcrumbs, Action slots, and Tabs.
- [`command-palette.tsx`](file:///K:/Projects/activepieces/packages/web/src/components/layout/command-palette.tsx) — Global `⌘K` command dialog for fast keyboard navigation.
- [`error-boundary.tsx`](file:///K:/Projects/activepieces/packages/web/src/components/layout/error-boundary.tsx) — React error boundary with recovery action.

#### Application Entry & Pages (`src/pages/`):
- [`src/main.tsx`](file:///K:/Projects/activepieces/packages/web/src/main.tsx) — Root DOM bootstrap.
- [`src/App.tsx`](file:///K:/Projects/activepieces/packages/web/src/App.tsx) — Top-level providers wrapper.
- [`src/router.tsx`](file:///K:/Projects/activepieces/packages/web/src/router.tsx) — React Router DOM 6 configuration with code splitting (`lazy` + `Suspense`).
- [`src/pages/dashboard/index.tsx`](file:///K:/Projects/activepieces/packages/web/src/pages/dashboard/index.tsx) — Real Overview dashboard with live counters, Quick Actions, and Recent Executions stream.
- [`src/pages/integrations/index.tsx`](file:///K:/Projects/activepieces/packages/web/src/pages/integrations/index.tsx) — Integrations catalog with category filtering and live search.
- [`src/pages/integrations/detail.tsx`](file:///K:/Projects/activepieces/packages/web/src/pages/integrations/detail.tsx) — Integration details with Actions and Triggers inspectors.
- [`src/pages/connections/index.tsx`](file:///K:/Projects/activepieces/packages/web/src/pages/connections/index.tsx) — Connection credential list and deletion modal.
- [`src/pages/actions/index.tsx`](file:///K:/Projects/activepieces/packages/web/src/pages/actions/index.tsx) — Action & tool discovery screen.
- [`src/pages/actions/detail.tsx`](file:///K:/Projects/activepieces/packages/web/src/pages/actions/detail.tsx) — Interactive Tool Runner: schema input editor, `POST /v1/execute` invoker, formatted JSON response, latency timer, and multi-language Code Snippet exporter (cURL, Node.js SDK, Python SDK).
- [`src/pages/triggers/index.tsx`](file:///K:/Projects/activepieces/packages/web/src/pages/triggers/index.tsx) — Triggers & event capabilities discovery screen.
- [`src/pages/automations/triggers.tsx`](file:///K:/Projects/activepieces/packages/web/src/pages/automations/triggers.tsx) — Trigger Bindings automation manager and event simulator.
- [`src/pages/automations/schedules.tsx`](file:///K:/Projects/activepieces/packages/web/src/pages/automations/schedules.tsx) — Scheduled Tasks cron manager and "Run Now" trigger.
- [`src/pages/mcp/index.tsx`](file:///K:/Projects/activepieces/packages/web/src/pages/mcp/index.tsx) — Model Context Protocol hub with Token generation and 1-Click JSON config exporters for Claude Desktop & Cursor.
- [`src/pages/activity/index.tsx`](file:///K:/Projects/activepieces/packages/web/src/pages/activity/index.tsx) — Activity and execution audit logs with status filter.
- [`src/pages/activity/detail.tsx`](file:///K:/Projects/activepieces/packages/web/src/pages/activity/detail.tsx) — Execution step breakdown and tool-call payload viewer.
- [`src/pages/developers/index.tsx`](file:///K:/Projects/activepieces/packages/web/src/pages/developers/index.tsx) — Developer SDK quickstart and REST API contracts.
- [`src/pages/settings/index.tsx`](file:///K:/Projects/activepieces/packages/web/src/pages/settings/index.tsx) — Project, identity, and theme settings.
- [`src/pages/auth/login.tsx`](file:///K:/Projects/activepieces/packages/web/src/pages/auth/login.tsx) — Developer login screen.
- [`src/pages/not-found.tsx`](file:///K:/Projects/activepieces/packages/web/src/pages/not-found.tsx) — 404 error page.

#### Baseline Test Suite (`*.test.tsx`):
- [`src/lib/theme/theme-provider.test.tsx`](file:///K:/Projects/activepieces/packages/web/src/lib/theme/theme-provider.test.tsx) — Theme persistence: `localStorage` write-through, `documentElement` dark-class application/removal, and restore-on-mount.
- [`src/components/layout/error-boundary.test.tsx`](file:///K:/Projects/activepieces/packages/web/src/components/layout/error-boundary.test.tsx) — Error boundary: default error state on child crash, custom fallback rendering, and recovery via the retry action.
- [`src/components/layout/sidebar.test.tsx`](file:///K:/Projects/activepieces/packages/web/src/components/layout/sidebar.test.tsx) — Sidebar: full developer-console navigation groups, `aria-current="page"` + active styling for the active route, absence of legacy Flow navigation, and project context from `AuthProvider`.
- [`src/components/layout/command-palette.test.tsx`](file:///K:/Projects/activepieces/packages/web/src/components/layout/command-palette.test.tsx) — Command palette: `Ctrl+K` / `Cmd+K` toggling, destination rendering when open, and select-to-navigate with dialog close.
- [`src/components/layout/app-shell.test.tsx`](file:///K:/Projects/activepieces/packages/web/src/components/layout/app-shell.test.tsx) — Authenticated layout: sidebar + header + routed outlet composition, palette opening via header search button and `Ctrl+K`, and route-level error boundary containment.
- [`src/router.test.tsx`](file:///K:/Projects/activepieces/packages/web/src/router.test.tsx) — Router: shell rendering at `/`, dashboard page resolution, and unknown-route redirect to the 404 page (backend stubbed via fetch).

---

## 3. Routes Established

| Route | View Component | Description |
| :--- | :--- | :--- |
| `/` | `DashboardPage` | Overview dashboard with metric cards, quick actions, and recent activity |
| `/integrations` | `IntegrationsPage` | 400+ piece catalog with category tabs & search |
| `/integrations/:name` | `IntegrationDetailPage` | Piece inspector: overview, callable actions, and event triggers |
| `/connections` | `ConnectionsPage` | Credential and account management with delete confirmation |
| `/actions` | `ActionsPage` | Global tool & action discovery |
| `/actions/:pieceName/:actionName` | `ActionDetailPage` | Interactive Tool Runner with live `/v1/execute` and code snippets |
| `/triggers` | `TriggersPage` | Event trigger capability catalog |
| `/automations/triggers` | `TriggerBindingsPage` | Webhook-to-tool event bindings |
| `/automations/schedules` | `ScheduledTasksPage` | Recurring cron scheduled tasks with "Run Now" |
| `/mcp` | `McpPage` | Model Context Protocol hub for Cursor & Claude Desktop |
| `/activity` | `ActivityPage` | Execution audit log table |
| `/activity/:id` | `ExecutionDetailPage` | Step breakdown and tool call inspector |
| `/developers` | `DevelopersPage` | SDK installation, quickstart examples, and REST API |
| `/settings` | `SettingsPage` | Project settings, developer identity, and appearance |
| `/login` | `LoginPage` | Developer sign-in screen |
| `/404` | `NotFoundPage` | Fallback route |

---

## 4. Legacy Concepts Explicitly Avoided

The frontend contains **zero** references to the following legacy abstractions:
- ❌ No `Flow` or `FlowVersion`
- ❌ No `FlowBuilder` or `FlowCanvas`
- ❌ No `XYFlow` or graph node editors
- ❌ No `FlowRun` models
- ❌ No `RouterNode` or `LoopNode`
- ❌ No `Waitpoint` editors

---

## 5. Verification Results

```text
Build:      PASSED (Vite 6.4.3 production bundle built in 12.89s, output to dist/packages/web)
Typecheck:  PASSED (TypeScript 5.5.4 zero errors via tsc --noEmit)
Lint:       PASSED (ESLint 8.57.0: @inboxfm-connect/web zero errors, zero warnings)
Unit Tests: PASSED (Vitest 3.2.6, jsdom: 24/24 tests passing across 7 files)
```

Note on repo-wide `npm run lint-dev`: all packages pass except the pre-existing
`@inboxfm-connect/runtime` lint configuration issue (its ESLint setup ignores its own sources);
this is unrelated to FE2 and untouched by it.

### Test Coverage (Phase 20)

| Requirement | Test file |
| :--- | :--- |
| Router | `src/router.test.tsx` |
| Authenticated layout | `src/components/layout/app-shell.test.tsx` |
| Sidebar active route | `src/components/layout/sidebar.test.tsx` |
| Command palette opening | `src/components/layout/command-palette.test.tsx`, `app-shell.test.tsx` |
| Theme persistence | `src/lib/theme/theme-provider.test.tsx` |
| Error boundary | `src/components/layout/error-boundary.test.tsx`, `app-shell.test.tsx` |
| API client error handling | `src/lib/api/client.test.ts` |

The suite uses Vitest + jsdom with raw `react-dom/client` mounting (React 18.3 `act`) — no new
runtime dependencies were added to the app bundle; test-only polyfills live in `src/test/setup.ts`.

---

## 6. Next Steps

With the application shell and navigation baseline complete, the project is ready for **Phase FE3: Full Integrations Catalog & Integration Details**.
