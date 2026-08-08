# Evaluator Architecture — Headless Integration Runtime

## 1. Executive Separation: Arbitrary Code vs Expression Evaluation

To establish a secure, headless architecture, we strictly separate user code execution from property interpolation:

```
                          ┌───────────────────────────┐
                          │   Execution Subsystem     │
                          └─────────────┬─────────────┘
                                        │
             ┌──────────────────────────┴──────────────────────────┐
             ▼                                                     ▼
A. Arbitrary Code Execution Pipeline                  B. Runtime Property Interpolation
   - User JS/TS scripts                                  - String template {{ connections.slack.token }}
   - Custom code steps                                   - Dynamic property expressions in props-resolver.ts
   - Code sandbox bundlers                               - V8 Isolate expression context
   ──> [ DELETE COMPLETELY ]                             ──> [ KEEP & RENAME to ExpressionEvaluator ]
```

---

## 2. ExpressionEvaluator Architecture

The `ExpressionEvaluator` leverages isolated V8 contexts to evaluate expressions (e.g. `{{ input.foo }}`) without arbitrary network/filesystem access.

### 2.1 Responsibilities
- Interpolate double-curly expressions (`{{ ... }}`) in tool inputs.
- Parse JSON path expressions against runtime inputs and connection metadata.
- Provide safe type coercion and fallback handling.

### 2.2 Components & Renaming Strategy
- `props-resolver.ts` → Refactor to rely exclusively on `ExpressionEvaluator`.
- `code-sandbox` (V8 isolate wrapper used for props evaluation) → Rename to `ExpressionEvaluator`.
- Delete `code-artifact`, user custom code bundle compilation, and legacy code step executors.
