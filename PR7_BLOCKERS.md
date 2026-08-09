# PR7_BLOCKERS

**PR7 — Stop conditions.** Generated because three of the four documented stop conditions were hit
during the audit.

The instruction was to stop and document rather than guess. Nothing below is a proposed abstraction —
each item states what was found, what evidence supports it, and what decision is needed from a human.

| # | Stop condition | Triggered |
|---|---|---|
| SC1 | A runtime contract cannot be distinguished from a workflow model | **YES** → B1 |
| SC2 | A strategic subsystem depends on a legacy workflow type | **YES** → B3, B4, B5 |
| SC3 | A recommendation would require inventing a new abstraction | **YES** → B1, B3 (both deferred, no abstraction proposed) |
| SC4 | Evidence is inconclusive | **NO** — all findings are backed by parsed imports and direct file reads |

---

## B1 — Run-reporting contracts are simultaneously runtime contracts and workflow models

**Stop condition: SC1.** This is the blocker the classification scheme cannot resolve.

`packages/core/execution/src/lib/engine/requests.ts` defines the engine→API callback surface. These are
unambiguously *runtime* contracts: they are the engine's outbound wire format. But their fields are
workflow models:

```ts
// requests.ts:73
export type UpdateRunProgressRequest = {
    flowRun: Omit<FlowRun, 'steps'>
    step?: { name: string, path: readonly [string, number][], output: StepOutput }
}

// requests.ts:11 — UploadRunLogsRequest embeds:
//   status:        FlowRunStatus
//   failedStep:    FailedStep
//   stepResponse:  StepRunResponse
//   internalError: RunInternalError
```

`FlowRun`, `StepOutput`, `FlowRunStatus`, `FailedStep`, `StepRunResponse` are all `LEGACY_WORKFLOW`.
`UpdateRunProgressRequest` and `UploadRunLogsRequest` are `EXECUTION_CONTRACT`. **The same declaration
belongs in two categories**, which is exactly the case Phase 1 was told to stop on.

### What makes this decidable rather than philosophical

All four run-reporting contracts are **dead** today:

| Contract | Only consumer | Consumer's importers | Target endpoint | Route exists? |
|---|---|---|---|---|
| `UploadRunLogsRequest` | `engine-run-api.ts` | **0** | `v1/engine/run-logs` | **NO** |
| `UpdateRunProgressRequest` | `engine-run-api.ts` | **0** | `v1/engine/run-progress` | **NO** |
| `SendFlowResponseRequest` | `engine-run-api.ts` | **0** | `v1/engine/flow-response` | **NO** |
| `UpdateStepProgressRequest` | `engine-run-api.ts` + `shared/lib/automation/websocket` | 0 / 1 | `v1/engine/step-progress` | **NO** |

A grep of `packages/server/api/src/app` for `run-progress`, `step-progress`, `run-logs`, and
`flow-response` returns **zero matches**. The server halves were removed in an earlier PR; the engine
halves and their contracts were not.

**Decision needed:** does headless execution need *any* progress/log reporting channel?

- **If no** — delete `engine-run-api.ts`, then the 4 contracts, then `log-serializer.ts`. This is
  already staged as candidates 13-14 in `DELETE_CANDIDATES.md` and needs no new types.
- **If yes** — a replacement contract must be designed around execution identity, not `FlowRun`. That
  is a new abstraction, so PR7 does not propose one.

**Blocked until answered:** final classification of `requests.ts` and the removal of `FlowRun` /
`StepOutput` / `FailedStep` from `core/execution`.

---

## B2 — `PopulatedFlow` is two different contracts under one name, across the sandbox boundary

**Stop condition: SC1.**

58 declarations are duplicated between `core-execution` and `core-piece-types`. 41 are identical,
15 differ only in zod style. Two differ materially, and `PopulatedFlow` is the dangerous one:

```ts
// core-execution — a zod schema; validates at runtime; full flow model
export const PopulatedFlow = Flow.extend({
    version: FlowVersion,
    triggerSource: zMini.optional(zMini.pick(TriggerSource, { schedule: true })),
})

// core-piece-types — a TS type; no validator; narrow structural subset
export type PopulatedFlow = {
    id: string
    externalId?: string
    status: FlowStatus
    version: { displayName: string, trigger: { type, settings: { pieceName?, input } } }
}
```

The server side (`engine/src/lib/piece-context/flows.ts`) imports the **zod** copy via `shared`.
Integrations import the **structural** copy via `pieces-framework`. The object crosses the sandbox
socket between them, and `rpc.ts` performs **no validation** in either direction.

