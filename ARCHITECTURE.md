# Inboxfm Connect Architecture (Post-PR4E)

This document describes the certified codebase architecture of **Inboxfm Connect** following the removal of the visual workflow builder, engine, and associated legacy database layers. It provides a clean, forward-looking map of the repository's components, services, and flows.

---

## 1. Active Packages & Monorepo Structure

The monorepo is organized under `packages/*` using a clean, layered structure:

```
├── packages/
│   ├── core/
│   │   ├── shared/                # Core Zod schemas, types, and model declarations (non-React)
│   │   ├── piece-types/           # Common type schemas for integrations/pieces
│   │   ├── pieces-framework/      # Framework SDK for building custom integrations
│   │   ├── pieces-common/         # Shared utilities for pieces (OAuth, polling, HTTP helpers)
│   │   ├── core-utils/            # Lean framework-agnostic utilities
│   │   └── core-formula/          # Formula parsing and evaluation engine
│   ├── server/
│   │   ├── api/                   # Fastify-based backend REST API server
│   │   ├── engine/                # Runtime executor for headless pieces/tools
│   │   ├── sandbox/               # Executor isolation Layer
│   │   └── scheduler/             # Cron and scheduled tasks scheduler
│   └── integrations/
│       └── core/                  # Core piece definitions (e.g. tables)
```

---

## 2. Dependency Graph & Architecture Layers

The monorepo follows a strict **thin-to-thick** dependency flow:

```
api [packages/server/api] ──────────► shared [@inboxfm-connect/shared] ──► core-utils
  │                                    │
  └────────────────────────────────────┴──► server-utils

engine [packages/server/engine] ────► pieces-framework ──► piece-types / pieces-common
```

* **Server API** depends on `@inboxfm-connect/shared` and server utilities.
* **Integrations (Pieces)** import `@inboxfm-connect/pieces-framework` and are strictly isolated from the database or API layer.
* **Server Engine** loads pieces dynamically to execute them within isolated sandboxes.

---

## 3. Server Modules (API)

All API endpoints are defined in `packages/server/api/src/app/` with Fastify controllers, TypeORM schemas, and services:

* **`authentication/`**: Handles user login, registration, and federated SSO authentication.
* **`user/`**: User identity and profile management.
* **`project/`**: Projects partition (multi-tenancy workspace separation).
* **`platform/`**: Platform administration, custom branding, and billing/plans.
* **`mcp/`**: Model Context Protocol (MCP) server endpoints exposing database tables and piece actions to LLM agents.
* **`tables/`**: Headless data tables service (`table`, `field`, `record`, `cell` entities).
* **`pieces/`**: Manages installation, syncing, and versioning of custom/registry pieces.
* **`event-destinations/`**: Handlers for webhook/event streaming targets.
* **`flags/`**: System configuration flag service.
* **`file/`**: Uploaded file metadata and storage references.

---

## 4. Database Schema (TypeORM Entities)

Following the removal of the visual workflow database layer, the surviving tables registered in `database-connection.ts` are:

```
PLATFORM ────► PROJECT ────► USER
                 │
                 ├─────────► TABLE ────► FIELD
                 │             │
                 │             └───────► RECORD ────► CELL
                 │
                 └─────────► FILE
```

### Core Entities:
* **`Platform`**: System instances.
* **`Project`**: Workspaces partitioned by `projectId`.
* **`User`** & **`UserIdentity`**: User accounts and credentials.
* **`Table`**, **`Field`**, **`Record`**, **`Cell`**: Headless relational data tables storage.
* **`File`**: File uploads and raw payloads.
* **`McpServer`**: Exposes registered third-party MCP endpoints.

---

## 5. System Flows

### A. Authentication Flow
1. User requests authenticate via local password or SAML/SSO provider.
2. Fastify controller validates credentials, fetches user record, and signs a JWT.
3. Every API request passes through the Fastify security hook validating tenant membership (`platformId` or `projectId`).

### B. Headless Integration (Piece) Execution Flow
1. LLM agent or MCP tool calls endpoint to execute an action.
2. The Server API spawns or sends job details to the `HeadlessRuntime` (`packages/server/engine`).
3. The engine spins up a node sandbox, resolves dependencies/credentials via `appConnectionService`, and executes the piece's action.
4. Output is piped back to the caller as a structured JSON object.

### C. Queue System (BullMQ)
- Backed by Redis.
- Manages scheduled execution jobs, piece installation/syncing tasks, and background maintenance tasks.
