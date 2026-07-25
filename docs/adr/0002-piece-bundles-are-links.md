# Integrations are distributed as links, resolved lazily

Every integration is fetched as a single downloadable **link** to its `.tgz`, served by an engine-token, platform-scoped endpoint (`GET /v1/engine/integrations/bundle?name=&version=`) that 307-redirects to whatever source is available: a signed-S3 object when present, the npm tarball for an official integration, or the app's file store served directly for a custom (`ARCHIVE`) integration. The pool downloads the link and `bun install`s the tarball — one path for all integration types, with no integration bytes crossing the worker socket. S3 copies are warmed **lazily**: a miss returns the npm/file link immediately and fire-and-forgets a deduped SYSTEM job (`jobId = bundle:<platformId|global>:<name>:<version>`) to cache the tarball for next time; it is enqueued only when S3 is configured.

## Why

- **Makes the pool transport-uniform and Cloud-Run-ready.** "Everything is a link" lets the pool install any integration over plain HTTP, deleting the registry-vs-archive branch, the socket `getIntegrationArchive` byte path, and `ProvisionInput.fetchArchive`. (Builds on ADR 0001's pure pool.)
- **Lazy beats eager.** A per-integration job triggered on demand avoids the proactive "sync every integration bundle to S3" batch — no cold-start scan, no wasted uploads for integrations never run. Dedup by `jobId` collapses concurrent misses to one job.
- **Always a working link.** Backing the link by npm *or* the file store means S3 is a pure optimization — self-hosters with no S3 still get a link ("served from file").

## Consequences

- **Platform scoping is mandatory** (repo data-isolation rule). The endpoint resolves via `integrationMetadataService.get({ name, version, platformId: token.platformId })`; custom-integration S3 keys/links are platform-namespaced. The cross-tenant `name@version` collision in the original PR (#13865, which keyed S3 globally and synced eagerly) is closed.
- `WorkerToApiContract.getIntegrationArchive` and `ProvisionInput.fetchArchive` are removed; `IntegrationPackage` handed to the pool can shrink toward `name@version`.
- The link is the integration's *own* tarball — `bun install` still resolves transitive npm deps from the registry, so the runtime still needs npm egress for deps.

## Considered and rejected

- **PR #13865 as written:** eager batch sync of all bundles to S3, `public()` endpoint on the integrations controller, global `name@version` S3 keys. Rejected for the cold-start batch cost, the missing tenant scoping, and the weaker auth — superseded by the lazy, engine-token, platform-scoped form above.
