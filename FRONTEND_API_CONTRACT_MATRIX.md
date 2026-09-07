# Frontend API Contract Matrix: InboxFM Connect

This matrix documents all active backend endpoints available for consumption by the InboxFM Connect frontend. All contracts are verified against `packages/server/api` source code on branch `main` (`ff0599cf95`).

---

## 1. Direct Execution & Tool Execution

| Endpoint | Method | Request Schema | Response Schema | Auth / Security | Frontend Consumer | Status |
| :--- | :---: | :--- | :--- | :--- | :--- | :--- |
| `/v1/execute` | `POST` | `{ integration: string, tool: string, connectionId: string, input: Record<string, unknown> }` | `EngineResponse<unknown>` (tool result object) | Project User/Service (`WRITE_APP_CONNECTION`) | Direct Tool Runner / Test Step | **ACTIVE** |

---

## 2. Executions & Live Event Stream

| Endpoint | Method | Request Schema | Response Schema | Auth / Security | Frontend Consumer | Status |
| :--- | :---: | :--- | :--- | :--- | :--- | :--- |
| `/v1/executions` | `POST` | `{ prompt: string, metadata?: Record<string, unknown>, projectId?: string }` | `Execution` | Project User/Service (`WRITE_RUN`) | Interactive Prompt / Execution Trigger | **ACTIVE** |
| `/v1/executions` | `GET` | Querystring: `{ status?: ExecutionStatus, limit?: number, cursor?: string }` | `{ data: Execution[], next: string \| null, previous: string \| null }` | Project User/Service (`READ_RUN`) | Executions History Table | **ACTIVE** |
| `/v1/executions/:id` | `GET` | Params: `{ id: string }` | `Execution` (`id, status, prompt, metadata, tokenUsage, cost, finishTime, created, updated`) | Project User/Service (`READ_RUN`) | Execution Details Page | **ACTIVE** |
| `/v1/executions/:id/tool-calls` | `GET` | Params: `{ id: string }` | `ToolCall[]` (`id, executionId, pieceName, pieceVersion, actionName, input, output, status, error, latencyMs`) | Project User/Service (`READ_RUN`) | Execution Step Breakdown / Audit Log | **ACTIVE** |
| `/v1/executions/:id/events` | `GET` | Params: `{ id: string }` | `text/event-stream` SSE (`ExecutionStarted`, `PlannerStarted`, `ToolStarted`, `ToolFinished`, `ToolFailed`, `ExecutionCompleted`, `ExecutionFailed`, `ExecutionCancelled`) | Project User/Service (`READ_RUN`) | Live Execution Timeline / Event Streamer | **ACTIVE** |

---

## 3. Automations: Trigger Bindings

| Endpoint | Method | Request Schema | Response Schema | Auth / Security | Frontend Consumer | Status |
| :--- | :---: | :--- | :--- | :--- | :--- | :--- |
| `/v1/trigger-bindings` | `POST` | `CreateTriggerBindingRequest` (`pieceName, pieceVersion, triggerName, connectionId, promptTemplate, settings, propertySettings, status?`) | `TriggerBinding` | Project User/Service (`WRITE_RUN`) | New Trigger Binding Modal / Page | **ACTIVE** |
| `/v1/trigger-bindings` | `GET` | Querystring: `{}` | `TriggerBinding[]` | Project User/Service (`READ_RUN`) | Automations: Triggers List | **ACTIVE** |
| `/v1/trigger-bindings/:id` | `GET` | Params: `{ id: string }` | `TriggerBinding` | Project User/Service (`READ_RUN`) | Trigger Binding Details / Edit Form | **ACTIVE** |
| `/v1/trigger-bindings/:id` | `POST` | Params: `{ id: string }`, Body: `UpdateTriggerBindingRequest` | `TriggerBinding` | Project User/Service (`WRITE_RUN`) | Edit Trigger Binding Form | **ACTIVE** |
| `/v1/trigger-bindings/:id` | `DELETE`| Params: `{ id: string }` | `204 No Content` | Project User/Service (`WRITE_RUN`) | Delete Trigger Binding Action | **ACTIVE** |
| `/v1/trigger-bindings/:id/enable` | `POST` | Params: `{ id: string }` | `TriggerBinding` | Project User/Service (`WRITE_RUN`) | Toggle Switch / Status Action | **ACTIVE** |
| `/v1/trigger-bindings/:id/disable` | `POST` | Params: `{ id: string }` | `TriggerBinding` | Project User/Service (`WRITE_RUN`) | Toggle Switch / Status Action | **ACTIVE** |
| `/v1/trigger-bindings/:id/renew` | `POST` | Params: `{ id: string }` | `TriggerBinding` | Project User/Service (`WRITE_RUN`) | Webhook Renewal Action | **ACTIVE** |
| `/v1/trigger-bindings/:id/run` | `POST` | Params: `{ id: string }`, Body: `Record<string, unknown>` | `Execution` | Public / Webhook Endpoint | Webhook Simulation / Test Trigger | **ACTIVE** |

