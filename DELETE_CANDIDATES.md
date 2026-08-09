# DELETE_CANDIDATES

**PR7 — Phase 5.** Only files with `Delete Confidence = HIGH` are listed.

No deletions were performed in PR7. This is the evidence package a future PR can execute against
without re-discovery.

---

## 1. Confidence criteria

A file is **HIGH** only if all five hold:

1. **Imports** — no file outside `packages/core/execution` imports any symbol it declares, by name.
2. **Runtime reachable** — NO. Not on the `POST /v1/execute` path, the engine dispatch switch, or the
   sandbox provisioning path. Dynamic `import()` sites were included in the scan.
3. **Database reachable** — NO. No corresponding entity in `getEntities()`
   (`packages/server/api/src/app/database/database-connection.ts:54-99`).
4. **HTTP reachable** — NO. No registered route reaches it; where a callback URL exists, no server
   route serves that path.
5. **Fixed-point closure** — every file that imports it internally is itself HIGH.

Anything failing even one criterion was demoted and is listed in §5.

Two facts make criterion 1 decisive rather than suggestive:
- There are **0** namespace imports (`import * as X from '@inboxfm-connect/shared'`) anywhere in the
  repo, so no symbol can be reached without being named.
- **`packages/web` does not exist.** The flow builder that consumed the canvas/operations/DTO surface is
  already gone, which is why these files have no consumer.

---

## 2. HIGH-confidence delete candidates — 15 files

| # | File | Exported symbols | Imports | Runtime reachable | DB reachable | HTTP reachable | Confidence |
|---|---|---|---|---|---|---|---|
| 1 | `core/execution/src/lib/flows/util/flow-canvas-util.ts` | 8 | 0 | NO | NO | NO | **HIGH** |
| 2 | `core/execution/src/lib/flows/form.ts` | 7 | 0 | NO | NO | NO | **HIGH** |
| 3 | `core/execution/src/lib/flows/folders/folder-requests.ts` | 5 | 0 | NO | NO | NO | **HIGH** |
| 4 | `core/execution/src/lib/flows/folders/list-folders-response.ts` | 1 | 0 | NO | NO | NO | **HIGH** |
| 5 | `core/execution/src/lib/flows/dto/list-flows-request.ts` | 3 | 0 | NO | NO | NO | **HIGH** |
| 6 | `core/execution/src/lib/flows/dto/create-flow-request.ts` | 1 | 0 | NO | NO | NO | **HIGH** |
| 7 | `core/execution/src/lib/flows/dto/count-flows-request.ts` | 1 | 0 | NO | NO | NO | **HIGH** |
| 8 | `core/execution/src/lib/flows/dto/flow-mcp.requests.ts` | 1 | 0 | NO | NO | NO | **HIGH** |
| 9 | `core/execution/src/lib/flows/triggers/trigger-events/trigger-event.ts` | 3 | 0 | NO | NO | NO | **HIGH** |
| 10 | `core/execution/src/lib/flows/triggers/trigger-events/trigger-events-dto.ts` | 2 | 0 | NO | NO | NO | **HIGH** |
| 11 | `core/execution/src/lib/flow-run/dto/list-flow-runs-request.ts` | 4 | 0 | NO | NO | NO | **HIGH** |
| 12 | `core/execution/src/lib/flow-run/execution/execution-journal.ts` | 4 | 0 | NO | NO | NO | **HIGH** |
| 13 | `core/execution/src/lib/flow-run/log-serializer.ts` | 1 | 0 | NO | NO | NO | **HIGH** |
| 14 | `server/engine/src/lib/api/engine-run-api.ts` | 1 | 0 | NO | NO | **NO — endpoints absent** | **HIGH** |
| 15 | `server/engine/src/lib/piece-context/waitpoint-client.ts` | 1 | 0 | NO | NO | **NO — endpoint absent** | **HIGH** |

**Total: 41 exported symbols across 15 files.**

### 2a. Per-file evidence

**1. `flow-canvas-util.ts`** — declares `flowCanvasUtils` + 7 `FLOW_CANVAS_*` layout constants
(step height/width, vspace, arc, loop and router voffsets, hspace). Pure builder-canvas geometry.
Zero importers for all 8. Its only outbound edge is to `flow-structure-util`. Re-exported at
`core/execution/src/index.ts:20`.

