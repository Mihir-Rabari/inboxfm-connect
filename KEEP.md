# Retained Subsystems and Components (KEEP)

This document identifies the minimal reusable components from the existing codebase that will be kept and refactored to implement the headless Integration Platform for AI agent tool execution.

---

## 1. Core Utilities & Outbound Safety (SSRF)

These utility packages form the foundations of the type definition and network security:

| Package / File | Purpose | Why It is Kept |
| :--- | :--- | :--- |
| [`packages/core/utils`](file:///K:/Projects/activepieces/packages/core/utils) | Base TypeScript utilities | Retains critical error wrappers like `ActivepiecesError`, ID generators (`apId`), assertions, and basic utilities (`tryCatch`). |
| [`packages/core/piece-types`](file:///K:/Projects/activepieces/packages/core/piece-types) | Fundamental Piece definitions | Pruned to contain only `AppConnectionType`, `OAuth2GrantType`, and type schemas for connection values. Trigger/Execution definitions are deleted. |
| [`packages/server/utils`](file:///K:/Projects/activepieces/packages/server/utils) | Server network security | Retains [`safeHttp`](file:///K:/Projects/activepieces/packages/server/utils/src/lib/safe-http.ts) wrapping Axios with `request-filtering-agent` to shield outbound tool requests from SSRF attacks. |

---

## 2. Credentials Encryption & OAuth Services

The underlying cryptography and token claim/refresh math is preserved:

- **Secret Encryption**: [`packages/server/api/src/app/helper/encryption.ts`](file:///K:/Projects/activepieces/packages/server/api/src/app/helper/encryption.ts) (`encryptUtils`) which uses `aes-256-cbc` to encrypt connection values.
- **OAuth Services**:
  - [`oauth2-util.ts`](file:///K:/Projects/activepieces/packages/server/api/src/app/app-connection/app-connection-service/oauth2/oauth2-util.ts): OAuth token parsing, PKCE validation, state validation, and authorization URL formatting.
  - [`credentials-oauth2-service.ts`](file:///K:/Projects/activepieces/packages/server/api/src/app/app-connection/app-connection-service/oauth2/services/credentials-oauth2-service.ts): Claiming and refreshing OAuth 2.0 tokens from dynamic endpoints.

---

## 3. Database Connection & Schema (Pruned Models)

Only models managing users, connections, platforms, projects, and piece files are retained:

- **Tenants**:
  - Platform: [`packages/server/api/src/app/platform/platform.entity.ts`](file:///K:/Projects/activepieces/packages/server/api/src/app/platform/platform.entity.ts)
  - Project (optional): [`packages/server/api/src/app/project/project-entity.ts`](file:///K:/Projects/activepieces/packages/server/api/src/app/project/project-entity.ts)
- **Users**:
  - Identity: [`packages/server/api/src/app/authentication/user-identity/user-identity-entity.ts`](file:///K:/Projects/activepieces/packages/server/api/src/app/authentication/user-identity/user-identity-entity.ts)
  - Role: [`packages/server/api/src/app/user/user-entity.ts`](file:///K:/Projects/activepieces/packages/server/api/src/app/user/user-entity.ts)
- **Credential Storage**:
  - Connections: [`packages/server/api/src/app/app-connection/app-connection.entity.ts`](file:///K:/Projects/activepieces/packages/server/api/src/app/app-connection/app-connection.entity.ts)
- **Piece Files**:
  - File Binary Store: [`packages/server/api/src/app/file/file.entity.ts`](file:///K:/Projects/activepieces/packages/server/api/src/app/file/file.entity.ts) (Required to store dynamic custom integrations archives).

---

## 4. Sandbox Isolated Runtime (No Queues)

To maintain security, tool execution must run isolated to prevent dynamic user-loaded integrations from accessing database configuration keys or internal files.

- **Sandbox Manager**: [`packages/server/sandbox/src/lib/sandbox.ts`](file:///K:/Projects/activepieces/packages/server/sandbox/src/lib/sandbox.ts) and [`packages/server/sandbox/src/lib/sandbox/sandbox.ts`](file:///K:/Projects/activepieces/packages/server/sandbox/src/lib/sandbox/sandbox.ts) (Orchestrates starting a separate sandbox process).
- **Process Forking**: [`packages/server/sandbox/src/lib/sandbox/fork.ts`](file:///K:/Projects/activepieces/packages/server/sandbox/src/lib/sandbox/fork.ts) (Uses Node's `child_process.fork` with memory and CPU limit parameters).
- **Engine Core**: [`packages/server/engine/src/main.ts`](file:///K:/Projects/activepieces/packages/server/engine/src/main.ts) (The execution context. Reworked to receive a single execution instruction directly via socket/IPC, execute the tool, and exit).
