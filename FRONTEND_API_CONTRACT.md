# Frontend API Contract: InboxFM Connect

> ## ⚠ CORRECTIONS — 2026-08-27
>
> Parts of this document were **proven incorrect** against backend source and a running app + database.
> The corrections below take precedence over anything stated later in this file. The original text is
> left intact deliberately, as a forensic record. Authoritative order:
> **backend source code → `FE8_IMPLEMENTATION.md` → this document.**
>
> 1. **`x-project-id` is never read by the server.** No route resolves the tenant from a header.
>    Project scope comes from a query parameter (`ProjectResourceType.QUERY`), a body field
>    (`BODY`), a path parameter (`PARAM`), or the resource row itself (`TABLE`) — nothing else.
> 2. **`POST /v1/execute` requires `projectId` in the request body.** The route is guarded by
>    `ProjectResourceType.BODY` and authorization runs at `preHandler`, i.e. after zod has stripped
>    unknown keys, so the field must be declared in `ExecuteRequestBody`. It was missing until
>    2026-08-27, which made the endpoint return 403 for every USER principal.
> 3. **`POST /v1/execute` returns the RAW piece action output.** There is no
>    `{ success, output, error, standardOutput }` envelope; the response schema is `z.unknown()`.
>    HTTP status is the only success signal. Any `success` field in the body belongs to the action.
> 4. **Connections are served at `/v1/connections`, not `/v1/app-connections`.**
>    `app-connections` is only an OpenAPI tag; no route is registered under that path and requests to
>    it return 404. Affected: list, get, create, update, delete, `oauth2/authorization-url`.
> 5. **`GET /v1/executions/:id`, `/:id/tool-calls` and `/:id/events` take no `projectId`.** As of
>    2026-08-27 they resolve the tenant from `ExecutionEntity` (`ProjectResourceType.TABLE`).
>    The same applies to every `/v1/trigger-bindings/:id*` and `/v1/scheduled-tasks/:id*` route.
>    Before that fix all of these routes returned 403 for USER principals.
> 6. **`GET /v1/trigger-bindings` and `GET /v1/scheduled-tasks` require `?projectId=`;
>    their `POST /` counterparts require `projectId` in the body.**
> 7. **`GET /v1/executions/:id/events` cannot be consumed with `EventSource`.** It authenticates from
>    the `Authorization` header. Use `fetch` + `ReadableStream`. Frames are `data: <json>\n\n` only —
>    no `event:`, `id:`, `retry:`, heartbeat, terminal sentinel, or replay of prior events.
> 8. **`POST /mcp` does not exist.** The MCP protocol transport and the MCP OAuth authorize/approve
>    flow were removed with the legacy runtime. Only `/v1/projects/:projectId/mcp-server` and its
>    `rotate` / `token` actions are served, and only since `mcpServerModule` was registered in
>    `app.ts` on 2026-08-27 — before that the whole MCP surface returned 404.
> 9. **Cursor pagination on `/v1/executions` is accepted by the schema and ignored by the service.**
>    `next` and `previous` are always `null`.
> 10. **Execution status never leaves `CREATED`.** `executionService.updateStatus` has no callers, and
>     nothing writes `tool_call` rows, so `/:id/tool-calls` always returns `[]`.

**Backend Specification Version:** Verified against `packages/server/api` (`main` / `ff0599cf95`)  
**Base URL:** `/v1`  
**Authentication Scheme:** `Authorization: Bearer <JWT_TOKEN>` with tenant isolation header `x-project-id` or project context.

---

## 1. Direct Execution API

Executes any tool/action directly on HeadlessRuntime with managed credentials.

### `POST /v1/execute`
- **Security:** `PrincipalType.USER | ENGINE | SERVICE`, Permission: `WRITE_APP_CONNECTION`
- **Request Body:**
  ```typescript
  {
    integration: string;   // e.g. "@inboxfm-connect/piece-github" or "github"
    tool: string;          // e.g. "create_issue" or "raw_http"
    connectionId: string;  // ID of the configured AppConnection
    input: Record<string, unknown>; // Schema-driven input properties
  }
  ```
- **Response Body (200 OK):**
  ```typescript
  // EngineResponse<unknown>
  {
    success: boolean;
    output?: unknown;      // The JSON output payload returned by the integration
    error?: string;        // Error message if execution failed
    standardOutput?: string;
  }
  ```

---

## 2. Integrations & Metadata API

Discovers available integrations (pieces), actions, triggers, and authentication schemas.

### `GET /v1/integrations`
- **Security:** Public / All Principals
- **Query Parameters:**
  - `searchQuery?: string`
  - `categories?: PieceCategory[]` (e.g. `COMMUNICATION`, `DEVELOPER_TOOLS`, `PRODUCTIVITY`, `CRM`, `STORAGE`)
  - `sortBy?: 'NAME' | 'POPULARITY'`
  - `orderBy?: 'ASC' | 'DESC'`
  - `suggestionType?: 'ACTION' | 'TRIGGER'`
