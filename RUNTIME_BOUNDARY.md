# RUNTIME_BOUNDARY

**Companion to `ADR-001_HEADLESS_RUNTIME.md` — Decisions 3, 5, 6 and blockers B2, B5, B6.**
Package ownership, import rules, and what each layer is permitted to know.
Design document. No code changed.

---

## 1. The boundary that matters

One rule generates most of the others:

> **Nothing below the execution control plane may know that an `Execution` exists, and nothing above
> the sandbox may know how a box is provisioned.**

Applied to the current tree:

```
  server/api/src/app/{execute,prompt,mcp,execution,planner,trigger}
        │  knows: HTTP, principals, projects, executions, events
        ▼
  packages/runtime                     HeadlessRuntime
        │  knows: connections, provisioning, ONE engine operation
        │  MUST NOT know: HTTP, planner, persistence, executions
        ▼
  packages/server/sandbox              boxes, caches, provisionKey, RPC
        │  MUST NOT know: connections, projects, executions
        ▼
  packages/server/engine               integrations, props, auth, triggers, SSRF
           MUST NOT know: executions, planners, the database
```

Three of these four boundaries are violated today, and none is enforced by tooling.

---

## 2. Sandbox — removing FlowVersion (Decision 5)

### What the coupling actually is

`HeadlessRuntime` constructs `ProvisionInput` directly (`runtime/src/index.ts:49`) and never sets
`ResolveInput.flow`. `resolver.ts:21` guards the entire flow branch behind
`if (!isNil(input.flow))`. **On the production path the coupling is compile-time only** — the flow
resolution code is dead at runtime, retained by types.

### Site-by-site

| Site | Today | Target |
|---|---|---|
| `types.ts:2` | imports `FlowVersion`, `FlowVersionState`, `SourceCode` from `shared` | import nothing from `shared` |
| `types.ts:19` | `ResolveInput.flow?: { id, versionId, projectId }` | deleted |
| `types.ts:24` | `ResolveResult = { kind:'ready', provision, flowVersion? } \| 'flow-not-found' \| 'disabled'` | whole type deleted |
| `types.ts:11` | `Resolver` | deleted — its only job was flow → provision |
| `types.ts:52` | `PreWarmSandboxParams.flow` | → `integrations: PiecePackage[]` |
| `types.ts:61` | `ProvisionInput.flowVersionId?` | → `provisionKey: string` |
| `types.ts:89` | `CodeArtifact { sourceCode, flowVersionId, flowVersionState }` | deleted |
| `types.ts:64` | `ProvisionInput.codes: CodeArtifact[]` | deleted |
| `resolver.ts` | whole file | deleted |
| `sandbox.ts:70` | `sandbox.start({ flowVersionId })` | `sandbox.start({ provisionKey })` |
| `sandbox.ts:102-131` | `prewarm` walks flows via `apiClient.getPrewarmData` | re-keyed on connected integrations |
| `index.ts` | exports `createResolver`, `Resolver`, `ResolveInput`, `ResolveResult`, `CodeArtifact` | removed from the barrel |

### Target contract

```ts
export type ProvisionInput = {
    platformId: string
    provisionKey: string          // hash of the sorted piece set
    pieces: PiecePackage[]
    publicApiUrl: string
    engineToken: string
}
```

This is what `HeadlessRuntime` already builds, minus `flowVersionId` and `codes`.

### The cache-key upgrade

`flowVersionId` was the sandbox cache key. `provisionKey = hash(sorted piece set)` is strictly better
for this product: two executions using the same integrations share a warm box, instead of each flow
version owning one. In a runtime where every turn is a fresh execution, per-version keying would have
been pathological — an unbounded number of single-use cache entries.

### Prewarm survives, re-keyed

Prewarm is a real latency lever: the first tool call after a prompt is the one the user waits on.
Its key changes from "this project's active flows" (no longer exists) to "this project's connected
integrations" (available from `appConnectionService`, and a better predictor of what will run).

---

## 3. Code execution — separating two subsystems that share a name (Decision 3)

The audit's "code sandbox / code artifacts / provisioning / flow cache" is two independent things.
Conflating them would either delete a live security boundary or retain a dead pipeline.

### (a) Code-step pipeline — DELETE

