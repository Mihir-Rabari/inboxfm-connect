# PR9 StepRunResponse Forensic Audit

## Findings

1. **Location & Export:**
   - Defined in: `packages/core/execution/src/lib/flows/sample-data/index.ts`
   - Re-exported via: `packages/core/execution/src/index.ts` -> `export * from './lib/flows/sample-data'`

2. **Consumers:**
   - `packages/core/execution/src/lib/engine/requests.ts`: `UploadRunLogsRequest` optional field `stepResponse?: StepRunResponse`
   - `packages/core/shared/src/lib/automation/websocket/index.ts`: `EmitTestStepProgressRequest = StepRunResponse & { projectId: string }`

3. **Runtime Validation & Usage Analysis:**
   - Zero active runtime constructed/parsed instances found in active API routes.
   - It is maintained purely as a contract type in `core-execution` & `shared` websocket definition.
   - However, placing execution step contracts under `flows/sample-data/index.ts` creates artificial coupling to legacy sample-data flow structures (`sampleDataFileId`, `sampleDataInputFileId`).

4. **Decoupling Strategy (Option B - Decouple & Rehouse):**
   - Relocate `StepRunResponse` into a clean execution contract location: `packages/core/execution/src/lib/engine/step-run-response.ts`.
   - Update `packages/core/execution/src/lib/engine/requests.ts` to import `StepRunResponse` from `./step-run-response`.
   - Keep legacy export in `sample-data/index.ts` for backward compatibility or re-export from `step-run-response`.