The second material divergence, `TriggerPayload`, is smaller but the same shape of problem: the
`core-execution` schema validates `method`, the `core-piece-types` schema omits it from the schema while
both TS types declare it. A payload parsed with the `core-piece-types` copy silently drops `method`.

**Decision needed:** which package owns the piece-facing contract surface? Deduplicating requires
choosing a direction, and `core-piece-types` cannot import `core-execution` without breaking the thin
dependency order in `.claude/rules/core-packages.md`.

**Not attempted in PR7** — any fix is a new shared abstraction or a package-boundary change.

**Note:** 15 of the cosmetic divergences also mean `core-execution` still uses the **deprecated**
`z.nativeEnum`, which `CLAUDE.md` explicitly forbids in favour of `z.enum`. That part is a
mechanical fix, independent of the ownership decision.

---

## B3 — Sandbox's public seam is typed on `FlowVersion`

**Stop condition: SC2** — Sandbox is a named strategic subsystem.

`packages/server/sandbox/src/lib/types.ts` expresses the sandbox's entire resolve contract in workflow
vocabulary:

```ts
// :26
export type ResolveResult =
    | { kind: 'ready', provision: ProvisionInput, flowVersion?: FlowVersion }
    | { kind: 'flow-not-found' }
    | { kind: 'disabled' }

// :102
export type CodeArtifact = {
    name: string
    sourceCode: SourceCode
    flowVersionId: string
    flowVersionState: FlowVersionState
}
```

19 production import sites across 6 files (`types.ts`, `resolver.ts`, `flow-provisioning.ts`,
`flow-steps.ts`, `flow-cache.ts`, `flow-bundle-store.ts`) depend on `FlowVersion`, `FlowVersionState`,
`FlowActionType`, `FlowTriggerType`, `Step`, `flowStructureUtil`, `LATEST_FLOW_SCHEMA_VERSION`.

### Mitigating evidence — the headless path does not execute this

`HeadlessRuntime` constructs `provision` directly (`packages/runtime/src/index.ts:47`) and never sets
`ResolveInput.flow`. `resolver.ts:19` guards the whole flow branch:

```ts
if (!isNil(input.flow)) { … flowProvisioning(…).resolve(…) … }
```

So on the headless path the coupling is **compile-time only**. The flow branch is reachable solely
through `user-interaction-watcher.ts`, the only consumer of `@inboxfm-connect/sandbox` outside
`packages/runtime`.

**Decision needed:** is the code-step compilation path (which genuinely needs per-version cache keys)
retained for headless execution? `ProvisionInput.codes` is `CodeArtifact[]`, and `HeadlessRuntime`
always passes `codes: []`.

- If headless never runs code steps, `CodeArtifact` and the flow-cache subtree can go.
- If it will, the cache key needs a non-flow identity — a new abstraction, not proposed here.

---

## B4 — `EXECUTE_TRIGGER_HOOK` requires `FlowVersion`

**Stop condition: SC2** — this is a live engine operation.

```ts
// core/execution/src/lib/engine/engine-operation.ts:103
export type ExecuteTriggerOperation<HT extends TriggerHookType> = BaseEngineOperation & {
    hookType: HT
    test: boolean
    flowVersion: FlowVersion        // required, not optional
    webhookUrl: string
    triggerPayload?: JobPayload
    …
}
```

`EXECUTE_TRIGGER_HOOK` is one of the 6 live cases in `engine/src/lib/operations/index.ts:24`.
`trigger-helper.ts` reads `flowVersion` to resolve the trigger and its props.

The related `ExecutePropsOptions.flowVersion?: FlowVersion` (`engine-operation.ts:88`) is **optional**,
making `EXECUTE_PROPERTY` the cheaper of the two to decouple.

**Decision needed:** does the headless platform expose triggers at all? `triggerModule` and
`webhookModule` are commented out in `app.ts:203,196`, and `HeadlessRuntime` has no trigger method — but
the engine still dispatches the operation and `packages/scheduler` exists as a live, clean package.

- If triggers are out of scope → delete `EXECUTE_TRIGGER_HOOK`, `trigger-helper.ts`,
  `trigger-hook.operation.ts`, and `FlowVersion` loses its largest runtime consumer.
- If triggers are in scope → the operation needs an integration-level trigger descriptor rather than a
  flow version. New abstraction; not proposed.

---

## B5 — The engine violates the documented import boundary, and nothing enforces it