Exists solely to turn a `FlowVersion`'s CODE steps into artifacts. No producer remains:
`HeadlessRuntime` passes `codes: []` at `runtime/src/index.ts:52` and `:105`;
`user-interaction-watcher.ts:60` passes `codes: []`.

| File | Role |
|---|---|
| `sandbox/src/lib/cache/flow/code/code-builder.ts` | Compiles a `CodeArtifact` |
| `sandbox/src/lib/cache/flow/code/code-cache.ts` | Per-version compiled cache |
| `sandbox/src/lib/cache/flow/flow-provisioning.ts` | Flow → pieces + code |
| `sandbox/src/lib/cache/flow/flow-steps.ts` | Graph walk to collect steps |
| `sandbox/src/lib/cache/flow/flow-cache.ts` | Per-version bundle cache |
| `sandbox/src/lib/cache/flow/flow-bundle-store.ts` | Publishes compiled bundles |
| `sandbox/src/lib/resolver.ts` | Whole file |
| `CodeArtifact`, `ProvisionInput.codes`, `SourceCode` | Types |

`local-execution-cache.ts` is **kept**, with its `codeSteps` parameter removed — piece provisioning
is the live half.

### (b) Expression evaluator — KEEP, rename

`props-resolver.ts:252` calls `initCodeSandbox().runScript({ script, scriptContext, functions })` from
`evalInScope`, which evaluates `{{ }}` variable interpolation during property resolution. This is on
the **live** `EXECUTE_PROPERTY` path — the one MCP's capability tools depend on.

| File | Keep as |
|---|---|
| `engine/src/lib/core/code/code-sandbox.ts` | `expression-sandbox.ts` |
| `engine/src/lib/core/code/code-sandbox-common.ts` | `expression-sandbox-common.ts` |
| `engine/src/lib/core/code/no-op-code-sandbox.ts` | `no-op-expression-sandbox.ts` |
| `engine/src/lib/core/code/v8-isolate-code-sandbox.ts` | `v8-isolate-expression-sandbox.ts` |

The rename is not cosmetic. Once (a) is deleted, "code sandbox" is a name with no remaining referent,
and the next cleanup pass will read these four files as leftovers of the pipeline it just removed.
Note that `no-op-code-sandbox.ts` and `v8-isolate-code-sandbox.ts` have **zero static inbound edges** —
they are loaded via `await import()` at `code-sandbox.ts:8,13`, so a reverse-dependency scan reports
them as dead. This has already nearly caught one audit.

`ExecutionMode` semantics are unchanged: `SANDBOX_CODE_ONLY` and `SANDBOX_CODE_AND_PROCESS` select the
V8 isolate; `UNSANDBOXED` and `SANDBOX_PROCESS` select the no-op.

### Deferral

Planner-authored code (code-mode / CodeAct) would reuse **(b)**, not (a). Revisit when measured
multi-tool turns routinely exceed ~5 sequential calls and round-trip latency dominates. Deleting (a)
does not foreclose it — (a) is keyed on flow versions and is the wrong foundation regardless.

---

## 4. FlowVersion removal order (Decision 6)

`FlowVersion` has four live consumers. They must be cut in dependency order or the build breaks
mid-sequence.

| # | Consumer | Site | Cut |
|---|---|---|---|
| 1 | `ExecutePropsOptions.flowVersion?` | `engine-operation.ts:88` | Optional and unused on the headless path — delete the field. **Cheapest** |
| 2 | Sandbox `Resolver` / `CodeArtifact` | `sandbox/src/lib/types.ts:24,102` | §2 + §3a |
| 3 | MCP `PopulatedFlow` | `mcp-service.ts:99` | `MCP_ARCHITECTURE.md` §7 step 1 |
| 4 | `ExecuteTriggerOperation.flowVersion` | `engine-operation.ts:103` | → `TriggerBinding` (`TRIGGER_MODEL.md` §4). **Required field — hardest** |

Only after all four: delete `flows/flow-version.ts`, `flows/flow.ts`, `flows/actions/action.ts`,
`flows/triggers/trigger.ts`, `flows/util/flow-structure-util.ts`, `flows/operations/**` (18
builder-only files retained transitively by one barrel exporting `FlowOperationType`),
`flows/folders/folder.ts`, `flows/note.ts`, `flows/sample-data/**`, `flows/test-trigger.ts`,
`flow-run/**`.

