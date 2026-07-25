# Removable Subsystems and Dead Weight (REMOVE)

This document lists all packages, directories, database tables, and concepts that are discarded to transform the codebase into a headless AI agent tool execution runtime.

---

## 1. Discarded Monorepo Packages

| Package | Purpose | Why It Can Be Removed |
| :--- | :--- | :--- |
| [`packages/web`](file:///K:/Projects/activepieces/packages/web) | Angular/React workflow builder dashboard | Dashboard and drag-and-drop workflow elements are obsolete. |
| [`packages/ee/embed-sdk`](file:///K:/Projects/activepieces/packages/ee/embed-sdk) | Embedding client library | Embedding workflow canvases is no longer supported. |
| [`packages/core/execution`](file:///K:/Projects/activepieces/packages/core/execution) | Flow executor state models | Flows, loops, routers, step states, and execution histories are entirely deleted. |
| [`packages/core/formula`](file:///K:/Projects/activepieces/packages/core/formula) | Interpolation & variable evaluator | Input payloads are evaluated prior to calling the REST API. |
| [`packages/server/worker`](file:///K:/Projects/activepieces/packages/server/worker) | BullMQ worker polling logic | Asynchronous queuing is eliminated. Execution runs synchronously inside Fastify endpoints via isolated processes. |

---

## 2. Severed API Modules

Remove all directories under [`packages/server/api/src/app`](file:///K:/Projects/activepieces/packages/server/api/src/app) linked to workflows, webhooks, triggers, or secondary workspace entities:

- **`flows/`**: [`packages/server/api/src/app/flows`](file:///K:/Projects/activepieces/packages/server/api/src/app/flows) — Flows, versions, and flow runs.
- **`trigger/`**: [`packages/server/api/src/app/trigger`](file:///K:/Projects/activepieces/packages/server/api/src/app/trigger) — Trigger configurations and event routing.
- **`webhooks/`**: [`packages/server/api/src/app/webhooks`](file:///K:/Projects/activepieces/packages/server/api/src/app/webhooks) — Webhook listener endpoints.
- **`workers/`**: [`packages/server/api/src/app/workers`](file:///K:/Projects/activepieces/packages/server/api/src/app/workers) — Queue jobs, BullMQ setup, scheduler hooks, and interactive watchers.
- **`template/`**: [`packages/server/api/src/app/template`](file:///K:/Projects/activepieces/packages/server/api/src/app/template) — Community templates.
- **`store-entry/`**: [`packages/server/api/src/app/store-entry`](file:///K:/Projects/activepieces/packages/server/api/src/app/store-entry) — Intermediate step storage.
- **`tables/`**: [`packages/server/api/src/app/tables`](file:///K:/Projects/activepieces/packages/server/api/src/app/tables) — In-app spreadsheets.
- **`knowledge-base/`**: [`packages/server/api/src/app/knowledge-base`](file:///K:/Projects/activepieces/packages/server/api/src/app/knowledge-base) — AI documents vector stores.
- **`tool-search/`**: [`packages/server/api/src/app/tool-search`](file:///K:/Projects/activepieces/packages/server/api/src/app/tool-search) — Elasticsearch-style piece search index.
- **`analytics/`**: [`packages/server/api/src/app/analytics`](file:///K:/Projects/activepieces/packages/server/api/src/app/analytics) — Metrics.
- **`mcp/`**: [`packages/server/api/src/app/mcp`](file:///K:/Projects/activepieces/packages/server/api/src/app/mcp) — Model Context Protocol endpoints.
- **`ee/` (Builder Customizations)**:
  - `git-sync/`
  - `project-release/`
  - `audit-logs/`
  - `alerts/`
  - `billing/`
  - `embed-subdomain/`

---

## 3. Obsolete Database Tables

Delete the following Entity Schemas registered in [`packages/server/api/src/app/database/database-connection.ts`](file:///K:/Projects/activepieces/packages/server/api/src/app/database/database-connection.ts):

- `TriggerEventEntity`, `AppEventRoutingEntity`
- `FlowEntity`, `FlowVersionEntity`, `FlowRunEntity`
- `WaitpointEntity`, `FolderEntity`
- `StoreEntryEntity`
- `TagEntity`, `PieceTagEntity`
- `AlertEntity`, `OtpEntity`
- `AIProviderEntity`, `AiToolConfigEntity`
- `TableEntity`, `FieldEntity`, `RecordEntity`, `CellEntity`, `TableWebhookEntity`
- `McpServerEntity`, `McpOAuthClientEntity`, `McpOAuthAuthorizationCodeEntity`, `McpOAuthTokenEntity`
- `KnowledgeBaseFileEntity`, `KnowledgeBaseChunkEntity`
- `ToolSearchIndexEntity`
- `ChatConversationEntity`, `ChatRolloutUserEntity`
- `TriggerSourceEntity`
- `ConcurrencyPoolEntity`, `SigningKeyEntity`
- `PlatformAnalyticsReportEntity`

---

## 4. Piece Framework Removal (Triggers & Flows)

All triggers and workflows are completely deleted. 
- In the SDK framework, all definitions of `Trigger` and associated properties (e.g. `TriggerStrategy`, `WebhookHandshakeStrategy`) are deleted.
- Every integration contains only `displayName`, `logoUrl`, `auth`, and `tools` (previously actions).