**Stop condition: SC2.**

`.claude/rules/core-packages.md`:

> pieces and **the engine** may import `core-utils | core-piece-types | core-formula | core-execution`,
> but **never** `@activepieces/shared`

Actual state: `packages/server/engine/package.json:14` declares `@inboxfm-connect/shared` as a
dependency, and **31 engine source files** import from it (plus 7 test files). Full list in
`HEADLESS_RUNTIME_BOUNDARY.md` §3a.

Because `shared` star-exports `core-execution` (`shared/src/index.ts:37`), the engine currently reaches
its execution contracts *through the thick app-level package* — pulling `dayjs`, `expr-eval`,
`socket.io-client`, and the DB/EE/management schemas into the engine's dependency graph.

**Nothing catches this:** `packages/server/engine/.eslintrc.json` extends `../api/.eslintrc.json` and
only sets `no-console: off`; the root `.eslintrc.json` restricts `lodash` only. There is no
`no-restricted-imports` rule for `@inboxfm-connect/shared`.

Integrations, by contrast, **do** honour the rule — `pieces-framework` re-exports only from
`core-piece-types`, and zero integration files import legacy workflow symbols.

**Not fixed in PR7** because it is not mechanical: some symbols the engine imports from `shared` are
declared in `shared` itself, not in `core-execution` — e.g. `AppConnection`, `AppConnectionValue`,
`PutStoreEntryRequest`, `STORE_KEY_MAX_LENGTH`, `Project`, `FileType`, `FileCompression`. Repointing
those imports means moving declarations between packages, which is the "do not propose moving them"
boundary of Phase 6.

**Decision needed:** are those connection/store/file contracts moved down into a thin package, or is
the engine's `shared` dependency accepted and the rule amended?

---

## B6 — `packages/runtime` is unlinted, and is `any`-typed throughout

**Not a stop condition** — reported because it undercuts the certification in Phase 7.

`packages/runtime` is the headless runtime. It has **no `.eslintrc.json`**. The root config sets
`ignorePatterns: ["**/*"]`, so a package is linted only if it re-includes itself. `npx turbo run lint`
therefore fails outright for this package:

```
All files matched by 'src/**/*.ts' are ignored.
ERROR @inboxfm-connect/runtime#lint: exited (2)
```

`packages/scheduler` fails identically (verified). `packages/server/utils` has no lint script at all.

Consequently `packages/runtime/src/index.ts` contains, unchecked:

| Line | Code |
|---|---|
| 5 | `private sandboxRuntime: any` |
| 36 | `log: console as any` |
| 130 | `getSettings: () => any` |
| 132-136 | `database` methods all returning `Promise<any>` |
| 137 | `decryptAndRefresh(params: { connection: any }): Promise<any>` |
| 112 | `const metadata = result.response as any` |
| 113 | `.map((action: any) => …)` |

`CLAUDE.md` states **"No `any` type"** and **"No type casting"**. The single most important file in the
headless architecture is exempt from both rules by configuration accident.

The `as any` at line 5 is load-bearing: `createSandboxRuntime` returns `Runtime`, whose
`execute(params: ExecuteParams)` requires `log: ApLogger` and a typed `provision`. Typing
`sandboxRuntime` properly would surface real mismatches — `console` is not an `ApLogger`, and
`execute.controller.ts:44` also passes `console as any` into `appConnectionService`.

**Recommended, mechanical, and low-risk:** add `.eslintrc.json` to `runtime`, `scheduler`, and
`server/utils`, then fix what it surfaces. Deliberately **not** done in PR7, which changes no code.

---

## Summary — what PR7 could not decide

| Blocker | Needs | Consequence if unanswered |
|---|---|---|
| B1 | Is run progress/log reporting in scope for headless? | `requests.ts` stays dual-classified; `FlowRun`/`StepOutput` undeletable |
| B2 | Which package owns piece-facing contracts? | 58 duplicated declarations persist; 2 diverge semantically |
| B3 | Are code steps in scope for headless? | Sandbox stays typed on `FlowVersion` |
| B4 | Are triggers in scope? | `FlowVersion` keeps its largest live consumer |
| B5 | Move connection/store/file contracts, or amend the rule? | Engine keeps importing `shared`, unenforced |
| B6 | (none — just do it) | Headless runtime stays unlinted and `any`-typed |

B1, B3, and B4 are the same question in three places: **does the headless platform keep any notion of a
multi-step run?** Answering that one question unblocks all three.