---

## 5. B2 — contract ownership

**58 declarations are defined twice**, once in `core-execution` and once in `core-piece-types`. 41 are
structurally identical, 15 differ cosmetically, **2 diverge semantically**. `tsc` cannot see this:
`shared` star-exports `core-execution`, `pieces-framework` re-exports `core-piece-types`, and there is
no ambiguous re-export, so it compiles cleanly.

**Decision: `core-piece-types` owns the piece-facing contract surface.**

Four reasons, in order of weight:

1. **Dependency direction already permits it.** `core-execution` may import `core-piece-types` — it
   already does, at `engine-operation.ts:4,8,9`. The reverse would invert the thin→thick order in
   `core-packages.md`.
2. **Integrations already honour it.** Zero integration files import legacy workflow symbols;
   `pieces-framework` re-exports only from `core-piece-types`. Choosing the other direction would
   require changing the side that is already correct.
3. **Its zod style already complies.** `core-execution` uses the deprecated `z.nativeEnum`, which
   `CLAUDE.md` explicitly forbids in favour of `z.enum`. The 15 cosmetic divergences all point the
   same way: the `core-execution` copies are the stale ones.
4. **It is the thinner package.** Contracts belong at the bottom.

The two real divergences:

| Symbol | Divergence | Resolution |
|---|---|---|
| `TriggerPayload` | `core-execution` schema validates `method`; `core-piece-types` omits it from the schema while both TS types declare it — so a payload parsed with the piece-types copy **silently drops `method`** | Fix the `core-piece-types` schema to include `method`; delete the `core-execution` copy |
| `PopulatedFlow` | `core-execution` has a zod schema over the full flow model; `core-piece-types` has a hand-written structural subset with no validator. **The same name denotes two different contracts across an unvalidated socket boundary** | **Neither is kept.** Both deleted with Decision 6 |

`PopulatedFlow` is worth dwelling on: it is the clearest illustration of why import-count-driven
cleanup fails. Both copies had consumers, so both looked live; the correct answer was to delete both,
which is only visible from the product.

---

## 6. B5 — the engine's `shared` dependency

`.claude/rules/core-packages.md`:

> pieces and **the engine** may import `core-utils | core-piece-types | core-formula |
> core-execution`, but **never** `@activepieces/shared`

Actual state: `packages/server/engine/package.json:14` declares the dependency and **31 source files**
import from it (plus 7 test files). Because `shared` star-exports `core-execution`
(`shared/src/index.ts:37`), the engine reaches its own execution contracts *through the thick
app-level package* — dragging `dayjs`, `expr-eval`, `socket.io-client`, and the DB/EE/management
schemas into the engine bundle.

**Decision: move the contracts down. Do not amend the rule.**

Amending would concede that the engine depends on database and enterprise schemas. That is false
today — the engine imports a small, identifiable set of *runtime* contracts that merely happen to be
declared in `shared`:

| Symbol | Nature | Target |
|---|---|---|
| `AppConnection`, `AppConnectionValue` | Runtime contract — the engine receives a decrypted connection | `core-piece-types` (already has `AppConnectionValue`) |
| `PutStoreEntryRequest`, `STORE_KEY_MAX_LENGTH` | Runtime contract — piece store API | thin package |
| `FileType`, `FileCompression` | Runtime contract — file transport | thin package |
| `Project` | **App model** — the engine should take `projectId`, not a `Project` | narrow the call site |

Everything else the engine imports from `shared` is a `core-execution` symbol reachable directly once
the barrel indirection is removed.

**Enforcement is the point.** Nothing catches this today:
`packages/server/engine/.eslintrc.json` extends `../api/.eslintrc.json` and sets only `no-console:
off`; the root config restricts `lodash` alone. Add:

```jsonc
// packages/server/engine/.eslintrc.json
"no-restricted-imports": ["error", {
    "patterns": [{
        "group": ["@inboxfm-connect/shared", "@inboxfm-connect/shared/*"],
        "message": "The engine must not import the thick app-level package. Use core-utils | core-piece-types | core-formula | core-execution. See .claude/rules/core-packages.md"
    }]
}]
```

The same pattern belongs on every integration package. A documented rule with no enforcement
mechanism is how 31 violations accumulated silently.

