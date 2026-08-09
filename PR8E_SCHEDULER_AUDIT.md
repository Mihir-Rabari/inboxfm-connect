# PR8E — Scheduler Audit

## Executive Summary

As part of the Headless AI Integration Runtime migration (PR8), the scheduling infrastructure has been audited to remove all legacy workflow graph dependencies (`Flow`, `FlowVersion`, `FlowRun`, `StepRun`) and transition into three clean, explicit conceptual planes:

1. **System Jobs Plane**: Platform maintenance, cleanup, sync, and background system operations.
2. **User Scheduled Task Plane**: Scheduled AI prompts and automated task executions initiated by users.
3. **Trigger Schedule Plane**: Time-based polling, cron execution, and renewal lifecycle operations for `TriggerBinding` entities (from PR8D).

---

## Existing Scheduler Architecture

- **`packages/scheduler`**:
  - Interface: `Scheduler` (`once`, `every`, `cron`, `cancel`, `shutdown`).
  - Implementation: `LocalScheduler` using `node-cron`, `setTimeout`, and `setInterval`.
  - Defect Identified: Silent error suppression in empty `catch {}` blocks across `once`, `every`, and `cron` execution handlers.

- **System Job Helper (`packages/server/api/src/app/helper/system-jobs`)**:
  - Manages platform-level recurring and delayed jobs (`PIECES_ANALYTICS`, `PIECES_SYNC`, `FILE_CLEANUP_TRIGGER`, `TRIAL_TRACKER`, `AI_CREDIT_UPDATE_CHECK`, `HARD_DELETE_PROJECT`, `HARD_DELETE_PLATFORM`, `TOOL_SEARCH_REINDEX`, `BUNDLE_PIECE`).
  - Dispatches handlers via in-process `LocalScheduler`.

- **Ad-hoc Node-Cron Jobs**:
  - SAML SSO domain expiration (`authn-sso-saml-module.ts`) running hourly via `node-cron`.
  - Managed AI model cache eviction (`ai-provider-service.ts`) running daily via `node-cron`.
  - Operational telemetry snapshots (`system-snapshot.ts`) running periodically via `setInterval`.

---

## Classification of Discovered Jobs

| Job Name / ID | Current Mechanism | Plane | Workflow Graph Dependency | Target Handling |
|---|---|---|---|---|
| `file-cleanup-trigger` | `SystemJobName.FILE_CLEANUP_TRIGGER` / `LocalScheduler` | A. SYSTEM JOB | None (Deletes stale temp files) | Preserve in System Job Plane |
| `trial-tracker` | `SystemJobName.TRIAL_TRACKER` / `LocalScheduler` | A. SYSTEM JOB | None (EE license checks) | Preserve in System Job Plane |
| `ai-credit-update-check` | `SystemJobName.AI_CREDIT_UPDATE_CHECK` / `LocalScheduler` | A. SYSTEM JOB | None (EE credit balance update) | Preserve in System Job Plane |
| `hard-delete-project` | `SystemJobName.HARD_DELETE_PROJECT` / `LocalScheduler` | A. SYSTEM JOB | None (Project cleanup) | Preserve in System Job Plane |
| `hard-delete-platform` | `SystemJobName.HARD_DELETE_PLATFORM` / `LocalScheduler` | A. SYSTEM JOB | None (Platform cleanup) | Preserve in System Job Plane |
| `tool-search-reindex` | `SystemJobName.TOOL_SEARCH_REINDEX` / `LocalScheduler` | A. SYSTEM JOB | None (Knowledge/Tool search index) | Preserve in System Job Plane |
| `bundle-piece` | `SystemJobName.BUNDLE_PIECE` / `LocalScheduler` | A. SYSTEM JOB | None (Tarball bundling) | Preserve in System Job Plane |
| `pieces-sync` | `SystemJobName.PIECES_SYNC` / `LocalScheduler` | A. SYSTEM JOB | None (Piece metadata sync) | Preserve in System Job Plane |
| `pieces-analytics` | `SystemJobName.PIECES_ANALYTICS` / `LocalScheduler` | A. SYSTEM JOB | None (Piece analytics) | Preserve in System Job Plane |
| SAML domain expiration | Direct `node-cron` in `authn-sso-saml-module.ts` | A. SYSTEM JOB | None (Auth expiration) | Standardize onto Scheduler |
| AI model cache eviction | Direct `node-cron` in `ai-provider-service.ts` | A. SYSTEM JOB | None (In-memory cache reset) | Standardize onto Scheduler |
| Scheduled AI Prompt | *New Headless Entity* (`ScheduledTask`) | B. USER SCHEDULED TASK | None | Create `ScheduledTask` -> `ExecutionRequest` -> `Execution` |
| Polling / Cron Triggers | `TriggerBinding` + `LocalScheduler` | C. TRIGGER SCHEDULE | None (PR8D `TriggerBinding`) | Route `TriggerBinding` schedule -> `triggerBindingService.executeRun` |
| Webhook Subscription Renewal | `TriggerBinding` + `LocalScheduler` | C. TRIGGER SCHEDULE | None (PR8D `TriggerBinding`) | Route `TriggerBinding` renewal -> `triggerBindingService.renew` |

---

## Dependency & Dynamic Registration Audit

1. **`packages/scheduler`**:
   - `local-scheduler.ts` maps task IDs in a `Map<string, ScheduledTask | NodeJS.Timeout>`.
   - Zero imports of `flow`, `flow-version`, or `flow-run`.

2. **System Job Handlers (`systemJobHandlers`)**:
   - Handlers registered dynamically during Fastify plugin bootstrap via `systemJobHandlers.registerJobHandler(...)`.
   - Verified 100% free of workflow graph concepts.

3. **Dynamic Import / Runtime Audit**:
   - Scanned all dynamic `import()` calls and string-based queue names across `packages/server`.
   - No hidden scheduled tasks reference legacy workflow entities.
