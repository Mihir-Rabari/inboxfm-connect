# PR8G — Expression Evaluator & Arbitrary Code Execution Audit

## Executive Summary
This audit traces property interpolation (`props-resolver.ts`), expression evaluation mechanisms, V8 isolate usage, and legacy arbitrary code execution infrastructure (`codeBuilder`, `CodeArtifact`) across the InboxFM Connect codebase.

Key findings:
1. **Property / Expression Evaluation** is live, safe, and heavily relied upon by MCP tool execution, piece action executions, and trigger bindings.
2. **V8 Isolate (`isolated-vm`)** in `props-resolver.ts` / `v8-isolate-code-sandbox.ts` is NOT used for arbitrary user code execution. It is used exclusively for evaluating variable expressions in Javascript scope safely (e.g. `{{ trigger.output.price + 2 }}` or `evalInScope`).
3. **Arbitrary User Code Execution** (`codeBuilder`, compiling user TypeScript/JavaScript code steps into bundles via bun, `runCodeModule`, `CodeArtifact`) was part of the visual workflow runtime for custom code steps in DAGs. In the AI-native headless runtime, execution happens via official integration tools and MCP.
4. **Current Status of Arbitrary Code Infrastructure**: `codeBuilder` and `CodeArtifact` references remain in `packages/server/sandbox` for provisioning legacy `flowVersion` code steps. However, `runCodeModule` inside `v8-isolate-code-sandbox.ts` and `no-op-code-sandbox.ts` is only called by unit tests.

---

## 1. Current Evaluator Architecture & `props-resolver.ts`

`props-resolver.ts` is the central entry point for evaluating expressions in property inputs.

### Data Flow:
```
ResolveInput (unresolvedInput e.g. "{{ trigger.output.name }}")
        │
        ├── extractMustacheTokens / formulaEvaluator
        │
        ├── single token or formula pre-resolution
        │
        ├── handleVariable (variables resolver)
        ├── handleConnection (connections resolver)
        └── evalInScope (expressions / JS evaluation)
                │
                └── initCodeSandbox().runScript({ script, scriptContext, functions })
                        │
                        └── v8IsolateCodeSandbox.runScript or noOpCodeSandbox.runScript
```

### Expression Evaluation Boundaries:
- `evalInScope` runs small JavaScript expressions (`script`) against a controlled `scriptContext` and `functions` object (e.g. `flattenNestedKeys`).
- When `AP_EXECUTION_MODE` is `SANDBOX_CODE_ONLY` or `SANDBOX_CODE_AND_PROCESS`, `v8IsolateCodeSandbox.runScript` is used.
- In `v8IsolateCodeSandbox`:
  - `isolated-vm` creates a clean V8 isolate with a 128MB memory limit.
  - No Node.js globals (`process`, `require`, `fs`, `net`) are exposed to the script.
  - Values are transferred via `ivm.ExternalCopy`.
  - Global functions (like `flattenNestedKeys`) are stringified and pre-pended.
- When `AP_EXECUTION_MODE` is `UNSANDBOXED` or `SANDBOX_PROCESS`, `noOpCodeSandbox.runScript` uses `Function(...params, body)`.

---

## 2. Dependency & Classification Matrix

| Component / Subsystem | Purpose | Reachable From | Classification | Decision |
| :--- | :--- | :--- | :--- | :--- |
| `props-resolver.ts` | Resolves `{{ ... }}` tokens, formulas, and connections | `ExecuteTool`, `ExecuteProps`, `TriggerBinding` | Expression Evaluation | **KEEP & REFACTOR** behind `ExpressionEvaluator` |
| `v8-isolate-code-sandbox.ts` (`runScript`) | Runs expression scripts inside a V8 isolate | `props-resolver.ts` (`evalInScope`) | Expression Evaluation | **KEEP & SAFEGUARD** |
| `v8-isolate-code-sandbox.ts` (`runCodeModule`) | Executes arbitrary compiled CommonJS files | Only unit tests | Arbitrary Code Execution | **REMOVE / DEPRECATE** |
| `no-op-code-sandbox.ts` (`runCodeModule`) | Spawns a child process to run CommonJS code | Only unit tests | Arbitrary Code Execution | **REMOVE / DEPRECATE** |
| `code-builder.ts` | Installs npm deps and builds user code via Bun | `sandbox/resolver.ts`, `local-execution-cache.ts` | Arbitrary Code Execution | **AUDIT / DECOUPLE** |
| `CodeArtifact` | Schema/type for user code steps | `packages/server/sandbox` | Arbitrary Code Execution | **CLEANUP** from headless provision paths |

---

## 3. Dynamic Imports & Runtime Registrations

An audit of dynamic imports (`import()`) across `server/engine` and `server/sandbox` confirmed:
1. `code-sandbox.ts` dynamically imports `./no-op-code-sandbox` or `./v8-isolate-code-sandbox` based on `AP_EXECUTION_MODE`.
2. No hidden dynamic imports reach `runCodeModule` at runtime during tool execution, property resolution, or trigger lifecycle.

---

## 4. Security Boundary of Expression Evaluation

The `ExpressionEvaluator` security boundary guarantees:
- **No File System Access**: No `fs`, `readFile`, or file descriptors in scope.
- **No Network Access**: No `fetch`, `http`, `net`, `XMLHttpRequest`, or `WebSocket`.
- **No Process Spawning / Child Processes**: No `process`, `child_process`, `exec`, or `spawn`.
- **No Dynamic Imports / Require**: No `require`, `import()`, or `module`.
- **No Global Mutation**: Environment variables (`process.env`) and database handles are strictly excluded from `scriptContext`.

---

## 5. Surviving Consumers

The extracted `ExpressionEvaluator` is actively consumed by:
1. **MCP (Model Context Protocol)**: Resolving dynamic properties and action inputs for tool calls.
2. **Headless Tool Execution**: `ExecuteToolOperation` / `pieceHelper.executeTool`.
3. **Trigger Life Cycle**: `TriggerBinding` setup, webhooks, polling setup (`triggerHelper.ts`).
4. **Dynamic Properties / Dropdowns**: `pieceHelper.executeProps` for dependent dropdown options.
