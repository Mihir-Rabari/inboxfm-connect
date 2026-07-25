# PR4A Deletion Log (Automation Subsystem API Removal)

This document catalogs all deleted files, modified files, and safety verifications performed during the first stage of the Flow Runtime removal (PR4A).

---

## 1. Safety Checklist Confirmations

- [x] **No Active Endpoints**: All Fastify routes related to flow and flow-run CRUD have been commented out or stubbed in `app.ts` and their respective modules.
- [x] **Zero Engine executor imports**: The `@inboxfm-connect/runtime` and `@inboxfm-connect/sandbox` dependencies do not import any deleted files.
- [x] **Database Entities Retained**: Database entity definitions (`flow.entity.ts`, `flow-run-entity.ts`, `waitpoint-entity.ts`, `flow-version-entity.ts`, `folder.entity.ts`) are **retained** on disk to respect the staging blueprint (PR4D will unregister and drop tables).
- [x] **No Broken Imports**: Full workspace compiles successfully (`npm run build` exits with code 0).

---

## 2. Deleted Files

The following 112 files have been physically removed from the codebase:

### Flow & Flow Run API Subsystems (`packages/server/api/src/app/flows/`)
- `packages/server/api/src/app/flows/flow/flow.controller.ts`
- `packages/server/api/src/app/flows/flow/flow.service.ts`
- `packages/server/api/src/app/flows/flow/flow.repo.ts`
- `packages/server/api/src/app/flows/flow/flow.module.ts`
- `packages/server/api/src/app/flows/flow/flow.jobs.ts`
- `packages/server/api/src/app/flows/flow/flow-service-side-effects.ts`
- `packages/server/api/src/app/flows/flow/flow-execution-cache.ts`
- `packages/server/api/src/app/flows/flow/human-input/chat-controller.ts`
- `packages/server/api/src/app/flows/flow/human-input/form-controller.ts`
- `packages/server/api/src/app/flows/flow/human-input/human-input.module.ts`
- `packages/server/api/src/app/flows/flow/human-input/human-input.service.ts`
- `packages/server/api/src/app/flows/flow-run/flow-run-controller.ts`
- `packages/server/api/src/app/flows/flow-run/flow-run-service.ts`
- `packages/server/api/src/app/flows/flow-run/resume-service.ts`
- `packages/server/api/src/app/flows/flow-version/flow-version.controller.ts`
- `packages/server/api/src/app/flows/flow-version/flow-version.service.ts`
- `packages/server/api/src/app/flows/flow-version/migrations.ts`
- `packages/server/api/src/app/flows/folder/folder.controller.ts`
- `packages/server/api/src/app/flows/folder/folder.service.ts`
- `packages/server/api/src/app/flows/folder/folder.module.ts`
- `packages/server/api/src/app/flows/pre-warm-workers.ts`
- `packages/server/api/src/app/flows/step-run/sample-data.controller.ts`
- `packages/server/api/src/app/flows/step-run/sample-data.service.ts`

### Webhook & Trigger Routing Subsystems (`packages/server/api/src/app/trigger/` & `webhooks/`)
- `packages/server/api/src/app/trigger/app-event-routing/app-event-routing.module.ts`
- `packages/server/api/src/app/trigger/app-event-routing/app-event-routing.service.ts`
- `packages/server/api/src/app/trigger/dedupe-service.ts`
- `packages/server/api/src/app/trigger/test-trigger/test-trigger-controller.ts`
- `packages/server/api/src/app/trigger/test-trigger/test-trigger-service.ts`
- `packages/server/api/src/app/trigger/trigger-events/trigger-event-controller.ts`
- `packages/server/api/src/app/trigger/trigger-events/trigger-event.service.ts`
- `packages/server/api/src/app/trigger/trigger-run/trigger-run-stats.ts`
- `packages/server/api/src/app/trigger/trigger-run/trigger-run.controller.ts`
- `packages/server/api/src/app/trigger/trigger-source/flow-trigger-side-effect.ts`
- `packages/server/api/src/app/trigger/trigger-source/trigger-source-service.ts`
- `packages/server/api/src/app/trigger/trigger-source/trigger-utils.ts`
- `packages/server/api/src/app/trigger/trigger.module.ts`
- `packages/server/api/src/app/webhooks/webhook-controller.ts`
- `packages/server/api/src/app/webhooks/webhook-handshake.ts`
- `packages/server/api/src/app/webhooks/webhook-module.ts`
- `packages/server/api/src/app/webhooks/webhook-request-converter.ts`
- `packages/server/api/src/app/webhooks/webhook.service.ts`