---

## 7. B6 — unlinted packages

Root `.eslintrc.json` sets `"ignorePatterns": ["**/*"]`; a package is linted only if it supplies its
own config that re-includes its files.

| Package | `.eslintrc.json` | `lint` script | State |
|---|---|---|---|
| `packages/runtime` | **missing** | yes | **`turbo run lint` fails**: "All files matched by 'src/**/*.ts' are ignored" |
| `packages/scheduler` | **missing** | yes | same |
| `packages/server/utils` | **missing** | none | never linted |

Consequence: `packages/runtime/src/index.ts` — the single most important file in the headless
architecture — carries `private sandboxRuntime: any` (line 5), `log: console as any` (36),
`getSettings: () => any` (130), `database` methods returning `Promise<any>` (132-136),
`decryptAndRefresh(...): Promise<any>` (137), `result.response as any` (113), and `(action: any)`
(114). `CLAUDE.md` states **"No `any` type"** and **"No type casting"**. The file is exempt from both
by configuration accident.

The `as any` at line 5 is load-bearing: `createSandboxRuntime` returns `Runtime`, whose `execute`
requires `log: ApLogger` and a typed `provision`. Typing it properly surfaces real mismatches —
`console` is not an `ApLogger`, and `execute.controller.ts:44` also passes `console as any` into
`appConnectionService`. Those are genuine defects the `any` is hiding, not noise.

`user-interaction-watcher.ts` is worse: `log: log as any` (line 53), `NETWORK_MODE ... as any` (17),
and a whole-object `as any` on the settings literal (21).

**Additionally — a defect found while tracing, not a style issue.**
`user-interaction-watcher.ts:9` builds the runtime with `concurrency: 10`, allocating ten sandbox
managers, but every call passes `workerIndex: 0` (line 52). Nine managers are never used and all
property resolution serializes through box 0 — on the interactive path where dependent-dropdown
latency is most visible. Either pass a real index or set `concurrency: 1`.

---

## 8. Target package ownership

| Package | Responsibility | Current verdict | After |
|---|---|---|---|
| `core/utils` | Primitives | Clean | Clean |
| `core/piece-types` | **Piece-facing contracts (sole owner)** | 58 duplicates | Authoritative |
| `core/formula` | Expression evaluation | Clean | Clean |
| `core/execution` | **Runtime contracts only** | 34 of 66 files are workflow models; 14 dead; 93 of 171 exports unused | ~12 contract files; duplicates deleted |
| `core/shared` | App-level DTOs (DB/EE/management) | Sole distribution channel for legacy models via `export *` | Star-export of `core-execution` removed |
| `runtime` | Headless runtime facade | Unlinted, `any` throughout | Linted, typed |
| `server/sandbox` | Isolated execution | `Resolver`/`CodeArtifact`/`ProvisionInput` typed on `FlowVersion` | Provision-keyed, no workflow types |
| `server/engine` | Execution implementation | Imports `shared` in 31 files | `no-restricted-imports` enforced |
| `scheduler` | Scheduling | Clean but in-memory and silently failing | Interface kept, durable driver added |
| `server/api` | HTTP, control plane | Mixed | Executions, planner, triggers, MCP |

---

## 9. Rules to add

| # | Rule | Enforcement |
|---|---|---|
| R1 | The engine must not import `@inboxfm-connect/shared` | `no-restricted-imports` in `server/engine/.eslintrc.json` |
| R2 | Integrations must not import `@inboxfm-connect/shared` | same, per integration package |
| R3 | `core/execution` must not import `core/shared` | same |
| R4 | `packages/runtime`, `packages/scheduler`, `packages/server/utils` must be linted | add `.eslintrc.json` to each |
| R5 | `core/shared` must not `export *` from `core-execution` | explicit named re-exports only |
| R6 | No new entity with an ordered `steps` array | review-time rule — this is how `FlowVersion` returns under a new name |
| R7 | One execution path: every tool invocation goes through `runtime.execute` | review-time rule — parallel paths are how `engine-run-api.ts` died unnoticed |

R6 and R7 cannot be automated, which is exactly why they are written down. R6 in particular guards the
one property that makes this architecture different from the one it replaced: **the system stores what
happened, never what should happen.**
