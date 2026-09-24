# File Storage Service

## Summary
The File Storage Service is the central infrastructure for persisting binary files in Activepieces. It supports two storage backends: database (PostgreSQL `bytea`) and S3-compatible object storage (AWS S3, Cloudflare R2, or any S3-compatible endpoint). The backend used for a given file depends on its `FileType` — execution-related files that expire (run logs, step files, trigger payloads, webhook payloads) use the configured `FILE_STORAGE_LOCATION` system property; non-expiring files (platform assets, user profile pictures, knowledge base files, project releases, etc.) always use the database. The one non-expiring exception is `FLOW_BUNDLE` (the prebuilt per-locked-flow-version artifact), which uses the configurable `FILE_STORAGE_LOCATION` so it can be served from S3 even though it never expires. Files are optionally compressed with Zstd. A scheduled system job runs every hour to delete stale execution files beyond the configurable retention window. The `step-file` sub-feature exposes engine-accessible endpoints for pieces to upload and download files produced during a flow run, using short-lived JWT tokens for download authorization.

## Key Files
- `packages/server/api/src/app/file/file.service.ts` — core service: save, getFile, getDataOrThrow, delete, deleteStaleBulk, uploadPublicAsset
- `packages/server/api/src/app/file/file.entity.ts` — TypeORM entity
- `packages/server/api/src/app/file/file.module.ts` — module registration, cleanup job scheduling
- `packages/server/api/src/app/file/s3-helper.ts` — S3 client wrapper (upload, download, delete, signed URLs)
- `packages/server/api/src/app/file/file-compressor.ts` — Zstd compress/decompress utilities
- `packages/server/api/src/app/file/files-controller.ts` — primary file upload/download (`/v1/files`) and legacy `signedStepFileController` redirect for `/v1/step-files/signed`
- `packages/core/shared/src/lib/core/file/index.ts` — `File`, `FileType`, `FileCompression`, `FileLocation`, `FileId`

## Edition Availability
- **Community (CE)**: Fully available — used internally by the execution engine.
- **Enterprise (EE)**: Fully available.
- **Cloud**: Fully available. Cloud typically configures S3 as the storage location for execution files.

## Domain Terms

> Canonical term definitions live in the bounded-context glossaries — see [CONTEXT-MAP.md](../../CONTEXT-MAP.md).

- **FileType**: Categorizes the purpose of a file. Controls storage location (DB vs S3) and retention policy.
- **FileLocation**: `DB` (stored as `bytea` in Postgres) or `S3` (stored in an S3-compatible bucket with the S3 key recorded in the `s3Key` column).
- **FileCompression**: `NONE` or `ZSTD`. Applied to execution data files to reduce storage size. Decompression is transparent on read, including legacy auto-detection via magic bytes.
- **s3Key**: The object key in the S3 bucket. Format: `platform/<platformId>/<type>/<fileId>` for platform-scoped files, or `project/<projectId>/<type>/<fileId>` for project-scoped files.
- **Retention**: Execution data files are deleted after `EXECUTION_DATA_RETENTION_DAYS` days by a periodic cleanup job.
- **Step file**: A file produced by a piece action during execution (e.g., a generated PDF). Uploaded by the engine, downloaded by end users via a signed JWT token.
- **Platform asset**: Public binary (e.g., a platform logo). Always stored in DB; accessed via `/v1/platforms/assets/<fileId>`.
- **Signed URL**: For S3-backed step files when `S3_USE_SIGNED_URLS=true`, the download endpoint redirects to a time-limited pre-signed S3 URL instead of streaming the data through the API server.

## Entity

**file**
| Column | Type | Notes |
|---|---|---|
| id | string | BaseColumnSchemaPart |
| created | timestamp | BaseColumnSchemaPart |
| updated | timestamp | BaseColumnSchemaPart |
| projectId | string (nullable) | ApIdSchema; null for platform-level files |
| platformId | string (nullable) | ApIdSchema |
| data | bytea (nullable) | Binary content for DB-stored files |
| location | string | FileLocation enum (DB or S3) |
| fileName | string (nullable) | Original filename |
| size | number (nullable) | Size in bytes |
| metadata | jsonb (nullable) | Arbitrary key-value string map (e.g., mimetype) |
| s3Key | string (nullable) | S3 object key for S3-stored files |
| type | string | FileType enum (default UNKNOWN) |
| compression | string | FileCompression enum (default NONE) |

Indices: `idx_file_project_id` on `projectId`; `idx_file_type_created_desc` on `(type, created)` for cleanup queries.
Relation: many-to-one with `project` (CASCADE on delete, FK `fk_file_project_id`).

## FileType Enum