---

## 4. Automations: Scheduled Tasks

| Endpoint | Method | Request Schema | Response Schema | Auth / Security | Frontend Consumer | Status |
| :--- | :---: | :--- | :--- | :--- | :--- | :--- |
| `/v1/scheduled-tasks` | `POST` | `CreateScheduledTaskRequest` (`prompt, cronExpression, timezone?, status?`) | `ScheduledTask` | Project User/Service (`WRITE_RUN`) | New Schedule Modal / Page | **ACTIVE** |
| `/v1/scheduled-tasks` | `GET` | Querystring: `{}` | `ScheduledTask[]` | Project User/Service (`READ_RUN`) | Automations: Schedules List | **ACTIVE** |
| `/v1/scheduled-tasks/:id` | `GET` | Params: `{ id: string }` | `ScheduledTask` | Project User/Service (`READ_RUN`) | Schedule Details / Edit Form | **ACTIVE** |
| `/v1/scheduled-tasks/:id` | `POST` | Params: `{ id: string }`, Body: `UpdateScheduledTaskRequest` | `ScheduledTask` | Project User/Service (`WRITE_RUN`) | Edit Schedule Form | **ACTIVE** |
| `/v1/scheduled-tasks/:id` | `DELETE`| Params: `{ id: string }` | `204 No Content` | Project User/Service (`WRITE_RUN`) | Delete Schedule Action | **ACTIVE** |
| `/v1/scheduled-tasks/:id/run` | `POST` | Params: `{ id: string }` | `Execution` | Project User/Service (`WRITE_RUN`) | "Run Now" Manual Trigger | **ACTIVE** |

---

## 5. Connections Management

| Endpoint | Method | Request Schema | Response Schema | Auth / Security | Frontend Consumer | Status |
| :--- | :---: | :--- | :--- | :--- | :--- | :--- |
| `/v1/app-connections` | `POST` | `UpsertAppConnectionRequestBody` (`displayName, pieceName, pieceVersion, type, value, externalId?, metadata?`) | `AppConnectionWithoutSensitiveData` | Project User (`WRITE_APP_CONNECTION`) | Create / Reconnect Connection Dialog | **ACTIVE** |
| `/v1/app-connections/:id`| `POST` | `UpdateConnectionValueRequestBody` (`displayName?, metadata?`) | `AppConnectionWithoutSensitiveData` | Project User (`WRITE_APP_CONNECTION`) | Edit Connection Metadata Dialog | **ACTIVE** |
| `/v1/app-connections` | `GET` | Querystring: `{ pieceName?, displayName?, status?, scope?, cursor?, limit? }` | `SeekPage<AppConnectionWithoutSensitiveData>` | Project User (`READ_APP_CONNECTION`) | Connections Table & Connection Selectors | **ACTIVE** |
| `/v1/app-connections/:id`| `GET` | Params: `{ id: string }` | `AppConnectionWithoutSensitiveData` | Project User (`READ_APP_CONNECTION`) | Connection Detail View | **ACTIVE** |
| `/v1/app-connections/:id`| `DELETE`| Params: `{ id: string }` | `204 No Content` | Project User (`WRITE_APP_CONNECTION`) | Delete Connection Action | **ACTIVE** |
| `/v1/app-connections/oauth2/authorization-url` | `POST` | `GetOAuth2AuthorizationUrlRequestBody` (`pieceName, props, redirectUrl`) | `GetOAuth2AuthorizationUrlResponse` (`authorizationUrl`) | Project User (`WRITE_APP_CONNECTION`) | OAuth Popup Initiator | **ACTIVE** |

