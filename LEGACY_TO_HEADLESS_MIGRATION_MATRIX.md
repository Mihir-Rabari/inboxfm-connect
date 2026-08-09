# Legacy to Headless Migration Matrix — InboxFM Connect

## Comprehensive Migration Mapping

| Legacy Concept | Decision | Headless Replacement | Reason for Change | Migration Strategy | Target PR |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Flow** | Delete | None (Headless Runtime) | InboxFM is AI-native integration runtime, not graph builder | Remove remaining references in engine/contracts | PR8J |
| **FlowVersion** | Delete permanently | `TriggerBinding` / `ToolInvocation` | Canvas/graph definition obsolete | Eliminate `FlowVersion` type across `@inboxfm-connect/shared` | PR8F |
| **FlowRun** | Delete | `Execution` | Graph step execution state obsolete | Replace DB schema & contracts with `Execution` + `ToolCall` | PR8A |
| **StepRun** | Delete | `ToolCall` | Steps imply graph nodes. Tool calls are runtime log entries | Replace `StepRunResponse` with `ToolCallResult` | PR8B |
| **FlowAction** | Delete | `PieceAction` / Tool Metadata | Actions resolved dynamically by AI planner | Expose raw piece action schemas | PR8I |
| **FlowTrigger** | Delete | `TriggerBinding` | Triggers invoke prompts/agents, not flows | Replace trigger flowId coupling with `TriggerBinding` | PR8D |
| **TriggerPayload** | Keep & Adapt | `TriggerEventPayload` | Integration triggers still emit payload data | Adapt to pass directly to `ExecutionRequest` | PR8D |
| **FlowOperation** | Delete | `ExecuteToolOperation` | Graph mutations obsolete | Drop flow operation DTOs | PR8J |
| **Router** | Delete | AI Planner Branching | Hardcoded visual branches obsolete | Purge dead router imports | PR8J |
| **Loop** | Delete | AI Planner Iteration | Hardcoded loop steps obsolete | Purge dead loop imports | PR8J |
| **Waitpoint** | Delete | Async Agent Callback | Graph pause/resume nodes obsolete | Remove waitpoint contracts | PR8J |
| **SampleData** | Audit & Adapt | `ExecutePropsOptions` input context | Resolved input context needed for dynamic dropdowns | Retain runtime input context, remove flow step mock storage | PR8G |
| **CodeArtifact** | Delete | `ExpressionEvaluator` | Arbitrary custom JS code execution removed | Delete user custom code bundler/compilation | PR8G |
| **FlowCache** | Delete | Tool Metadata Cache | Canvas flow caching obsolete | Replace with Piece Action cache | PR8I |
| **Flow Progress** | Delete | `ExecutionEvent` (SSE) | Graph step progress obsolete | Replace polling with SSE event stream | PR8C |
| **Trigger Runtime** | Keep & Refactor | `TriggerBinding` Runtime | Need cron/webhook event execution | Decouple from `FlowVersion` in `trigger-helper.ts` | PR8D |
| **Scheduler** | Keep & Partition | 3-Plane Scheduler | Scheduled tasks still required | Refactor into System, User Task, and Trigger planes | PR8E |
| **Knowledge Search** | Keep & Promote | First-Class Runtime Capability | Core tool discovery capability | Integrate directly with AI Planner | PR8H |
| **MCP** | Keep & Promote | Primary Integration Surface | Core API interface for external agents | Decouple from legacy flow routes | PR8I |
| **Sandbox** | Keep & Decouple | Headless Tool Sandbox | Needed for isolated piece execution | Decouple provision key from `FlowVersion` | PR8F |
| **Connections** | Keep | Connections (Unchanged) | Decrypted connection auth required for tools | Retain existing TypeORM entity | N/A |
| **OAuth** | Keep | OAuth (Unchanged) | Required for piece auth & MCP OAuth | Retain existing OAuth authorization server | N/A |
