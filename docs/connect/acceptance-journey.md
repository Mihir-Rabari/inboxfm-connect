# Connect Acceptance Journey & Multi-Tenant Isolation Guide

## 1. Overview & Architecture

The Connect Acceptance Journey enables external consumers (applications, SaaS platforms, agents) to let their end-users securely connect third-party integrations (such as Slack, Google Workspace, GitHub, or custom services) without exposing developer API keys, platform secrets, or credentials across customer boundaries.

```
+-----------------------------------------------------------------------------------------------+
|                                      PLATFORM OPERATOR                                        |
|  - Configures Platform OAuth App credentials once: POST /v1/connect-oauth-apps                |
|  - Credentials stored encrypted in connect_oauth_app (never exposed to browser or tenant)    |
+-----------------------------------------------------------------------------------------------+
                                                |
                                                v
+-----------------------------------------------------------------------------------------------+
|                                      TENANT / DEVELOPER                                       |
|  - Holds Project Connect API Key (cak-...)                                                    |
|  - Creates Connect Sessions for external users: POST /v1/connect-sessions                     |
|  - Restricts session lifetime (TTL), allowedPieceNames, and externalUserId                    |
+-----------------------------------------------------------------------------------------------+
                                                |
                                                v
+-----------------------------------------------------------------------------------------------+
|                                    END-USER BROWSER / CLIENT                                  |
|  - Holds ephemeral public session token (cs-...)                                              |
|  - Fetches public session metadata: GET /v1/connect-sessions/:token                           |
|  - Requests OAuth authorization URL: POST /v1/connect-sessions/:token/oauth2/authorization-url|
|  - Redeems token to create connection: POST /v1/connect-sessions/:token/connections           |
|  - Session token is atomically consumed (single-use)                                          |
+-----------------------------------------------------------------------------------------------+
                                                |
                                                v
+-----------------------------------------------------------------------------------------------+
|                                     EXECUTION & ISOLATION                                     |
|  - Tenant backend executes actions: POST /v1/execute                                          |
|  - Identifies connection by externalUserId or explicit connectionId                           |
|  - Strict multi-tenant verification: project scope, externalUserId match, pieceName match     |
|  - Complete connection revocation: DELETE /v1/connections/:id                                 |
+-----------------------------------------------------------------------------------------------+
```

---

## 2. Supported Providers & Catalog Versions

The acceptance suite verifies both OAuth2 flows and direct Secret Text credentials using production catalog pieces:

| Piece Name | Version | Auth Type | Validation & Scopes |
| --- | --- | --- | --- |
| `@inboxfm-connect/piece-slack` | `0.17.3` | `PLATFORM_OAUTH2` | Operator-managed OAuth2 client ID/secret, user consent, scope unioning |
| `@inboxfm-connect/piece-text-helper` | `0.5.1` | `SECRET_TEXT` | Pure execution tool (`concat`, `split`), zero external network dependency |

---

## 3. Step-by-Step Acceptance Journey

### Step 1: Platform Operator Configures Managed OAuth App
The platform operator registers OAuth client credentials for third-party providers at the platform level:
```http
POST /api/v1/connect-oauth-apps
Authorization: Bearer <PlatformAdminToken>
Content-Type: application/json

{
  "pieceName": "@inboxfm-connect/piece-slack",
  "clientId": "operator-slack-client-id-12345",
  "clientSecret": "operator-slack-client-secret-xyz987"
}
```
*Security Invariant*: `clientSecret` is immediately encrypted at rest using AES-256-GCM. End-users and tenant backends never see or hold the client secret.

### Step 2: Tenant Service Obtains Project Connect API Key
The consumer developer obtains a Connect API key scoped to their project:
```http
POST /api/v1/connect-api-keys
Authorization: Bearer <PlatformAdminToken>
Content-Type: application/json

{
  "projectId": "proj_123",
  "name": "Production Customer Portal Key"
}
```
Returns a token prefixed with `cak-...` and truncated value for console audit.