- **Response Body (200 OK):** `PieceMetadataModelSummary[]`
  ```typescript
  Array<{
    name: string;              // e.g. "@inboxfm-connect/piece-github"
    displayName: string;       // e.g. "GitHub"
    logoUrl: string;
    description: string;
    version: string;
    auth?: PieceAuthProperty;
    actions: number;           // Count of available actions/tools
    triggers: number;          // Count of available triggers
    categories: PieceCategory[];
  }>
  ```

### `GET /v1/integrations/categories`
- **Security:** Public
- **Response Body (200 OK):** `string[]` (Enum values of all categories)

### `GET /v1/integrations/:name` & `GET /v1/integrations/:scope/:name`
- **Security:** Public / All Principals
- **Query Parameters:** `version?: string`
- **Response Body (200 OK):** `PieceMetadataModel`
  ```typescript
  {
    name: string;
    displayName: string;
    logoUrl: string;
    description: string;
    version: string;
    auth?: PieceAuthProperty;
    actions: Record<string, {
      name: string;
      displayName: string;
      description: string;
      props: Record<string, PieceProperty>;
      requireAuth?: boolean;
    }>;
    triggers: Record<string, {
      name: string;
      displayName: string;
      description: string;
      type: 'POLLING' | 'WEBHOOK';
      props: Record<string, PieceProperty>;
      sampleData?: unknown;
    }>;
  }
  ```

### `POST /v1/integrations/options`
- **Security:** `PrincipalType.USER` (`ProjectResourceType.BODY`)
- **Request Body:**
  ```typescript
  {
    pieceName: string;
    pieceVersion: string;
    actionOrTriggerName: string;
    propertyName: string;
    input: Record<string, unknown>;
    searchValue?: string;
  }
  ```
- **Response Body (200 OK):** `DropdownOptions` (`{ disabled?: boolean, placeholder?: string, options: Array<{ label: string, value: unknown }> }`)

---

## 3. Connections API

Manages user credentials, OAuth tokens, and API keys.

### `GET /v1/app-connections`
- **Security:** `PrincipalType.USER`, Permission: `READ_APP_CONNECTION`
- **Query Parameters:**
  - `pieceName?: string`
  - `displayName?: string`
  - `status?: 'ACTIVE' | 'ERROR'`
  - `cursor?: string`
  - `limit?: number`
- **Response Body (200 OK):** `SeekPage<AppConnectionWithoutSensitiveData>`
  ```typescript
  {
    data: Array<{
      id: string;
      created: string;
      updated: string;
      displayName: string;
      pieceName: string;
      pieceVersion: string;
      type: 'OAUTH2' | 'SECRET_TEXT' | 'BASIC_AUTH' | 'CUSTOM_AUTH';
      status: 'ACTIVE' | 'ERROR';
      externalId?: string;
      projectIds: string[];
    }>;
    next: string | null;
    previous: string | null;
  }
  ```

### `POST /v1/app-connections`
- **Security:** `PrincipalType.USER`, Permission: `WRITE_APP_CONNECTION`
- **Request Body:**
  ```typescript
  {
    displayName: string;
    pieceName: string;
    pieceVersion: string;
    type: 'OAUTH2' | 'SECRET_TEXT' | 'BASIC_AUTH' | 'CUSTOM_AUTH';
    value: Record<string, unknown>;
    externalId?: string;
    metadata?: Record<string, unknown>;
  }
  ```
- **Response Body (201 Created):** `AppConnectionWithoutSensitiveData`

### `POST /v1/app-connections/oauth2/authorization-url`
- **Security:** `PrincipalType.USER`, Permission: `WRITE_APP_CONNECTION`
- **Request Body:**
  ```typescript
  {
    pieceName: string;
    props?: Record<string, unknown>;
    redirectUrl: string;
  }
  ```
- **Response Body (200 OK):** `{ authorizationUrl: string }`

### `DELETE /v1/app-connections/:id`
- **Security:** `PrincipalType.USER`, Permission: `WRITE_APP_CONNECTION`
- **Response Body (204 No Content)**

---

## 4. Trigger Bindings API

Configures event-driven headless executions.

### `GET /v1/trigger-bindings`
- **Security:** `PrincipalType.USER | SERVICE`, Permission: `READ_RUN`
- **Response Body (200 OK):** `TriggerBinding[]`

### `POST /v1/trigger-bindings`
- **Security:** `PrincipalType.USER | SERVICE`, Permission: `WRITE_RUN`
- **Request Body:**
  ```typescript
  {
    pieceName: string;
    pieceVersion: string;
    triggerName: string;
    connectionId: string | null;
    promptTemplate: string;     // Instructions for headless tool invocation on event
    settings: Record<string, unknown>;
    propertySettings?: Record<string, unknown>;
    status?: 'ENABLED' | 'DISABLED';
  }
  ```
- **Response Body (201 Created):** `TriggerBinding`

### `POST /v1/trigger-bindings/:id` (Update)
- **Security:** `PrincipalType.USER | SERVICE`, Permission: `WRITE_RUN`
- **Request Body:** `UpdateTriggerBindingRequest`