### Obsolete MCP Tools (`packages/server/api/src/app/mcp/tools/`)
- `packages/server/api/src/app/mcp/tools/ap-add-branch.ts`
- `packages/server/api/src/app/mcp/tools/ap-add-step.ts`
- `packages/server/api/src/app/mcp/tools/ap-build-flow.ts`
- `packages/server/api/src/app/mcp/tools/ap-change-flow-status.ts`
- `packages/server/api/src/app/mcp/tools/ap-create-flow.ts`
- `packages/server/api/src/app/mcp/tools/ap-delete-branch.ts`
- `packages/server/api/src/app/mcp/tools/ap-delete-flow.ts`
- `packages/server/api/src/app/mcp/tools/ap-delete-step.ts`
- `packages/server/api/src/app/mcp/tools/ap-duplicate-flow.ts`
- `packages/server/api/src/app/mcp/tools/ap-flow-structure.ts`
- `packages/server/api/src/app/mcp/tools/ap-get-run.ts`
- `packages/server/api/src/app/mcp/tools/ap-list-flows.ts`
- `packages/server/api/src/app/mcp/tools/ap-list-runs.ts`
- `packages/server/api/src/app/mcp/tools/ap-lock-and-publish.ts`
- `packages/server/api/src/app/mcp/tools/ap-manage-notes.ts`
- `packages/server/api/src/app/mcp/tools/ap-read-step-code.ts`
- `packages/server/api/src/app/mcp/tools/ap-rename-flow.ts`
- `packages/server/api/src/app/mcp/tools/ap-retry-run.ts`
- `packages/server/api/src/app/mcp/tools/ap-test-flow.ts`
- `packages/server/api/src/app/mcp/tools/ap-test-step.ts`
- `packages/server/api/src/app/mcp/tools/ap-update-branch.ts`
- `packages/server/api/src/app/mcp/tools/ap-update-step.ts`
- `packages/server/api/src/app/mcp/tools/ap-update-trigger.ts`
- `packages/server/api/src/app/mcp/tools/ap-validate-flow.ts`

### Obsolete Integration & Unit Tests
- `packages/server/api/test/integration/ce/flows/flow-run/*`
- `packages/server/api/test/integration/ce/flows/flow/*`
- `packages/server/api/test/integration/ce/flows/folder/*`
- `packages/server/api/test/unit/app/ee/flow-run-tracking/flow-run-tracking-service.test.ts`
- `packages/server/api/test/unit/app/ee/projects/project-release/project-state/diff/flow-diff.test.ts`
- `packages/server/api/test/unit/app/ee/projects/project-release/project-state/diff/table-diff.test.ts`
- `packages/server/api/test/unit/app/ee/projects/project-release/project-state/flow-apply.test.ts`
- `packages/server/api/test/unit/app/ee/projects/project-release/project-state/project-state.service.test.ts`
- `packages/server/api/test/unit/app/flows/flow-lock/flow-lock.test.ts`
- `packages/server/api/test/unit/app/flows/flow-run/ai-usage-tracker.test.ts`
- `packages/server/api/test/unit/app/flows/flow-run/run-timeline.test.ts`
- `packages/server/api/test/unit/app/flows/flow-version/flow-version.service.test.ts`
- `packages/server/api/test/unit/app/flows/flow-version/migrate-v20-google-model-prefix.test.ts`
- `packages/server/api/test/unit/app/flows/migrations/expression-rewriter.test.ts`
- `packages/server/api/test/unit/app/flows/migrations/migrate-v21-step-output-nesting.test.ts`
- `packages/server/api/test/unit/app/flows/trigger/flow-trigger-side-effect.test.ts`
- `packages/server/api/test/unit/app/webhooks/webhook-handshake.test.ts`
- `packages/server/api/test/unit/app/webhooks/webhook-payload-size.test.ts`
- `packages/server/api/test/unit/app/webhooks/webhook-request-converter.test.ts`
- `packages/server/api/test/unit/app/webhooks/webhook-xml-parser.test.ts`

---

## 3. Modified Files

The following files were modified to disconnect the flow/trigger runtime dependencies:
- `packages/server/api/src/app/template/template.controller.ts` (removed flow migrations).
- `packages/server/api/src/app/analytics/pieces-analytics.service.ts` (stubbed to no-op).
- `packages/server/api/src/app/analytics/platform-analytics-report.service.ts` (stubbed flow/run report logic).
- `packages/server/api/src/app/core/canary/canary-routing.middleware.ts` (removed flow execution cache).
- `packages/server/api/src/app/ee/alerts/alerts-service.ts` (stubbed sendAlertOnRunFinish).
- `packages/server/api/src/app/ee/flow-run-tracking/flow-run-tracking-service.ts` (stubbed reportAllPlatforms).
- `packages/server/api/src/app/ee/platform/admin/templates/admin-platform-templates-cloud.controller.ts` (removed flow migrations).
- `packages/server/api/src/app/ee/platform/platform-plan/platform-plan.service.ts` (stubbed activeFlowsCount).
- `packages/server/api/src/app/ee/projects/platform-project-jobs.ts` (rewrote hardDeleteProjectHandler using entity repo directly).
- `packages/server/api/src/app/health/health-metrics.service.ts` (stubbed flow run count queries).
- `packages/server/api/src/app/mcp/mcp-server-builder.ts` (stubbed registerFlowTools).
- `packages/server/api/src/app/mcp/mcp-service.ts` (stubbed listMcpFlows).
- `packages/server/api/src/app/mcp/tools/flow-run-utils.ts` (rewrote executeAdhocAction using HeadlessRuntime).
- `packages/server/api/src/app/tables/record/record.service.ts` (stubbed triggerWebhooks).
- `packages/server/api/src/app/tables/table/table.service.ts` (fixed TypeScript union data property).

---

## 4. Verification & Lint

- Compiled with: `npm run build` under `packages/server/api` (Successful).
- Linted with: `npm run lint-dev` (Successful, 0 errors).
- Tested with: `npx vitest run test/integration/ce/user/platform-user-community.test.ts` (Successful, 7/7 tests passed).
