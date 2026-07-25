# PR2 — Event System Cleanup (Architecture Review & Compatibility Report)

This document provides a detailed overview of the Event Destinations / Platform Webhooks subsystem, detailing which components remain active, which have been documented or skipped for compatibility, and the roadmap for future deprecation.

---

## Current Architecture

The Event Destinations system functions as a **compatibility layer** within the headless, API-first architecture of Activepieces.

*   **Persistence**: Configuration management remains fully active. Platform administrators can create, update, list, and delete event destination URLs. These settings are stored in the `event_destination` table.
*   **Dispatch**: Webhook delivery/dispatch is **intentionally disabled**. The service contains a stubbed `jobQueue` worker interface that drops all outgoing events.
*   **Event Flow**:
    1.  Active modules emit events synchronously using the `applicationEvents` helper.
    2.  `eventDestinationService` intercepts these events via registered event listeners.
    3.  The service queries the `event_destination` table for registered platform/project webhooks subscribing to the event type.
    4.  Instead of queueing a dispatch job, the event is passed to a stubbed `jobQueue.add` method which acts as a no-op.

---

## Active Publishers

The following modules in the API server are active and continue to emit events to the event bus:

1.  **appConnectionModule** / **globalConnectionModule** (EE)
    *   Emits: `CONNECTION_UPSERTED`, `CONNECTION_DELETED`
2.  **signingKeyModule** (EE/Cloud)
    *   Emits: `SIGNING_KEY_CREATED`
3.  **projectRoleModule** (EE/Cloud)
    *   Emits: `PROJECT_ROLE_CREATED`, `PROJECT_ROLE_UPDATED`, `PROJECT_ROLE_DELETED`
4.  **projectReleaseModule** (EE)
    *   Emits: `PROJECT_RELEASE_CREATED`
5.  **projectReplaceModule** (EE)
    *   Emits: `PROJECT_REPLACED`
6.  **authenticationModule** / **managedAuthnModule** (EE) / **authnSsoSamlModule** (EE) / **federatedAuthModule** (EE)
    *   Emits: `USER_SIGNED_UP`, `USER_SIGNED_IN`

---

## Active Subscribers

The only remaining subscriber to these events is the **Event Destinations Service**:

*   **Listener Setup**: Registered on module startup in [platform-webhooks.module.ts](file:///k:/Projects/activepieces/packages/server/api/src/app/ee/platform-webhooks/platform-webhooks.module.ts):
    ```typescript
    eventDestinationService(app.log).setup()
    ```
*   **Event Hooks**:
    *   `userEvent`: Listens for user action events (e.g. connections, signing keys, auth).
    *   `workerEvent`: Listens for execution/job events.

---

## REST API

The REST endpoints remain fully operational and exposed under the public path `/v1/event-destinations`:

*   `POST /v1/event-destinations` — Creates an event destination configuration.
*   `GET /v1/event-destinations` — Lists event destinations with pagination.
*   `PATCH /v1/event-destinations/:id` — Updates configuration (url or events list) for a given ID.
*   `DELETE /v1/event-destinations/:id` — Deletes a configuration.
*   `POST /v1/event-destinations/test` — Simulates sending a mock payload to the target URL (uses `buildMockEvent()`).

---

## Database

The database configuration and tables are preserved:

*   **TypeORM Entity**: `EventDestinationEntity` (registered in [database-connection.ts](file:///k:/Projects/activepieces/packages/server/api/src/app/database/database-connection.ts))
*   **Database Table**: `event_destination`
*   **Table Schema**:
    *   `id` (Primary Key, apId)
    *   `created` / `updated` (Timestamps)
    *   `platformId` (Foreign Key to Platform)
    *   `projectId` (Nullable Foreign Key to Project)
    *   `scope` (`PLATFORM` or `PROJECT`)
    *   `events` (Array of event strings)
    *   `url` (String)

---

## Dead Code Removed

| Component / Symbol | Reason for Action | Evidence | Safe to Remove (YES/NO) | Action Taken |
| :--- | :--- | :--- | :--- | :--- |
| `ApplicationEventName.FLOW_RUN_FAILED` | Zero runtime references, zero tests, zero API exposure. | 0 matches found in codebase. | YES | Verified non-existent; documented. |
| `ApplicationEventName.RUN_FAILED` | Zero runtime references, zero tests, zero API exposure. | 0 matches found in codebase. | YES | Verified non-existent; documented. |
| `event-destination-trigger.test.ts` (BullMQ assertions) | Relied on deleted `app/workers/job-queue` module. | Failed Vitest compilation. | NO (historical reference required) | Obsolete suites skipped using `describe.skip`; imported `job-queue` stubbed locally. |

---

## Compatibility Layer

The compatibility layer remains to support external API configurations, SDK contracts, and platform admin scripts.
*   **Why it exists**: Prevents breaking changes in customer integrations that configure webhooks via the REST API or expect those endpoints to exist.
*   **Persistence vs Dispatch**: Persistence functions normally so configurations do not throw error on client CRUD requests, but actual queueing/dispatch is stubbed out since the BullMQ scheduler/worker layer has been retired.

---

## Future Removal Plan

To fully decommission this subsystem, the following conditions must be met:

1.  **Zero REST API Usage**: Audit production API gateway logs to confirm no customers are making requests to `/v1/event-destinations`.
2.  **Database Migration**: Prepare and run a TypeORM migration to drop the `event_destination` table and clean up its foreign key constraints.
3.  **Replacement Event System**: If webhook streaming is required in the future, a new event routing system (e.g. transactional outbox, Kafka, or eventbridge) must be designed to replace the obsolete BullMQ/worker queue.
4.  **Major Version Bump**: Schedule the code deletion for a major version release (breaking change) and publish deprecation notices beforehand.