### Step 3: Consumer Backend Issues a Connect Session
When end-user "Alice" wants to connect her Slack workspace, the consumer backend generates a session:
```http
POST /api/v1/connect-sessions
Authorization: Bearer cak_live_abc123...
Content-Type: application/json

{
  "projectId": "proj_123",
  "externalUserId": "customer_alice_001",
  "allowedPieceNames": ["@inboxfm-connect/piece-slack", "@inboxfm-connect/piece-text-helper"],
  "expiresInSeconds": 900
}
```
Returns:
```json
{
  "token": "cs-r8Kx9...",
  "expiresAt": "2026-09-28T19:15:00.000Z"
}
```

### Step 4: Browser Validates Public Session Metadata
The end-user's browser initializes the Connect modal using only the public session token:
```http
GET /api/v1/connect-sessions/cs-r8Kx9...
```
Returns only non-sensitive public session context:
```json
{
  "projectId": "proj_123",
  "externalUserId": "customer_alice_001",
  "allowedPieceNames": ["@inboxfm-connect/piece-slack", "@inboxfm-connect/piece-text-helper"],
  "expiresAt": "2026-09-28T19:15:00.000Z"
}
```
*Security Invariant*: The hashed session token, project API keys, and platform secret keys are omitted.

### Step 5: Browser Requests OAuth Authorization URL
For OAuth pieces, the browser requests the authorization URL:
```http
POST /api/v1/connect-sessions/cs-r8Kx9.../oauth2/authorization-url
Content-Type: application/json

{
  "pieceName": "@inboxfm-connect/piece-slack",
  "pieceVersion": "0.17.3",
  "redirectUrl": "https://consumer.example.com/oauth/callback"
}
```
The server resolves the operator's configured `clientId` from the database and returns the generated OAuth URL containing state, scopes, and redirect URI.

### Step 6: Browser Redeems Connect Session
Upon OAuth completion or credential entry, the browser exchanges the authorization code for a persisted connection:
```http
POST /api/v1/connect-sessions/cs-r8Kx9.../connections
Content-Type: application/json

{
  "projectId": "proj_123",
  "externalId": "customer_alice_001",
  "displayName": "Alice's Slack Workspace",
  "pieceName": "@inboxfm-connect/piece-slack",
  "pieceVersion": "0.17.3",
  "type": "PLATFORM_OAUTH2",
  "value": {
    "type": "PLATFORM_OAUTH2",
    "code": "oauth-code-from-provider",
    "redirect_url": "https://consumer.example.com/oauth/callback"
  }
}
```
*Atomic Redemption*: The connect session is atomically marked as consumed (`consumedAt = NOW() WHERE consumedAt IS NULL`). Any subsequent or concurrent redemption using the same token is rejected with `SESSION_EXPIRED` (`403 Forbidden`).

### Step 7: Tool Execution by Tenant Backend
The consumer backend can now trigger actions on behalf of the customer:

**Option A — Resolving by `externalUserId`:**
```http
POST /api/v1/execute
Authorization: Bearer cak_live_abc123...
Content-Type: application/json

{
  "projectId": "proj_123",
  "integration": "@inboxfm-connect/piece-slack",
  "tool": "send_channel_message",
  "externalUserId": "customer_alice_001",
  "input": {
    "channel": "C12345",
    "text": "Hello from automated agent"
  }
}
```

**Option B — Resolving by explicit `connectionId`:**
```http
POST /api/v1/execute
Authorization: Bearer cak_live_abc123...
Content-Type: application/json

{
  "projectId": "proj_123",
  "integration": "@inboxfm-connect/piece-slack",
  "tool": "send_channel_message",
  "connectionId": "conn_alice_slack_xyz",
  "input": {
    "channel": "C12345",
    "text": "Hello from automated agent"
  }
}
```

### Step 8: Connection Revocation
The customer or tenant admin can revoke the connection at any time:
```http
DELETE /api/v1/connections/conn_alice_slack_xyz
Authorization: Bearer <AdminToken>
```
Returns `204 No Content`. Subsequent attempts to execute tools using `connectionId` or `externalUserId` immediately fail with `404 Not Found`.

---

## 4. Security & Multi-Tenant Isolation Matrix

The acceptance journey enforces the following strict security invariants verified by integration tests:

