# Activepieces API Tests

This directory contains all tests for the `@activepieces/server-api` package, organised into a unit layer and an integration layer under the monorepo's canonical 4-layer testing taxonomy (unit / integration / e2e / smoke).

## Taxonomy mapping

| Path | Layer | What it covers |
|---|---|---|
| `test/unit/` (29 files) | **Unit** | Single-module logic — services, helpers, middleware guards, schema validators. Mocks allowed, no real DB/queue/Fastify app. |
| `test/integration/ce/` (33 files) | **Integration** | Fastify `.inject()` + real Postgres + real Redis, Community Edition endpoints |
| `test/integration/ee/` (10 files) | **Integration** | Same infra as CE; Enterprise-only endpoints (SSO, SAML, SCIM) |
| `test/integration/cloud/` (32 files) | **Integration** | Same infra as CE; cloud-only endpoints + role-based permission matrices |

The edition split (ce / ee / cloud) is a product-edition gate, not a separate taxonomy layer — all three subtrees are integration tests.

BullMQ is no longer part of the integration tier's infra: the in-process job scheduler (`@inboxfm-connect/scheduler`) replaced it, and the last BullMQ-backed worker test suites were removed once `src/app/workers` was deleted (see `1e848c3073`). Only real Postgres + Redis are required to run `test/integration/{ce,ee,cloud}`.

## Test utilities

Key helpers live under `test/helpers/`:

- `setupTestEnvironment()` — boots a shared singleton Fastify app + database for the whole file; DB truncated between tests via `beforeEach`. Pass `{ fresh: true }` when tests need isolated module spying.
- `createTestContext(app, params)` — creates a user, platform, project, auth token; returns `{ user, platform, project, token, get/post/put/delete/inject }`.
- `createMemberContext(parentCtx, { projectRole })` — creates a member user under the same platform/project with a specific role.
- `createServiceContext(parentCtx)` — creates an API key for service-to-service auth.
- `mocks/index.ts` — ~850 LOC of factory builders (e.g., `mockAndSaveBasicSetup`, `generateMockToken`, `createMockApiKey`, `createMockPieceMetadata`) using `@faker-js/faker`. `createMockFlow`/`createMockFlowVersion` no longer exist — the Flow Runtime (`flow`/`flow_version`/`flow_run` entities) was removed from this fork's API in favour of the headless `execute`/`execution` model.

## Running the tests

```bash
npm run test             # runs test-ce && test-ee && test-cloud sequentially
npm run test-unit        # vitest run test/unit --bail 1
npm run test-ce          # loads .env.tests, AP_EDITION=ce, runs test/integration/ce
npm run test-ee          # same, AP_EDITION=ee, runs test/integration/ee
npm run test-cloud       # same, runs test/integration/cloud
```

Integration tests require a running Postgres + Redis (see `.env.tests`). Redis connects per `AP_REDIS_TYPE` (`packages/server/api/src/app/database/redis/index.ts`): `DEFAULT`/`SENTINEL` use `AP_REDIS_HOST`/`AP_REDIS_PORT` (or the sentinel equivalents) against a real Redis; `MEMORY` (the default in `.env.tests`, so this is what `test-ce`/`test-ee`/`test-cloud` use unless overridden) boots an in-memory Redis via `redis-memory-server`, which downloads a Redis binary on first use. In a network-restricted environment (no access to that download host), either set `AP_REDIS_TYPE=DEFAULT` with `AP_REDIS_HOST`/`AP_REDIS_PORT` pointed at a pre-provisioned real Redis, or set `REDISMS_SYSTEM_BINARY=/path/to/redis-server` (an existing Redis binary already on the machine — `redis-memory-server` uses it instead of downloading one, and `AP_REDIS_TYPE` can stay `MEMORY`). `bun install`'s own `redis-memory-server` postinstall step is separately controlled by `REDISMS_VERSION` (see `.github/workflows/ci.yml`, pinned to work around a Redis 8.x module-build failure on the CI runner).

## Classification debt

Resolved (issue #58) — see `../../../../docs/handbook/engineering/playbooks/testing-strategy.mdx` for the full account of what moved vs. what turned out to already be gone (the canary proxy suite, the flow CRUD duplication target files, and engine's `test/handler/`).

## Related documentation

- Canonical taxonomy: `../../../../docs/handbook/engineering/playbooks/testing-strategy.mdx` (repo-relative path — works from GitHub UI before the handbook PR is deployed).
- Full-stack browser E2E (not covered here): `../../../../docs/handbook/engineering/playbooks/e2e-tests.mdx`