**2. `form.ts`** — `FormInputType`, `FormInput`, `FormProps`, `FormResponse`, `ChatUIProps`,
`ChatUIResponse`, `USE_DRAFT_QUERY_PARAM_NAME`. All 7 unimported. `USE_DRAFT_QUERY_PARAM_NAME` *is*
used by integrations, but from the **`core-piece-types` duplicate**
(`core/piece-types/src/lib/flow-contracts.ts`, re-exported via `pieces-framework`), not this copy.
`humanInputModule` is commented out at `app.ts:206`. Re-exported via `lib/flows/index.ts:1`.

**3-4. Folder DTOs** — `CreateFolderRequest`, `UpdateFolderRequest`, `DeleteFolderRequest`,
`DeleteFlowRequest`, `ListFolderRequest`, `FolderDto`. `folderModule` is commented out at
`app.ts:184`; no folder entity is registered. Note `folder.ts` itself is **retained** (`Folder` is
still imported by `server/api/src/app/tables/table/table.entity.ts` and `cli`), only the request DTOs go.
`FolderDto` is declared in *both* `folder.ts` and `list-folders-response.ts`; neither is imported.

**5-8. Flow DTOs** — `ListFlowsRequest`, `GetFlowQueryParamsRequest`, `ListFlowVersionRequest`,
`CreateFlowRequest`, `CountFlowsRequest`, `CreateMCPServerFromStepParams`. `flowModule` is commented
out at `app.ts:194`. No flow entity registered.

**9-10. Trigger-event DTOs** — `TriggerEventId`, `TriggerEvent`, `TriggerEventWithPayload`,
`ListTriggerEventsRequest`, `SaveTriggerEventRequest`. `triggerModule` commented out at `app.ts:203`;
no `TriggerEventEntity` registered.

**11. `list-flow-runs-request.ts`** — `ListFlowRunsRequestQuery`, `CountFlowRunsByStatusRequest`,
`FlowRunCountByStatus`, `CountFlowRunsByStatusResponse`. `flowRunModule` commented out at `app.ts:195`.

**12. `execution-journal.ts`** — `executionJournal`, `UpsertStepParams`, `GetStepParams`,
`GetStateAtPathParams`. The step-state accumulator for flow execution. No `EXECUTE_FLOW` operation
exists (`EngineOperationType` has 6 members, none of them flow execution), so there is no step journal
to keep. Re-exported via `lib/flow-run/execution/index.ts:1`.

**13. `log-serializer.ts`** — `logSerializer`. Serialized flow-run step logs for upload. Its consumer
would be the run-log upload path, which is candidate #14.

**14. `engine-run-api.ts`** — `engineRunApi` with `updateRunProgress`, `updateStepProgress`,
`uploadRunLog`, `sendFlowResponse`. **Zero importers, static or dynamic.** It POSTs to
`${apiUrl}v1/engine/{run-progress,step-progress,run-logs,flow-response}`. A search of
`packages/server/api/src/app` for those four path segments returns **no matches** — the server side was
removed. Deleting this also strips the last consumer of `UploadRunLogsRequest`,
`UpdateRunProgressRequest`, and `SendFlowResponseRequest`.

**15. `waitpoint-client.ts`** — `waitpointClient.create`. **Zero importers.** POSTs to
`${apiUrl}v1/waitpoints`; no route serves `waitpoints`. Deleting this strips the last consumer of
`CreateWaitpointRequest` / `CreateWaitpointResponse`, which makes
`core/execution/src/lib/flow-run/waitpoint/index.ts` deletable in the same pass.

---

## 3. Required barrel edits

Every deletion needs its re-export line removed, or the build breaks. These edits are the only
non-deletion changes required.

`packages/core/execution/src/index.ts`:

| Line | Statement | For candidate |
|---|---|---|
| 12 | `export * from './lib/flows/dto/count-flows-request'` | 7 |
| 11 | `export * from './lib/flows/dto/create-flow-request'` | 6 |
| 13 | `export * from './lib/flows/dto/list-flows-request'` | 5 |
| 14 | `export * from './lib/flows/dto/flow-mcp.requests'` | 8 |
| 17 | `export * from './lib/flows/folders/folder-requests'` | 3 |
| 20 | `export * from './lib/flows/util/flow-canvas-util'` | 1 |
| 6 | `export * from './lib/flows/triggers/trigger-events/trigger-events-dto'` | 10 |
| 7 | `export * from './lib/flows/triggers/trigger-events/trigger-event'` | 9 |
| 22 | `export * from './lib/flow-run/dto/list-flow-runs-request'` | 11 |
| 27 | `export * from './lib/flow-run/log-serializer'` | 13 |

`packages/core/execution/src/lib/flows/index.ts:1` — `export * from './form'` (candidate 2).
`packages/core/execution/src/lib/flow-run/execution/index.ts:1` — `export * from './execution-journal'`
(candidate 12).

