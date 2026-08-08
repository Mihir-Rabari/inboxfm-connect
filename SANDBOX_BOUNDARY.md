# Sandbox Boundary & FlowVersion Decoupling — Headless Integration Runtime

## 1. Boundary Architecture

The Sandbox isolates piece/tool execution from the API server process. It must have ZERO reliance on `FlowVersion` or workflow graphs.

```
[ API / Worker ]
       │
       │  ToolExecutionRequest
       ▼
┌───────────────┐
│ Sandbox Manager│ ──> Provisions piece dependencies via npm/isolated storage
└──────┬────────┘
       │  ExecuteToolOperation
       ▼
┌───────────────┐
│ Engine Process│ ──> Executes piece.actionName with processed inputs
└──────┬────────┘
       │  EngineResponse
       ▼
[ ToolExecutionResult ]
```

---

## 2. Decoupled Request & Result Contracts

### 2.1 Replacement Contracts
Replace legacy `ExecuteFlowOperation` / `FlowVersion` sandbox parameters with clean contracts:

```ts
export type ToolExecutionRequest = {
    projectId: ProjectId
    platformId: PlatformId
    pieceName: string
    pieceVersion: string
    actionName: string
    input: Record<string, unknown>
    auth?: Record<string, unknown>
    timeoutInSeconds?: number
}

export type ToolExecutionResult = {
    status: 'OK' | 'ERROR'
    response: unknown
    error?: string
}
```

---

## 3. Provisioning & Caching Policy

- **Provision Key Verification**:
  - The provision key identifies isolated sandbox environments.
  - Compute key via `hash(pieceName + ':' + pieceVersion + ':' + platformId)`.
  - Avoid compiling user code or loading flow versions.

---

## 4. Remediation of Defect A (Sandbox Worker Serialization)

- **Issue**: `user-interaction-watcher.ts` allocates multiple sandbox managers but hardcodes `workerIndex: 0`.
- **Consequence**: All concurrent property resolution and tool requests serialize through a single worker slot, creating bottlenecks.
- **Remediation Plan**: Round-robin worker indices (`workerIndex = index % poolSize`) or leverage a dynamic worker pool in the sandbox manager.
