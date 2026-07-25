# Renaming Plan: Standalone Integration SDK

This plan details the systematic renaming of all Activepieces-specific naming conventions across namespaces, types, classes, folders, and exported symbols. Our goal is to sanitize the public SDK surface so that the resulting framework acts as a completely independent, white-labeled Integration Platform SDK.

---

## 1. Naming Mapping Table

| Old Name | New Name | Impact Level |
| :--- | :--- | :--- |
| `Piece` | `Integration` | Core SDK / Public Interface |
| `createPiece` | `createIntegration` | Core SDK / Public Interface |
| `PieceAuth` | `IntegrationAuth` | Authentication Interfaces |
| `PieceAuthProperty` | `IntegrationAuthProperty` | Authentication Properties |
| `PieceMetadata` | `IntegrationMetadata` | Metadata Registry |
| `PieceBase` | `IntegrationBase` | Base Interfaces |
| `PieceCategory` | `IntegrationCategory` | Categories |
| `PiecePropertyMap` | `IntegrationPropertyMap` | Properties Map |
| `PieceLoader` | `IntegrationLoader` | Server Loaders |
| `PieceHelper` | `IntegrationHelper` | Execution Helper |
| `AppConnection` | `Connection` | Database and API Models |
| `AppConnectionType` | `ConnectionType` | Database and API Models |
| `AppConnectionValue` | `ConnectionValue` | Core Encryption/Storage |
| `EngineOperationType` | `RuntimeOperationType` | Secure Sandbox Contexts |
| `EngineResponse` | `RuntimeResponse` | Sandbox Execution Results |
| `ActivepiecesError` | `PlatformError` | System Errors |
| `/v1/pieces` (Route) | `/v1/integrations` | REST API Routing |
| `/v1/app-connections` (Route) | `/v1/connections` | REST API Routing |

---

## 2. Detailed Renaming Specification

### Core SDK / Developer Surface

#### `Piece` → `Integration`
*   **Reason**: The term "Piece" is specific to the Activepieces workflow block model. In a headless environment, developers construct "Integrations" that hold one or more runnable "Tools".
*   **Migration Complexity**: High (referenced in every integration catalog folder under `packages/pieces/*`).
*   **Affected Files**:
    *   `packages/pieces/framework/src/lib/piece.ts`
    *   `packages/pieces/framework/src/lib/piece-metadata.ts`
    *   `packages/pieces/community/*` (all community pieces declarations)

#### `createPiece` → `createIntegration`
*   **Reason**: Developer-facing factory function for declaring an integration.
*   **Migration Complexity**: High (used at the entry point of every integration).
*   **Affected Files**:
    *   `packages/pieces/framework/src/lib/piece.ts`
    *   `packages/pieces/community/*/src/index.ts`

#### `PieceAuth` / `PieceAuthProperty` → `IntegrationAuth` / `IntegrationAuthProperty`
*   **Reason**: Renames developer-facing authorization objects (OAuth2, Secret Token, Custom Auth) to align with standard integration patterns.
*   **Migration Complexity**: Medium.
*   **Affected Files**:
    *   `packages/pieces/framework/src/lib/property/authentication.ts`
    *   `packages/pieces/framework/src/lib/context/index.ts`
    *   `packages/pieces/framework/src/lib/action/action.ts`

#### `PieceMetadata` / `PieceBase` → `IntegrationMetadata` / `IntegrationBase`
*   **Reason**: Standardizes metadata payload representations used for listing tools in AI applications.
*   **Migration Complexity**: Medium.
*   **Affected Files**:
    *   `packages/pieces/framework/src/lib/piece-metadata.ts`
    *   `packages/core/shared/src/lib/automation/pieces/piece.ts`

---

### Runtime / Execution Environment

#### `EngineOperationType` → `RuntimeOperationType`
*   **Reason**: Rebrands internal sandbox engine instructions (like execution and property loading) to the generic sandbox runtime.
*   **Migration Complexity**: Medium (needs matching mappings in both the CLI worker, engine executor, and Fastify server).
*   **Affected Files**:
    *   `packages/core/execution/src/lib/engine/engine-operation.ts`
    *   `packages/server/engine/src/lib/operations/index.ts`
    *   `packages/server/api/src/app/workers/job/index.ts`

#### `EngineResponse` / `EngineResponseStatus` → `RuntimeResponse` / `RuntimeResponseStatus`
*   **Reason**: Standardizes execution output returned by the sandbox isolate.
*   **Migration Complexity**: Low.
*   **Affected Files**:
    *   `packages/core/shared/src/lib/common/engine-response.ts`
    *   `packages/server/engine/src/lib/operations/index.ts`

#### `PieceHelper` / `PieceLoader` → `IntegrationHelper` / `IntegrationLoader`
*   **Reason**: Aligns runtime loaders and resolvers (which read, index, and load integration actions) with the headless architecture naming.
*   **Migration Complexity**: Medium.
*   **Affected Files**:
    *   `packages/server/engine/src/lib/helper/piece-helper.ts`
    *   `packages/server/engine/src/lib/helper/piece-loader.ts`

---

### Database / API Surface

#### `AppConnection` → `Connection`
*   **Reason**: Cleans the "AppConnection" table naming to a simple, generic "Connection" model.
*   **Migration Complexity**: High (requires TypeORM Entity rename, migration file creation, and database columns updates).
*   **Affected Files**:
    *   `packages/server/api/src/app/app-connection/app-connection.entity.ts`
    *   `packages/server/api/src/app/app-connection/app-connection-service/*`
    *   `packages/core/shared/src/lib/automation/app-connection/*`

#### `ActivepiecesError` → `PlatformError`
*   **Reason**: Removes Activepieces references from the core error handling class that gets returned to users via REST JSON error structures.
*   **Migration Complexity**: Medium.
*   **Affected Files**:
    *   `packages/core/utils/src/lib/activepieces-error.ts`
    *   Import references in API controllers and engine handlers.

#### `/v1/pieces` → `/v1/integrations`
*   **Reason**: Rebrands the REST endpoint used to list, install, and sync integration catalogs.
*   **Migration Complexity**: Low.
*   **Affected Files**:
    *   `packages/server/api/src/app/pieces/piece.module.ts`
    *   REST API clients/requests.

#### `/v1/app-connections` → `/v1/connections`
*   **Reason**: Clean API pathing for connection resource CRUD.
*   **Migration Complexity**: Low.
*   **Affected Files**:
    *   `packages/server/api/src/app/app-connection/app-connection.module.ts`