| Value | Storage | Expires | Description |
|---|---|---|---|
| `FLOW_RUN_LOG` | Configurable | Yes | Execution log for a flow run |
| `FLOW_STEP_FILE` | Configurable | Yes | File output from a piece action step |
| `TRIGGER_PAYLOAD` | Configurable | Yes | (Deprecated) Stored trigger payload |
| `TRIGGER_EVENT_FILE` | Configurable | Yes | File output from a trigger event |
| `WEBHOOK_PAYLOAD` | Configurable | Yes | Large webhook payload offloaded from Redis |
| `SAMPLE_DATA` | Always DB | No | Sample trigger data for builder |
| `SAMPLE_DATA_INPUT` | Always DB | No | Sample input data for builder |
| `PLATFORM_ASSET` | Always DB | No | Platform logo/branding images |
| `USER_PROFILE_PICTURE` | Always DB | No | User avatar |
| `PACKAGE_ARCHIVE` | Always DB | No | Piece package archive |
| `PROJECT_RELEASE` | Always DB | No | Project release snapshot |
| `FLOW_VERSION_BACKUP` | Always DB | No | Flow version backup |
| `KNOWLEDGE_BASE` | Always DB | No | File uploaded for AI knowledge base |
| `FLOW_BUNDLE` | Configurable | No | Prebuilt per-locked-flow-version artifact (flow definition + piece manifest + compiled code steps), addressed by flowVersionId. When S3-backed with `S3_USE_SIGNED_URLS`, workers fetch/upload it directly via signed URLs (see Workers feature) rather than streaming through the app over the socket RPC |

## Endpoints

### Step File Controller (`/v1/step-files`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/signed` | public | Legacy signed download — validates the JWT token, then 302 redirects to `/v1/files/{fileId}?token=...` |

Step file uploads are handled by the engine via the unified `PUT /v1/files/:fileId` endpoint. The legacy `/signed` route remains as a thin redirect so older execution outputs continue to resolve through the canonical `/v1/files/:fileId` path (which handles DB streaming or S3 pre-signed redirect).

## Service Methods

**fileService**
- `save({ fileId?, projectId, platformId?, data, size, type, fileName?, compression, metadata? })` — determines location based on type, saves to DB or S3 (with DB fallback on S3 error). Returns the persisted `File` entity.
- `getFile({ projectId, fileId, type? })` — returns `File | null` (metadata only, no data).
- `getFileOrThrow(params)` — throws ENTITY_NOT_FOUND if not found.
- `getDataOrThrow({ projectId, fileId, type? })` — fetches metadata + binary data. Decompresses transparently. Returns `{ data: Buffer, fileName?, metadata? }`.
- `getDataOrUndefined(params)` — same as `getDataOrThrow` but swallows errors and returns undefined.
- `delete({ projectId, fileId })` — deletes from S3 (if applicable) and DB.
- `deleteStaleBulk(types)` — paginated deletion of expired execution files. Processes up to 4000 files per iteration, deletes S3 keys in batches of 100.
- `uploadPublicAsset({ file, type, platformId, allowedMimeTypes?, maxFileSizeInBytes?, metadata? })` — validates MIME type and file size, saves, returns the public URL (`<FRONTEND_URL>/api/v1/platforms/assets/<fileId>`).

**s3Helper**
- `constructS3Key(platformId, projectId, type, fileId)` — builds deterministic S3 key.
- `uploadFile(s3Key, data)` — PutObject to S3.
- `getFile(s3Key)` — GetObject from S3, returns Buffer.
- `getS3SignedUrl(s3Key, fileName)` — generates a 7-day pre-signed GET URL.
- `putS3SignedUrl({ s3Key, contentLength, contentEncoding })` — generates a 7-day pre-signed PUT URL.
- `deleteFiles(s3Keys)` — DeleteObjects in batches of 100 (Cloudflare R2 limit).
- `validateS3Configuration()` — smoke test: puts, heads, and deletes a test object.

## Cleanup Job

Scheduled every hour (`30 */1 * * *`) via `SystemJobName.FILE_CLEANUP_TRIGGER`. Calls `fileService.deleteStaleBulk` for types: `FLOW_RUN_LOG`, `FLOW_STEP_FILE`, `TRIGGER_EVENT_FILE`, `TRIGGER_PAYLOAD`, `WEBHOOK_PAYLOAD`. Retention period controlled by `EXECUTION_DATA_RETENTION_DAYS` system property.

## Flow Bundle Cleanup (`flowBundleCleanupService`)

`FLOW_BUNDLE` does not expire and is not covered by `deleteStaleBulk` — it is deleted only when its owning project or platform is hard-deleted. See `packages/server/api/src/app/file/flow-bundle-cleanup.service.ts`.