`list-folders-response.ts` (candidate 4) has **no** barrel line — it is orphaned even from the barrel.

Per `CLAUDE.md`, any change to `packages/core/shared` needs a version bump. These edits are in
`packages/core/execution` (`version: 0.8.1`), but they remove symbols from the `shared` public surface
via the star-export, so a **minor** bump of `packages/core/shared/package.json` is the correct call.

---

## 4. Second-order candidates (HIGH only after the above lands)

Not counted in the 15, because today they still have a consumer.

| File | Currently retained by | Becomes HIGH once |
|---|---|---|
| `core/execution/src/lib/flow-run/waitpoint/index.ts` | `CreateWaitpointRequest` / `Response` ← `waitpoint-client.ts` | candidate 15 is deleted |
| `core/execution/src/lib/engine/requests.ts` (4 of 7 symbols) | `UploadRunLogsRequest`, `UpdateRunProgressRequest`, `SendFlowResponseRequest`, `UpdateStepProgressRequest` ← `engine-run-api.ts` | candidate 14 is deleted **and** `shared/lib/automation/websocket/index.ts` stops re-exporting `UpdateStepProgressRequest` |
| `core/execution/src/lib/flows/operations/**` (16 files) | `operations/index.ts`, retained only for `FlowOperationType` + `StepLocationRelativeToParent` | those 2 symbols move out of `operations/index.ts`, or their 3 consumers (`rbac-middleware.ts`, `rbac-service.ts`, `mcp-tools.test.ts`) are repointed |

The third row is the largest single win available: **16 files, 21 symbols, 0 external consumers**,
held hostage by one enum and one const sharing a barrel with them.

---

## 5. Explicitly demoted — NOT delete candidates

| File / group | Why not HIGH |
|---|---|
| `core/execution/src/index.ts`, `lib/flows/index.ts`, `lib/flow-run/execution/index.ts`, `lib/flows/properties/index.ts`, `lib/agents/index.ts`, `lib/engine/index.ts` | Re-export barrels. They declare nothing, so a naive "no symbols consumed" test flags them — but they forward live files. **Must be retained** (edited, not removed) |
| `lib/agents/mcp-tool-name-util.ts` | 0 production importers, but `test/automation/agents/mcp-tool-name-util.test.ts` imports it. Duplicated in `core-piece-types`; delete only with its test |
| `lib/workers/chat-agent-events.ts` (11 symbols) | 0 external importers, but re-exported at `index.ts:29` **and** `shared/lib/ee/chat/index.ts` imports `ChatPromptOverride` from the same package. Needs the EE chat surface checked first — chat removal was PR1, so this is likely HIGH after one more check |
| `lib/flows/util/flow-piece-util.ts`, `lib/flows/triggers/trigger-run.ts` | 0 external importers, but imported internally by files that are themselves retained |
| `server/engine/src/lib/core/code/no-op-code-sandbox.ts`, `v8-isolate-code-sandbox.ts` | 0 *static* importers — **but dynamically loaded** at `code-sandbox.ts:8` and `:13`. A static-only analysis would wrongly delete these |
| `server/engine/src/main.ts` | 0 inbound by design; process entry point built by `esbuild.config.mjs` |
| `lib/flows/folders/folder.ts` | `Folder` still imported by `server/api/.../table.entity.ts` and `cli` |
| `server/api/.../migration/postgres/*` (4 files using `FlowVersion`) | Historical migrations. Deleting a shipped migration corrupts existing installs' migration history |
| `server/api/test/helpers/flow-generator.ts` | Test fixture for entities that no longer exist. Dead in spirit, but 14 test files still reference flow symbols — removing it is a test-suite change, not a runtime cleanup |

---

## 6. Verification for the executing PR

After deleting the 15 files and applying the §3 barrel edits:

```bash
npx turbo run build
npx turbo run lint --filter=@inboxfm-connect/core-execution --filter=@inboxfm-connect/engine
npm run test-unit
```

**Known pre-existing baseline** (present before any deletion, measured in PR7):

- `npx turbo run build` → **758 of 759 succeed**. `@inboxfm-connect/cli#build` fails with 4 × `TS2305`
  for `ProjectReplaceRequest`, `ProjectReplaceResponse`, `RequiredPiece`, `TableState`.
- `npx turbo run lint` → fails for `@inboxfm-connect/runtime` and `@inboxfm-connect/scheduler`:
  neither has an `.eslintrc.json`, and the root config sets `ignorePatterns: ["**/*"]`.

Compare against that baseline, not against green.
