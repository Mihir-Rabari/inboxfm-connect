# Risk Analysis (RISK_ANALYSIS.md)

This document analyzes security, runtime performance, developer migration concerns, and lists the estimated effort.

---

## 1. Process Fork Latency (Synchronous Execution)

### The Risk
In the workflow engine model, execution latency is hidden behind BullMQ queues and worker threads. In a synchronous, headless model, `POST /execute` directly maps to a HTTP request lifecycle:
```
Client Request -> API -> Fork Sandbox Process -> Engine Executes Tool -> HTTP Response
```
Forking a Node process on every single HTTP request adds **150ms to 400ms** of overhead simply for process spawning, leading to high latency for real-time AI agents.

### Mitigations
1. **Sandbox Pool (Warm Sandboxes)**: Retain a pool of pre-warmed idle sandbox processes. When an execution request arrives, grab a hot sandbox, transfer the payload via IPC/Socket, execute, reset internal states, and release it back to the pool.
2. **Worker Threads**: Explore using worker threads (`worker_threads`) instead of processes if absolute directory and network namespace isolation isn't required.

---

## 2. Dynamic Import Mapping for Integrations

### The Risk
When integrations are restructured to `providers/`, dynamic loading during sandbox forks must be robust. If dynamic imports fail to resolve references because the compilation paths inside `dist/` do not align with source directories, executions will fail.

### Mitigations
- Maintain a strictly structured registry in `packages/registry` that indexes available providers and outputs absolute filesystem entry paths for target sandbox configurations.

---

## 3. Database Locking and Concurrency during Token Refresh

### The Risk
When multiple concurrent AI agents execute tools using the same expired connection ID, multiple API requests might attempt to refresh the token simultaneously, invalidating previous refresh tokens and causing credentials errors.

### Mitigations
- Enforce the exclusive lock pattern from [`lockAndRefreshConnection`](file:///K:/Projects/activepieces/packages/server/api/src/app/app-connection/app-connection-service/app-connection.handler.ts#L141-L151) using Redis-backed Redlock or local async Mutex locks during the synchronous refresh lifecycle step.

---

## 4. Porting 400+ Pieces to the SDK-first Providers Directory

### The Risk
Manually refactoring 400+ pieces from the legacy action/trigger structure to the new `providers/` structure (`manifest.ts`, `auth.ts`, `tools/`) represents a major task.

### Mitigations
- Write an AST-based automated code transformation script utilizing `jscodeshift` to automatically map:
  - `createPiece` -> `createIntegration`
  - `actions: [...]` -> `tools: [...]`
  - Delete `triggers: [...]`
- Prioritize migrating top integrations (Gmail, Slack, GitHub, Notion) first, deprecating or removing others.

---

## 5. Effort Estimation

| Migration Milestone | Complexity | Estimated Time |
| :--- | :--- | :--- |
| **Phase 1: Disable legacy workflow routes and stubs** | Low | 3 days |
| **Phase 2: Framework rewrite and runtime implementation** | High | 8 days |
| **Phase 3: Sandbox process tuning & dynamic load mapping** | High | 6 days |
| **Phase 4: Piece migration scripts & providers folder setup** | Medium | 10 days |
| **Phase 5: API REST Controller simplification** | Medium | 4 days |
| **Phase 6: Integration testing & load validation** | Medium | 5 days |