**Why this exists:** `file.projectId` has an `onDelete: 'CASCADE'` FK to `project`. Deleting a project row therefore wipes its `file` rows (including any `FLOW_BUNDLE` rows) at the database level *before* anything can read their `s3Key` — which orphans the S3 object forever, since the only record of its key is gone with the row. The cleanup below runs *before* the project/platform row is deleted specifically to avoid that.

- **Trigger points:** `platformProjectBackgroundJobs#hardDeleteProjectHandler` (`packages/server/api/src/app/ee/projects/platform-project-jobs.ts`) runs `flowBundleCleanupService#cleanupForProject` before deleting the project row — this is the one handler behind every project-deletion path in every edition (CE personal-project delete, EE/Cloud team-project delete, Cloud platform-cascade delete all schedule the same `SystemJobName.HARD_DELETE_PROJECT` job). `platformBackgroundJobs#hardDeletePlatformHandler` (`packages/server/api/src/app/platform/platform-jobs.ts`, Cloud-only) additionally runs `cleanupForPlatform` as a defense-in-depth sweep — normally a no-op, since every constituent project already cleaned up its own bundles and a `FLOW_BUNDLE` row always carries a `projectId`.
- **Idempotent & multi-server safe:** both call sites wrap the cleanup in `distributedLock` keyed by `flow-bundle-cleanup:project:<id>` / `...:platform:<id>`. Deleting an already-deleted S3 key or an already-deleted `file` row is a no-op.
- **In-flight safety:** `hardDeleteProjectHandler` first checks for any non-terminal `ExecutionEntity` row (`CREATED`/`RUNNING`) scoped to the project and, if found, defers (reschedules itself every `ACTIVE_EXECUTION_RECHECK_DELAY_MS`, uncapped — active work is expected to finish on its own). There is no live consumer of `FLOW_BUNDLE` in this codebase today (see `packages/server/sandbox/CONTEXT.md`), so this is a forward-compatible guard against a bundle-consuming execution path being reintroduced, using the one in-flight-work concept (`execution`) that does exist.
- **Retry + dead letter:** if the S3 delete call fails, the `file` rows are left intact (so a retry has something to act on) and the whole hard-delete job reschedules itself via `systemJobsSchedule` with a fixed backoff, up to `FLOW_BUNDLE_CLEANUP_MAX_ATTEMPTS` (10) attempts, tracked via an `attempt` field on the job data. After the cap, `nextFlowBundleCleanupAttempt` logs a dead-letter `error` (grouped under `flowBundle`, per the evlog field-schema convention) and the handler proceeds to hard-delete the project/platform row anyway — an object-storage outage must not block a deletion the owner already asked for.
- **Operator remediation:** because the S3 key layout is deterministic (`s3Helper#constructS3Key`: `project/<projectId>/FLOW_BUNDLE/<fileId>` or `platform/<platformId>/FLOW_BUNDLE/<fileId>`), a dead-lettered cleanup can still be remediated manually by listing and deleting that prefix, even after the `file` row (and its `s3Key`) is gone.
- **Retention guarantee:** a project/platform's `FLOW_BUNDLE` artifacts are removed within one hard-delete job run under normal conditions (typically seconds after the soft-delete that schedules it), or after `FLOW_BUNDLE_CLEANUP_MAX_ATTEMPTS` retries at `FLOW_BUNDLE_CLEANUP_RETRY_DELAY_MS` apart (~10 minutes) if object storage is unavailable, at which point it is dead-lettered for manual remediation.
- **Known scope gap:** there is no `flow` entity or flow-delete endpoint in this codebase (the flow-builder/worker/bundle-build system was not carried over from upstream Activepieces into this fork — `packages/server/sandbox` and `packages/server/engine` are standalone packages, not wired into the live API), so there is no flow-level delete hook to attach to. Project-level cleanup transitively covers "delete a flow's bundles" once its owning project is deleted, which is the only flow-scoped deletion currently possible.

## System Properties

| Property | Purpose |
|---|---|
| `FILE_STORAGE_LOCATION` | `DB` or `S3` — controls where expiring execution files are stored |
| `EXECUTION_DATA_RETENTION_DAYS` | Number of days to keep execution files before cleanup |
| `S3_ACCESS_KEY_ID` | S3 credentials (not needed if `S3_USE_IRSA=true`) |
| `S3_SECRET_ACCESS_KEY` | S3 credentials (not needed if `S3_USE_IRSA=true`) |
| `S3_BUCKET` | S3 bucket name |
| `S3_REGION` | S3 region |
| `S3_ENDPOINT` | Custom S3 endpoint URL (for Cloudflare R2, MinIO, etc.) |
| `S3_USE_IRSA` | Use IAM Roles for Service Accounts instead of static credentials |
| `S3_USE_SIGNED_URLS` | When true, redirect step file downloads to pre-signed S3 URLs |