---

## 6. Integrations & Piece Metadata

| Endpoint | Method | Request Schema | Response Schema | Auth / Security | Frontend Consumer | Status |
| :--- | :---: | :--- | :--- | :--- | :--- | :--- |
| `/v1/integrations` | `GET` | Querystring: `{ searchQuery?, categories?, includeTags?, sortBy?, orderBy?, suggestionType? }` | `PieceMetadataModelSummary[]` | Unscoped / All Principal Types | Integrations Marketplace / Directory | **ACTIVE** |
| `/v1/integrations/categories` | `GET` | Querystring: `{}` | `PieceCategory[]` | Public | Integrations Filter Tabs | **ACTIVE** |
| `/v1/integrations/:name` | `GET` | Params: `{ name: string }`, Querystring: `{ version? }` | `PieceMetadataModel` (includes `actions`, `triggers`, `auth`) | Unscoped / All Principal Types | Tool & Trigger Inspector / Config Panel | **ACTIVE** |
| `/v1/integrations/:scope/:name` | `GET` | Params: `{ scope: string, name: string }`, Querystring: `{ version? }` | `PieceMetadataModel` | Unscoped / All Principal Types | Scoped Piece Metadata Inspector | **ACTIVE** |
| `/v1/integrations/options` | `POST` | `PieceOptionRequest` (`pieceName, pieceVersion, actionOrTriggerName, propertyName, input, searchValue?`) | `EngineResponse<DropdownOptions>` | Project User | Dynamic Form Property Dropdowns | **ACTIVE** |
| `/v1/integrations/sync` | `POST` | `{}` | `void` | Platform Admin | Manual Piece Sync Action | **ACTIVE** |

---

## 7. Knowledge & Tool Search

| Endpoint | Method | Request Schema | Response Schema | Auth / Security | Frontend Consumer | Status |
| :--- | :---: | :--- | :--- | :--- | :--- | :--- |
| `/v1/knowledge-search/query` | `POST` | `{ query: string, limit?: number, objectKind?: 'action' \| 'trigger' \| 'all', pieceName?: string }` | `{ results: KnowledgeSearchResultItem[], mode: 'semantic' \| 'keyword' }` | Public Platform Principal | Global Tool Search / Command Bar | **ACTIVE** |

---

## 8. Authentication & Platform Identity

| Endpoint | Method | Request Schema | Response Schema | Auth / Security | Frontend Consumer | Status |
| :--- | :---: | :--- | :--- | :--- | :--- | :--- |
| `/v1/authentication/sign-in` | `POST` | `SignInRequest` (`email, password`) | `AuthenticationResponse` (`user, token, projectId`) | Public | Sign-In Screen | **ACTIVE** |
| `/v1/authentication/sign-up` | `POST` | `SignUpRequest` (`email, password, firstName, lastName, trackEvents`) | `AuthenticationResponse` | Public | Sign-Up Screen | **ACTIVE** |
| `/v1/users/me` | `GET` | `{}` | `UserWithMetaInformation` | Authenticated Principal | Current User Session Context | **ACTIVE** |
| `/v1/flags` | `GET` | `{}` | `Record<string, unknown>` | Public | Feature Flags & System Capabilities | **ACTIVE** |
| `/v1/projects` | `GET` | `{}` | `SeekPage<ProjectWithLimits>` | Authenticated Principal | Project Switcher | **ACTIVE** |
| `/v1/ai-providers` | `GET` | `{}` | `AiProvider[]` | Project/Platform Principal | AI Model Settings & Status | **ACTIVE** |
