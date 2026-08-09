# MCP Headless Architecture — Headless AI Integration Runtime

## 1. Vision & Role

Model Context Protocol (MCP) serves as the primary external tool boundary for AI agents and clients interacting with InboxFM Connect.

```
External AI Agent / Client
            │ (MCP Protocol / JSON-RPC)
            ▼
┌────────────────────────┐
│     MCP Endpoint       │ ── Uses MCP OAuth authorization server
└───────────┬────────────┘
            │
            ▼
┌────────────────────────┐
│    Tool Discovery      │ ── Queries Knowledge Search & Piece Registry
└───────────┬────────────┘
            │
            ▼
┌────────────────────────┐
│    HeadlessRuntime     │ ── Decrypts connection auth & invokes Sandbox
└────────────────────────┘
```

---

## 2. Decoupled Tool Surface

- Exposes all registered piece actions as standard MCP tools (`mcp.listTools`, `mcp.callTool`).
- Uses `HeadlessRuntime.execute()` as the sole underlying engine executor.
- Has ZERO dependencies on `Flow`, `FlowVersion`, `FlowRun`, `Router`, `Loop`, or visual canvas concepts.

---

## 3. OAuth & Security Boundary

- **MCP OAuth**: Preserves the complete, standalone OAuth2 authorization server (`mcp-oauth`) for authenticating client agents.
- **Connection Isolation**: Resolves connection credentials per `projectId` / `platformId` securely without exposing secrets to client callers.
