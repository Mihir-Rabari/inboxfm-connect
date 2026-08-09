# ExpressionEvaluator Headless Design

## 1. Architectural Role & Interfaces

The `ExpressionEvaluator` module isolates runtime expression evaluation (variable interpolation, math/JS expressions, nested lookups) from arbitrary user script execution and visual flow step execution.

### Core Interface (`expression-evaluator.ts`):

```typescript
export type ExpressionEvaluateOptions = {
    /** The expression or script string to evaluate in Javascript scope */
    script: string
    /** Safe, controlled context object available to the expression */
    scriptContext: Record<string, unknown>
    /** Explicitly registered helper functions (e.g. flattenNestedKeys) */
    functions?: Record<string, (...args: unknown[]) => unknown>
}

export const expressionEvaluator = {
    async evaluate(options: ExpressionEvaluateOptions): Promise<unknown>
}
```

---

## 2. Execution & Isolation Model

Depending on `AP_EXECUTION_MODE`, `ExpressionEvaluator` delegates script execution to `v8IsolateCodeSandbox` (when sandboxed) or `noOpCodeSandbox`:

```
               props-resolver / pieceHelper / triggerHelper
                                   │
                                   ▼
                          ExpressionEvaluator
                                   │
                     ┌─────────────┴─────────────┐
                     ▼                           ▼
        (SANDBOX_CODE_ONLY /           (UNSANDBOXED)
      SANDBOX_CODE_AND_PROCESS)                  │
                     │                           ▼
                     ▼                    Function(...args)
             V8 Isolate (128MB)
            no fs / net / process
```

- **In V8 Isolate Mode**: The expression is compiled and run inside `isolated-vm` without access to Node.js builtins (`fs`, `net`, `child_process`, `process.env`).
- **Context Priming**: `scriptContext` is safely copied into the V8 isolate scope via `ivm.ExternalCopy`.

---

## 3. Security Boundary Guarantees

| Feature / Access | Status | Enforcement |
| :--- | :--- | :--- |
| **Filesystem Access** (`fs`, `readFile`, file descriptors) | **Forbidden** | Excluded from isolate scope |
| **Network Access** (`fetch`, `net`, `http`, `socket`) | **Forbidden** | Excluded from isolate scope |
| **Process Control / Env** (`process.env`, `exit`, `spawn`) | **Forbidden** | Excluded from isolate scope |
| **Module Imports** (`require`, `import()`) | **Forbidden** | `require` is not defined in isolate wrapper |
| **Runtime Interpolation** (`{{ input.foo }}`) | **Allowed** | Evaluated against `scriptContext` |
| **Custom Helper Functions** (`flattenNestedKeys`) | **Allowed** | Explicitly serialized or passed in scope |
