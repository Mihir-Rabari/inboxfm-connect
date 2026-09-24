<h1 align="center">
  <br>
  <b>Inboxfm Connect</b>
  <br>
</h1>

<p align="center">
  <b>Open-source AI-first workflow automation platform. 400+ integrations. Native MCP support.</b>
</p>

<p align="center">
  <a href="/LICENSE"><img src="https://img.shields.io/badge/license-MIT%20%2B%20dual-purple.svg?style=for-the-badge" alt="License" /></a>
  <a href="https://github.com/Mihir-Rabari/inboxfm-connect"><img src="https://img.shields.io/badge/edition-CE-blue?style=for-the-badge" alt="Editions" /></a>
  <a href="https://typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-5.0-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" /></a>
</p>

<br>

## 🚀 Overview

**Inboxfm Connect** is an open-source, AI-first workflow automation platform for AI agents, developers, and teams. Built from the ground up with TypeScript, it provides integration capabilities through native **Model Context Protocol (MCP)** servers, headless relational data tables, and a type-safe integrations framework.

Whether self-hosted or deployed in the cloud, Inboxfm Connect connects LLM models (via Claude Desktop, Cursor, Windsurf, or custom AI agents) to **400+ integrations** safely and deterministically.

This is a fork of [Activepieces](https://github.com/activepieces/activepieces), stripped of its visual flow builder in favor of a headless, MCP-first execution model.

---

## 📌 Project status

This project is under **active development**. Current priorities, tracked as [GitHub Issues](https://github.com/Mihir-Rabari/inboxfm-connect/issues):

- **Removing all `packages/ee/`-licensed code** — this repo currently still imports some Activepieces Enterprise-licensed code from core request paths (auth, flags, websockets, piece listing). That's being replaced with original, MIT-licensed implementations so the app is genuinely free to run in production. See [#7](https://github.com/Mihir-Rabari/inboxfm-connect/issues/7) and its linked sub-issues.
- **Production hardening** — abuse prevention, backups/DR, observability wiring, deployment docs.
- **New surfaces** — a proper landing page, an API key management UI, a Docusaurus documentation site, and a polished public SDK (`packages/connect-sdk`).

If you're picking up work here, start from the [open issues](https://github.com/Mihir-Rabari/inboxfm-connect/issues) and see [CONTRIBUTING.md](CONTRIBUTING.md) for the branch workflow.

---

## 🔥 Key Features

- **🤖 Native MCP Support**: Every integration automatically acts as an MCP server. Connect LLM agents in Claude, Cursor, Windsurf, or custom agentic tools to 400+ external services.
- **🛠️ Type-Safe Integrations Framework**: Write custom actions and triggers in TypeScript using `@inboxfm-connect/pieces-framework` with hot-reloading.
- **📊 Headless Data Tables**: Built-in relational storage service (`Table`, `Field`, `Record`, `Cell`) for structured data persistence.
- **🏢 Multi-Tenancy**: Strict tenant isolation (`Platform` → `Project` → `User`), enforced on every query by `projectId`/`platformId`.
- **🔒 Security by Design**: Built-in SSRF protection (`safeHttp`), scoped API keys, and role-based access control.
- **⚡ Performance**: Fastify REST API, TypeORM-managed PostgreSQL, and BullMQ/Redis for reliable async job processing.

---

## 🏗️ Monorepo Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full module/entity map. High level:

```
├── packages/
│   ├── core/
│   │   ├── shared/                # DB/EE/app-level schemas, types (thick — never import from pieces/engine)
│   │   ├── piece-types/           # Common type schemas for integrations
│   │   ├── pieces-framework/      # Framework SDK for building custom integrations
│   │   ├── pieces-common/         # Shared utilities for pieces (OAuth, polling, HTTP)
│   │   ├── core-utils/            # Lean framework-agnostic utilities
│   │   └── core-formula/          # Formula parsing and evaluation engine
│   ├── server/
│   │   ├── api/                   # Fastify-based backend REST API server
│   │   ├── engine/                # Runtime executor for headless pieces and MCP tools
│   │   ├── sandbox/                # Code sandbox isolation layer
│   │   └── scheduler/             # Scheduled tasks and cron trigger manager
│   ├── web/                       # React frontend (flow-builder-free dashboard)
│   ├── connect-sdk/                # Public client SDK (in progress)
│   └── integrations/
│       ├── core/                  # Core integration definitions (e.g. tables)
│       └── community/             # Third-party integrations
```

---

## 🛠️ Quick Start

### 1. Prerequisites
- **Node.js**: `^18.17.0` or `>=20.0.0`
- **npm**: `>=9.0.0`
- **PostgreSQL**: `>=14` (or PGlite for zero-setup local dev)
- **Redis**: `>=6.0`

### 2. Installation & Setup

```bash
# Clone the repository
git clone https://github.com/Mihir-Rabari/inboxfm-connect.git
cd inboxfm-connect

# Install dependencies and set up the dev environment
npm start

# Or, once set up, just run frontend + backend
npm run dev
```

Copy `.env.dev` and adjust for your local setup — see [ARCHITECTURE.md](ARCHITECTURE.md) for the database options (`AP_DB_TYPE=POSTGRES` or `PGLITE`).

---

## 🔌 Building Custom Integrations

Integrations are standard TypeScript packages built with `@inboxfm-connect/pieces-framework`:

```typescript
import { createPiece, createAction, Property } from '@inboxfm-connect/pieces-framework'

export const myCustomAction = createAction({
    name: 'send_message',
    displayName: 'Send Message',
    description: 'Sends a notification message',
    props: {
        recipient: Property.ShortText({
            displayName: 'Recipient',
            required: true,
        }),
        message: Property.LongText({
            displayName: 'Message',
            required: true,
        }),
    },
    async run(context) {
        // Implementation logic
        return { success: true }
    },
})

export const myPiece = createPiece({
    displayName: 'My Custom Integration',
    auth: Property.SecretText({ displayName: 'API Key', required: true }),
    minimumSupportedRelease: '0.0.1',
    authors: [],
    actions: [myCustomAction],
    triggers: [],
})
```

---

## 📚 Documentation & SDK

- **Docs site**: a Docusaurus-based documentation site is in progress — tracked in the docs/SDK issues on the [issue tracker](https://github.com/Mihir-Rabari/inboxfm-connect/issues). Until it ships, the best reference is `CLAUDE.md`, `ARCHITECTURE.md`, and the code itself.
- **SDK**: `packages/connect-sdk` is the public client SDK for the Connect platform (API keys, connect sessions). Also in progress — see the issue tracker.

---

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the branch workflow, PR conventions, and how automated PR review works in this repo.

---

## 📜 License

This repo is **dual-licensed** by directory:

- Everything **outside** `packages/ee/` and `packages/server/api/src/app/ee/` is **MIT** — free to use, modify, and ship.
- Everything **inside** those two directories is Activepieces Inc's own Enterprise-licensed code — usable for dev/test, but not in production without a paid Activepieces Enterprise license.

We're actively removing the `ee/` dependency from every code path outside `ee/` itself (see [#7](https://github.com/Mihir-Rabari/inboxfm-connect/issues/7)) so the whole app is unambiguously MIT to run in production. See [LICENSING.md](LICENSING.md) for the full detail and current status.
