# STEP_RUN_RESPONSE_AUDIT.md

**Date:** 2026-08-04  
**PR:** PR6 — Execution Contract Extraction

---

## Phase 1 — Complete Usage Audit for StepRunResponse

### 1. Who Imports StepRunResponse?

| Importer | File | Purpose |
|----------|------|---------|
| `engine/requests.ts` | `packages/core/execution/src/lib/engine/requests.ts` | Used in `UploadRunLogsRequest.stepResponse` field |
| `websocket/index.ts` | `packages/core/shared/src/lib/automation/websocket/index.ts` | Used in `EmitTestStepProgressRequest` type intersection |

### 2. Who Constructs StepRunResponse?

**Search:** `new StepRunResponse(...)` or `StepRunResponse.create(...)` or `z.object({...StepRunResponse})`

**Finding:** No direct construction found in API or worker code.

StepRunResponse is defined as a Zod schema (`z.object({...})`), not a class. It would be inferred from request bodies.

**Evidence:**
- `export const StepRunResponse = z.object({...})`
- `export type StepRunResponse = z.infer<typeof StepRunResponse>`

### 3. Who Serializes StepRunResponse?

**Search:** Serialization of `UploadRunLogsRequest` with `stepResponse`

**Finding:** `UploadRunLogsRequest` is sent from worker to API for log uploads. The `stepResponse` field contains `StepRunResponse`.