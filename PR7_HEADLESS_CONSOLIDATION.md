# PR7 — Headless Runtime Consolidation & Legacy Boundary Elimination

**Status:** Analysis complete. **Zero code changes.** Six documents delivered.

This PR changes the project from *"we're deleting old code"* to *"we know exactly what the new platform
is."*

---

## What was done

Audited `packages/core/execution` (66 files) and `packages/server/engine` (45 files), plus every
package that consumes them, by parsing `import` / `export` statements across all **10,418**
non-`node_modules` TypeScript files in `packages/`.

Nothing here is inferred from file names or directory layout. Where the two disagreed with the actual
imports, the imports won.

### Deliverables

| Document | Contents |
|---|---|
| `HEADLESS_RUNTIME_BOUNDARY.md` | Phase 1 classification, Phase 2 real dependency graph, Phase 6 package ownership, Phase 7 certification |
| `LEGACY_DEPENDENCY_GRAPH.md` | Phase 3 — every legacy dependency with importer, symbol, and runtime reachability |
| `RUNTIME_CONTRACT_INVENTORY.md` | Phase 4 — every contract with owner, consumers, serializers, validators, production usage |
| `DELETE_CANDIDATES.md` | Phase 5 — 15 HIGH-confidence files, with required barrel edits |
| `PR7_BLOCKERS.md` | 6 blockers where the audit stopped instead of guessing |
| `PR7_HEADLESS_CONSOLIDATION.md` | This summary |

---

## The headline result

**The headless runtime is real, routed, and free of workflow types on the tool path.**

```
POST /v1/execute                    app.ts:205
  → HeadlessRuntime.execute         runtime/src/index.ts:17
    → Connection  (getConnection → decryptAndRefresh)
    → Sandbox     createSandboxRuntime, sandbox.ts:24
      → Engine    operations/index.ts:14  (6 operations, no flow execution)
        → Tool    pieceHelper.executeTool, piece-helper.ts:204
          → Result  EngineResponse<T>
```

`ExecuteToolOperation` carries **no workflow type**. Where flow identity is structurally required,
`piece-helper.ts:235` passes the string literal `'headless'` as a store-key sentinel.

Supporting evidence that the builder is genuinely gone:

- `packages/web` **does not exist**
- `getEntities()` registers **no** `Flow`, `FlowVersion`, `FlowRun`, `Folder`, `TriggerEvent`, or
  `Waitpoint` entity
- `flowModule`, `flowRunModule`, `folderModule`, `webhookModule`, `triggerModule`, `humanInputModule`,
  `workerModule` are all commented out in `app.ts`
- `Router`, `Loop`, and `Canvas` symbols have **zero** importers repo-wide
- Integrations import **zero** legacy workflow symbols

---

## Method note that changes the conclusions

`packages/core/shared/src/index.ts:37` contains `export * from '@inboxfm-connect/core-execution'`.

Because of that one line, **file-level** dependency analysis of `core/execution` returns almost
nothing — only `core/shared` imports it directly. All prior file-count-based conclusions about this
package are unreliable.

Two guards were run before trusting the symbol-level replacement:

- **0** namespace imports (`import * as X from '@inboxfm-connect/shared'`) exist, so no symbol can be
  reached without being named. Symbol-level analysis is sound.
- Naive whole-word text matching was tried and **rejected**: it reported `Note` 242 times, `Folder`
  119, `Flow` 46 — all prose and unrelated identifiers.

Dynamic `import()` was included in the scan. This caught `no-op-code-sandbox.ts` and
`v8-isolate-code-sandbox.ts`, which have zero static importers but are dynamically loaded at
`code-sandbox.ts:8,13`. A static-only analysis would have deleted live code.

---

## Findings

### 1. `core/execution` is majority-legacy, not an execution package

| Category | Files |
|---|---|
| `LEGACY_WORKFLOW` | **34** |
| `DEAD_CODE` | 14 |
| `EXECUTION_CONTRACT` | 12 |
| `SHARED_SCHEMA` (barrels) | 6 |

It also contains **no implementation** — zero `HEADLESS_RUNTIME` / `ENGINE_RUNTIME` /
`SANDBOX_RUNTIME` files. It is a pure contract package whose contracts are mostly workflow models.

### 2. 54% of the declared contract surface has no consumer

171 exported symbols, **78** imported by name, **93** unused. Concentrated in two files:
`worker-contract.ts` (29 exported, 3 used) and `job-data.ts` (26 exported, 8 used). The `engine/*`
contract files are healthy by contrast (54 of 70 used).

### 3. 58 declarations are duplicated between `core-execution` and `core-piece-types`

41 identical, 15 cosmetic zod-style drift, **2 semantically real**:

- **`TriggerPayload`** — the `core-execution` schema validates `method`; the `core-piece-types` schema
  omits it while both TS types declare it. Payloads parsed with the latter silently drop `method`.
- **`PopulatedFlow`** — a zod schema in one package, a hand-written structural subset with no validator
  in the other. Server and integrations use different copies, and the object crosses the sandbox socket
  between them with **no validation in either direction** (`rpc.ts`).

The 15 cosmetic diffs also mean `core-execution` still uses the deprecated `z.nativeEnum`, which
`CLAUDE.md` forbids.

### 4. The engine violates the project's own import boundary — unenforced

`.claude/rules/core-packages.md` says the engine must **never** import `@inboxfm-connect/shared`.
It does, in **31 source files**, and `shared` is a declared dependency in its `package.json`.

No lint rule catches this. The engine's `.eslintrc.json` only sets `no-console: off`; the root config
restricts `lodash` only.

### 5. The headless runtime package is unlinted and `any`-typed

