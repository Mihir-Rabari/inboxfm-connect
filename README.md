<h1 align="center">
  <br>
  <b>Inboxfm Connect</b>
  <br>
</h1>

<p align="center">
  <b>Open-source AI-first workflow automation platform. 400+ integrations. Native MCP support.</b>
</p>

<p align="center">
  <a href="/LICENSE"><img src="https://img.shields.io/badge/license-MIT-purple.svg?style=for-the-badge" alt="License" /></a>
  <a href="https://github.com/Mihir-Rabari/inboxfm-connect"><img src="https://img.shields.io/badge/edition-CE%20%7C%20EE%20%7C%20Cloud-blue?style=for-the-badge" alt="Editions" /></a>
  <a href="https://typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-5.0-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" /></a>
</p>

<br>

## 🚀 Overview

**Inboxfm Connect** is an open-source, AI-first workflow automation platform designed to empower AI agents, developers, and teams. Built from the ground up with TypeScript, Inboxfm Connect provides seamless integration capabilities through native **Model Context Protocol (MCP)** servers, headless relational data tables, and an extensible type-safe framework.

Whether self-hosted or deployed in the cloud, Inboxfm Connect connects LLM models (via Claude Desktop, Cursor, Windsurf, or custom AI agents) to over **400+ integrations** safely and deterministically.

---

## 🔥 Key Features

- **🤖 Native MCP Support**: Every integration automatically acts as an MCP server. Connect your LLM agents in Claude, Cursor, Windsurf, or custom agentic tools to 400+ external services.
- **🛠️ Type-Safe Integrations Framework**: Write custom actions, triggers, and integrations in TypeScript using `@inboxfm-connect/pieces-framework` with hot-reloading and instant developer feedback.
- **📊 Headless Data Tables**: Built-in relational storage service (`Table`, `Field`, `Record`, `Cell`) for structured data persistence.
- **🏢 Enterprise Multi-Tenancy**: Strict tenant isolation (`Platform` → `Project` → `User`) ensuring data security across self-hosted and cloud environments.
- **🔒 Security by Design**: Built-in SSRF protection (`safeHttp`), role-based access control (RBAC), and customizable enterprise white-labeling.
- **⚡ High Performance Architecture**: Fastify REST API, TypeORM managed PostgreSQL, and BullMQ Redis job queue for reliable async processing.

---

## 🏗️ Monorepo Architecture

```
├── packages/
│   ├── core/
│   │   ├── shared/                # Shared Zod schemas, types, and model definitions
│   │   ├── piece-types/           # Common type schemas for integrations
│   │   ├── pieces-framework/      # Framework SDK for building custom integrations
│   │   ├── pieces-common/         # Shared utilities for pieces (OAuth, polling, HTTP)
│   │   ├── core-utils/            # Lean framework-agnostic utilities
│   │   └── core-formula/          # Formula parsing and evaluation engine
│   ├── server/
│   │   ├── api/                   # Fastify-based backend REST API server
│   │   ├── engine/                # Runtime executor for headless pieces and MCP tools
│   │   ├── sandbox/               # Code sandbox isolation layer
│   │   └── scheduler/             # Scheduled tasks and cron trigger manager
│   └── integrations/
│       └── core/                  # Core integration definitions
```

---

## 🛠️ Quick Start

### 1. Prerequisites
- **Node.js**: `^18.17.0` or `>=20.0.0`
- **npm**: `>=9.0.0`
- **PostgreSQL**: `>=14` (or SQLite for development)
- **Redis**: `>=6.0`

### 2. Installation & Setup

```bash
# Clone the repository
git clone https://github.com/Mihir-Rabari/inboxfm-connect.git
cd inboxfm-connect

# Install dependencies and setup environment
npm start

# Run frontend & backend in development mode
npm run dev
```

---

## 🔌 Building Custom Integrations

Integrations in Inboxfm Connect are standard TypeScript packages created using `@inboxfm-connect/pieces-framework`:

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

## 📜 License

Distributed under the **MIT License**. See [`LICENSE`](/LICENSE) for details.