### `DELETE /v1/trigger-bindings/:id`
- **Security:** `PrincipalType.USER | SERVICE`, Permission: `WRITE_RUN`
- **Response Body (204 No Content)**

### `POST /v1/trigger-bindings/:id/enable` & `POST /v1/trigger-bindings/:id/disable`
- **Response Body (200 OK):** `TriggerBinding`

### `POST /v1/trigger-bindings/:id/run` (Webhook execution simulation)
- **Security:** Public / Webhook
- **Request Body:** `Record<string, unknown>` (Event payload)
- **Response Body (200 OK):** `Execution`

---

## 5. Scheduled Tasks API

Configures time-based scheduled tool executions.

### `GET /v1/scheduled-tasks`
- **Security:** `PrincipalType.USER | SERVICE`, Permission: `READ_RUN`
- **Response Body (200 OK):** `ScheduledTask[]`

### `POST /v1/scheduled-tasks`
- **Security:** `PrincipalType.USER | SERVICE`, Permission: `WRITE_RUN`
- **Request Body:**
  ```typescript
  {
    prompt: string;             // Headless execution prompt/task
    cronExpression: string;     // Standard 5-field cron (e.g. "0 8 * * *")
    timezone?: string;          // Default "UTC"
    status?: 'ENABLED' | 'DISABLED';
  }
  ```
- **Response Body (201 Created):** `ScheduledTask`

### `POST /v1/scheduled-tasks/:id` (Update)
- **Security:** `PrincipalType.USER | SERVICE`, Permission: `WRITE_RUN`
- **Request Body:** `UpdateScheduledTaskRequest`

### `DELETE /v1/scheduled-tasks/:id`
- **Response Body (204 No Content)**

### `POST /v1/scheduled-tasks/:id/run` ("Run Now")
- **Response Body (200 OK):** `Execution`

---

## 6. MCP Server API

Exposes project integrations and tools to AI agents via Model Context Protocol.

### `GET /v1/mcp`
- **Security:** `PrincipalType.USER`, Permission: `READ_MCP`
- **Response Body (200 OK):** `McpServerPopulated` (MCP server details, token status, tool list)

### `POST /v1/mcp`
- **Security:** `PrincipalType.USER`, Permission: `WRITE_MCP`
- **Request Body:** `{ disabledTools: string[] }`
- **Response Body (200 OK):** `McpServer`

### `POST /v1/mcp/rotate`
- **Security:** `PrincipalType.USER`, Permission: `WRITE_MCP`
- **Response Body (200 OK):** `McpServer`

### `POST /v1/mcp/token`
- **Security:** `PrincipalType.USER`, Permission: `READ_MCP`
- **Response Body (200 OK):**
  ```typescript
  {
    mcpServerUrl: string;       // e.g. "https://api.inboxfm.com/mcp"
    mcpToken: string;           // Bearer token for AI agent client
  }
  ```

---

## 7. Activity & Executions API

Observability and execution logs.

### `GET /v1/executions`
- **Security:** `PrincipalType.USER | SERVICE`, Permission: `READ_RUN`
- **Query Parameters:** `{ status?: 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED', limit?: number, cursor?: string }`
- **Response Body (200 OK):** `{ data: Execution[], next: string | null, previous: string | null }`

### `GET /v1/executions/:id`
- **Response Body (200 OK):** `Execution` (`id, status, prompt, metadata, tokenUsage, cost, finishTime, created, updated`)

### `GET /v1/executions/:id/tool-calls`
- **Response Body (200 OK):** `ToolCall[]`
  ```typescript
  Array<{
    id: string;
    executionId: string;
    pieceName: string;
    pieceVersion: string;
    actionName: string;
    input: Record<string, unknown>;
    output?: unknown;
    status: 'SUCCEEDED' | 'FAILED';
    error?: string;
    latencyMs: number;
    created: string;
  }>
  ```

### `GET /v1/executions/:id/events` (Live SSE Stream)
- **Response Headers:** `Content-Type: text/event-stream`
- **Stream Event Types:** `ExecutionStarted`, `PlannerStarted`, `ToolStarted`, `ToolFinished`, `ToolFailed`, `ExecutionCompleted`, `ExecutionFailed`, `ExecutionCancelled`

---

## 8. Knowledge & Semantic Tool Search API

### `POST /v1/knowledge-search/query`
- **Security:** Public / Authenticated Principal
- **Request Body:**
  ```typescript
  {
    query: string;
    limit?: number;
    objectKind?: 'action' | 'trigger' | 'all';
    pieceName?: string;
  }
  ```
- **Response Body (200 OK):**
  ```typescript
  {
    results: Array<{
      pieceName: string;
      objectName: string;
      objectKind: 'action' | 'trigger';
      displayName: string;
      oneLineDescription?: string;
      requiresConnection: boolean;
      cosine?: number;
      connected?: boolean;
    }>;
    mode: 'semantic' | 'keyword';
  }
  ```