`packages/runtime` has **no `.eslintrc.json`**. The root config sets `ignorePatterns: ["**/*"]`, so
`npx turbo run lint` fails outright for it. `packages/scheduler` fails identically (verified);
`packages/server/utils` has no lint script.

The result is that `packages/runtime/src/index.ts` — the most important file in the headless
architecture — carries `private sandboxRuntime: any`, `log: console as any`, `getSettings: () => any`,
and `metadata as any`, in a codebase whose `CLAUDE.md` states **"No `any` type"** and
**"No type casting."**

### 6. Two engine files call endpoints that no longer exist

`engine-run-api.ts` POSTs to `v1/engine/{run-progress,step-progress,run-logs,flow-response}`.
`waitpoint-client.ts` POSTs to `v1/waitpoints`. **Neither has any importer, and no route in
`packages/server/api/src/app` serves any of those five paths.**

---

## Phase 7 certification: CONDITIONAL PASS

The `Connection → Integration → Tool → Execution → Result` path is certified free of `Flow`,
`Workflow`, `Trigger`, `Router`, `Loop`, `Builder`, and `Canvas`.

**5 violations remain**, all in the *trigger* and *run-reporting* paths, none on the tool path:

| # | Violation | Evidence |
|---|---|---|
| V1 | `ExecuteTriggerOperation.flowVersion` is **required** | `engine-operation.ts:103` |
| V2 | Sandbox `Resolver` / `CodeArtifact` typed on `FlowVersion` | `sandbox/src/lib/types.ts:26,102` |
| V3 | MCP depends on `PopulatedFlow` | `mcp-service.ts` (module unrouted) |
| V4 | Run-reporting contracts embed `FlowRun`, `StepOutput`, `FailedStep` | `requests.ts:11,73` |
| V5 | `ExecutePropsOptions.flowVersion?` (optional) | `engine-operation.ts:88` |

V2's coupling is **compile-time only on the headless path** — `HeadlessRuntime` never sets
`ResolveInput.flow`, and `resolver.ts:19` guards the entire flow branch behind `if (!isNil(input.flow))`.

---

## Blockers — where the audit stopped instead of guessing

Three of four documented stop conditions triggered. Full detail in `PR7_BLOCKERS.md`.

| Blocker | Question that must be answered by a human |
|---|---|
| **B1** | Is run progress/log reporting in scope for headless? *(`requests.ts` is genuinely both a runtime contract and a workflow model — SC1)* |
| **B2** | Which package owns piece-facing contracts? *(deduplication requires a direction; `core-piece-types` cannot import `core-execution` without breaking the thin-package order)* |
| **B3** | Are code steps in scope for headless? *(`HeadlessRuntime` always passes `codes: []`)* |
| **B4** | Are triggers in scope? *(`triggerModule` is off, but the engine still dispatches `EXECUTE_TRIGGER_HOOK`)* |
| **B5** | Move connection/store/file contracts into a thin package, or amend the import rule? |
| **B6** | None — just add the three missing `.eslintrc.json` files |

**B1, B3, and B4 are the same question in three places: does the headless platform keep any notion of a
multi-step run?** One answer unblocks all three.

---

## Validation

Run against the unmodified tree, since PR7 changes no code. These numbers are the **baseline** any
follow-up PR should compare against — they are not a clean bill of health.

| Command | Result |
|---|---|
| `npx turbo run build` (full) | **758 of 759 succeed.** `@inboxfm-connect/cli#build` fails |
| `npx turbo run build` (runtime-critical 10) | **10/10 succeed** — `core-utils`, `core-piece-types`, `core-formula`, `core-execution`, `shared`, `pieces-framework`, `server-utils`, `engine`, `sandbox`, `runtime` |
| `npx turbo run lint` (core-execution, engine, sandbox) | **pass** |
| `npx turbo run lint` (runtime) | **fails** — no `.eslintrc.json` |
| `npx turbo run lint` (scheduler) | **fails** — no `.eslintrc.json` |

**Both failures are pre-existing and not caused by PR7** (`git status` shows no new modifications).

`@inboxfm-connect/cli#build` fails with 4 × `TS2305` in `src/lib/commands/replace-project.ts`:
`ProjectReplaceRequest`, `ProjectReplaceResponse`, `RequiredPiece`, `TableState` are no longer exported
from `@inboxfm-connect/shared` — fallout from an earlier PR's removals.

Success criteria as stated:

| Criterion | Status |
|---|---|
| Zero compile regressions | **Met** — no code changed; baseline recorded, incl. the 1 pre-existing failure |
| Zero runtime regressions | **Met** — no code changed |
| Zero new abstractions introduced | **Met** — B1/B2/B3/B4 deferred precisely because fixing them would require one |
| Zero placeholder code | **Met** |

---

## What a follow-up PR can do without re-discovery

**Immediately, no decisions needed:**

1. Delete the 15 HIGH-confidence files + 12 barrel edits (`DELETE_CANDIDATES.md` §2-3). Removes 41
   exported symbols.
2. Add `.eslintrc.json` to `runtime`, `scheduler`, `server/utils`; fix what it surfaces (B6).
3. Replace deprecated `z.nativeEnum` with `z.enum` in `core-execution` (15 sites, per `CLAUDE.md`).

**Largest single win, one small decision:** move `FlowOperationType` and
`StepLocationRelativeToParent` out of `lib/flows/operations/index.ts`, or repoint their 3 consumers.
That releases **16 files and 21 symbols** with zero external consumers, currently held only by a shared
barrel.

**After B1 is answered:** delete `engine-run-api.ts`, the 4 run-reporting contracts, and
`log-serializer.ts` — which in turn releases `FlowRun`, `StepOutput`, and `FailedStep`.
