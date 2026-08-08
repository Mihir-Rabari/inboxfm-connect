# Headless Target Dependency Graph — InboxFM Connect

## 1. Overview & Verification

This document illustrates the target architectural flow across all execution modes of InboxFM Connect.

**Zero Graph Policy**:
All target dependency graphs contain **ZERO** references to `Flow`, `FlowVersion`, `FlowRun`, `Router`, `Loop`, or visual canvas elements.

---

## 2. Mermaid Target Architecture Diagrams

### Diagram A: Direct Prompt Execution Path
```mermaid
graph TD
    User([User / API Client]) -->|POST /v1/execute| API[API Endpoint]
    API --> Planner[AI Planner / Agent]
    Planner -->|Query Relevant Tools| KS[Knowledge Search]
    KS -->|Vector & Keyword Match| Planner
    Planner -->|Discover Tool Schemas| MCP[MCP Protocol]
    Planner -->|Dispatch Execution| HR[HeadlessRuntime]
    HR -->|Decrypt Connection Auth| Conn[(Connections DB)]
    HR -->|Execute Tool Request| SB[Sandbox Manager]
    SB -->|Run Operation| Engine[Engine Process]
    Engine -->|Execute Action| Integration[Integration / Piece]
    Integration -->|Return Result| Engine
    Engine -->|ToolCallResult| HR
    HR -->|Record Log| TC[(ToolCall DB)]
    HR -->|Final Output| User
```

### Diagram B: Scheduled Execution Path
```mermaid
graph TD
    Sched[Scheduler Service] -->|Check Scheduled Tasks| DB[(Scheduled Tasks DB)]
    Sched -->|Trigger Fired| TB[TriggerBinding]
    TB -->|Dispatch Prompt| Planner[AI Planner]
    Planner -->|Run Headless Tool Loop| HR[HeadlessRuntime]
    HR -->|Execute Tool in Sandbox| SB[Sandbox Engine]
    SB -->|Result| Exec[(Execution DB)]
```

### Diagram C: Webhook Execution Path
```mermaid
graph TD
    External[External System Webhook] -->|HTTP POST Payload| WH[Webhook Controller]
    WH -->|Lookup Active Binding| TB[TriggerBinding DB]
    WH -->|Execute Trigger RUN Hook| Sandbox[Engine Sandbox]
    Sandbox -->|Processed Event Payload| WH
    WH -->|Dispatch Event + Prompt| Planner[AI Planner / Agent]
    Planner -->|Execute Integration Tools| HR[HeadlessRuntime]
    HR -->|Result| Exec[(Execution DB)]
```

### Diagram D: Execution Progress (SSE) Path
```mermaid
graph TD
    ExecEngine[Execution Subsystem] -->|Emit State Change| Bus[Redis / In-Memory Event Bus]
    Bus -->|Publish ExecutionEvent| SSE[SSE Controller]
    SSE -->|Stream Event Chunk| Client[Client Browser / Agent Listener]
```

### Diagram E: MCP Headless Tool Execution Path
```mermaid
graph TD
    ClientAgent([External AI Agent]) -->|JSON-RPC mcp.callTool| MCP[MCP Controller]
    MCP -->|Authenticate OAuth Token| MCPOAuth[MCP OAuth Server]
    MCP -->|Resolve Piece Action| Registry[Piece Registry]
    MCP -->|Dispatch Execution| HR[HeadlessRuntime]
    HR -->|Decrypt Auth & Execute| Sandbox[Sandbox Engine]
    Sandbox -->|Tool Result| MCP
    MCP -->|JSON-RPC Response| ClientAgent
```