| Threat / Attack Vector | Defense Mechanism | Expected Response |
| --- | --- | --- |
| **Cross-Customer ID Substitution** (Bob passes Alice's `connectionId` with `externalUserId: Bob`) | `resolveConnectionId` asserts `connection.externalId === externalUserId` | `403 Forbidden` (`AUTHORIZATION`) |
| **Cross-Project Connection Hijacking** (Project B attempts to execute using Project A's `connectionId`) | `resolveConnectionId` queries with `projectIds: ArrayContains([request.projectId])` | `404 Not Found` (`ENTITY_NOT_FOUND`) |
| **Piece Mismatch / Impersonation** (Passing Slack connection ID to execute Google Calendar piece) | `resolveConnectionId` asserts `connection.pieceName === request.integration` | `400 Bad Request` (`VALIDATION`) |
| **Repeated Session Redemption** (Replaying a used session token) | `connectSessionService.getActiveOrThrow` asserts `consumedAt IS NULL` | `403 Forbidden` (`SESSION_EXPIRED`) |
| **Concurrent Race Condition** (Simultaneous parallel requests redeeming the same session) | Atomic SQL conditional update `UPDATE "connect_session" SET "consumedAt" = $1 WHERE "id" = $2 AND "consumedAt" IS NULL RETURNING id` with connection rollback on loser | Exactly 1 request succeeds (`201 Created`); all concurrent race losers receive `403 Forbidden` (`SESSION_EXPIRED`) |
| **Expired Session Redemption** (Attempting redemption after `expiresAt`) | `connectSessionService.getActiveOrThrow` checks `dayjs().isAfter(expiresAt)` | `403 Forbidden` (`SESSION_EXPIRED`) |
| **Unauthorized Piece Injection** (Redeeming a piece not in `allowedPieceNames`) | `assertPieceAllowed` checks session whitelist | `403 Forbidden` (`AUTHORIZATION`) |
| **Unsupported Connection Type** (Attempting `CLOUD_OAUTH2` redemption via Connect Session) | Whitelist restricts to `SECRET_TEXT`, `BASIC_AUTH`, `CUSTOM_AUTH`, `PLATFORM_OAUTH2` | `400 Bad Request` (`INVALID_APP_CONNECTION`) |

---

## 5. Consumer Integration Example (Node.js / TypeScript)

```typescript
import { ConnectClient } from '@inboxfm-connect/sdk'

// 1. Initialize backend client with Project Connect API Key
const client = new ConnectClient({
  baseUrl: 'https://api.connect.example.com',
  apiKey: process.env.CONNECT_API_KEY!, // cak-...
  projectId: process.env.CONNECT_PROJECT_ID!,
})

// 2. Endpoint to generate session for authenticated end-user
app.post('/api/connect-session', async (req, res) => {
  const externalUserId = req.user.id // Authenticated user ID in your app

  const session = await client.sessions.create({
    externalUserId,
    allowedPieceNames: ['@inboxfm-connect/piece-slack'],
    expiresInSeconds: 900,
  })

  res.json({ token: session.token })
})

// 3. Backend tool execution on behalf of end-user
app.post('/api/send-slack-notification', async (req, res) => {
  const externalUserId = req.user.id

  const result = await client.execute({
    integration: '@inboxfm-connect/piece-slack',
    tool: 'send_channel_message',
    externalUserId,
    input: {
      channel: req.body.channelId,
      text: req.body.messageText,
    },
  })

  res.json({ success: true, result })
})
```

---

## 6. Coverage & Verification Limits

- **Integration Suite**: Verified by `packages/server/api/test/integration/ce/connect/connect-acceptance-journey.test.ts` (8 comprehensive multi-stage integration tests).
- **Execution Sandbox Boundary**: Tests exercise the full database and server resolution layers (`resolveConnectionId`, multi-tenant security barriers, TypeORM entities, and error handling) against live PostgreSQL / PGlite databases. Third-party provider APIs and live container sandboxes are intercepted at the `executeRuntime.execute` boundary to preserve zero-mock tautology compliance without requiring live third-party internet credentials in CI.
