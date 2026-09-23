# @inboxfm-connect/sdk

Node/browser client for the Inboxfm Connect API.

Install with `npm install @inboxfm-connect/sdk`. The package supports Node.js 20 or newer and browsers with `fetch` and `AbortController`. It has ESM and CommonJS entry points; the published tarball contains compiled JavaScript, type declarations, this README, the changelog, and the MIT license.

```ts
import { ConnectError, InboxFM } from '@inboxfm-connect/sdk'

const inboxfm = new InboxFM({
  apiKey: process.env.INBOXFM_API_KEY,
  projectId: process.env.INBOXFM_PROJECT_ID,
  baseUrl: 'https://your-instance.example.com/api',
})

const session = await inboxfm.createConnectSession({ externalUserId: 'user_42' })
```

## Errors

Every failed request rejects with a `ConnectError` (never a bare `Error`):

```ts
try {
  await inboxfm.execute({ integration: 'slack', tool: 'send_message', input: {} })
}
catch (error) {
  if (error instanceof ConnectError) {
    switch (error.category) {
      case 'authentication': // invalid/expired API key
      case 'validation': // bad request payload
      case 'not_found':
      case 'conflict':
      case 'rate_limit': // error.retryAfterMs may be set
      case 'server': // 5xx
      case 'network': // request never reached the server
      case 'timeout':
      case 'aborted': // caller-supplied AbortSignal fired
    }
    // error.status, error.code, error.params mirror the server's error body when available
  }
}
```

## Timeouts and cancellation

```ts
await inboxfm.listConnections({ externalUserId: 'user_42', timeoutMs: 5000 })

const controller = new AbortController()
await inboxfm.execute({ integration: 'slack', tool: 'send_message', input: {}, signal: controller.signal })
controller.abort()
```

A client-wide default timeout can be set via `new InboxFM({ ..., timeoutMs: 10_000 })` (default: 10s).

## Retries

Requests are retried with bounded exponential backoff and jitter, but **only when it is safe**:

- `GET`/`HEAD` requests (`listConnections`) are retried automatically on network errors, timeouts, and 5xx responses.
- Mutations (`createConnectSession`, `execute`) are **never** retried automatically on network errors or 5xx responses, even if you pass an `idempotencyKey` — the server does not (yet) deduplicate by that key, so retrying could duplicate the side effect. Set `retryable: true` on a specific call only if you know the operation is safe to repeat.
- `deleteConnection` is retried by default, since repeating a delete converges to the same end state.
- A `429` response is always retried automatically for every method, since it means the request was rejected before it ran (respecting `Retry-After` when the server sends one).

Configure retry behavior client-wide:

```ts
new InboxFM({
  apiKey, projectId, baseUrl,
  maxAttempts: 3, // default
  retryBaseDelayMs: 250, // default
  retryMaxDelayMs: 4000, // default
})
```

## Idempotency key

Pass `idempotencyKey` on a mutation to send an `Idempotency-Key` header. The SDK does not use it to change retry behavior today (see above), but it lets you correlate requests and is forward-compatible with server-side deduplication.

## Generated types

The request/response types (`Connection`, `ConnectionsPage`, `CreateConnectSessionResult`, `ExecuteParams`, `ServerErrorCode`, ...) are **not** hand-written. They're generated from the same Zod schemas the server validates against (`@inboxfm-connect/shared`, `@inboxfm-connect/core-utils`), so the SDK's types can't silently drift from what the API actually accepts and returns.

- **`src/generated/*.ts`** — raw output, one file per resource (`connect-session.ts`, `connections.ts`, `execute.ts`, `error-code.ts`). Never edit these by hand; they're overwritten on every regeneration.
- **`src/api-types.ts`** — the curated, hand-maintained layer that re-exports the generated contracts as the SDK's public types, explicitly `Omit`-ting server/DB-only fields that shouldn't be part of a public contract (e.g. `Connection` omits `platformId`, `ownerId`, `owner` from the raw `ConnectionContract`).

Regenerate after changing a relevant server schema:

```bash
npm run generate --workspace=@inboxfm-connect/sdk
```

This requires `@inboxfm-connect/shared` and `@inboxfm-connect/core-utils` to be built first (`npx turbo run build --filter=@inboxfm-connect/shared`, or just run the generate command via turbo so it builds dependencies automatically: `npx turbo run generate --filter=@inboxfm-connect/sdk`). Commit the resulting diff in `src/generated/`.

CI runs `npx turbo run generate:check --filter=@inboxfm-connect/sdk`, which regenerates into memory and fails the build if the committed output in `src/generated/` doesn't match — so a schema change that isn't followed by a regeneration is caught automatically, rather than silently drifting.

## Server compatibility

| SDK | Release target | Policy |
| --- | --- | --- |
| 0.2.x | Inboxfm Connect 0.86.1 and later 0.86.x | Connect routes under `/api/v1` and the generated contracts are the supported surface. A release is verified against a configured server before npm publication. |

Use the latest SDK patch release within a minor line. A server can add optional response fields without an SDK release; new required request fields, removed fields, or changed behavior require a new SDK minor release while the SDK is 0.x. We do not promise compatibility with earlier server versions or with a server that removes the `/api/v1` Connect routes. Before raising the minimum supported server version, add a compatibility entry here and exercise the new server in the release smoke gate. Deprecated SDK methods stay available for at least one SDK minor line, with the replacement documented in the changelog.

## Releasing

SDK changes get a Changeset scoped to `@inboxfm-connect/sdk` (`bunx changeset add`). On a release branch based on `dev`, run `bunx changeset version` and `bun install` to update the package version, lockfile, and generated changelog. Review and merge that version commit into `dev`, then tag that exact commit as `sdk-v<package version>` and push the tag. The [SDK release workflow](https://github.com/Mihir-Rabari/inboxfm-connect/blob/dev/.github/workflows/release-connect-sdk.yml) validates the tag, generated contracts, and tarball before publishing once to npm with provenance. A workflow rerun skips a version already present in the registry.

The npm package owner must first publish an initial version manually because npm only allows trusted publisher setup for a package that already exists. After that, configure a trusted GitHub Actions publisher for repository `Mihir-Rabari/inboxfm-connect`, workflow `release-connect-sdk.yml`, environment `sdk-release`, with direct `npm publish` allowed. The GitHub environment should protect the release job. Later tagged releases use npm OIDC and no long-lived publish token.

The `sdk-release` environment needs a supported server with a dedicated project-scoped Connect API key and a Text Helper connection. Set environment variables `CONNECT_SDK_SMOKE_BASE_URL` (including `/api`), `CONNECT_SDK_SMOKE_PROJECT_ID`, and `CONNECT_SDK_SMOKE_CONNECTION_ID`, plus secret `CONNECT_SDK_SMOKE_API_KEY`. The tagged release gate installs the packed tarball in a clean consumer and runs a real authenticated session → connection list → Text Helper `concat` request before publishing. The PR gate runs the same tarball through a local HTTP contract fixture, CJS/ESM imports, TypeScript resolution, and a browser bundle without needing external credentials. Run `npm run pack:verify --workspace=@inboxfm-connect/sdk` locally to inspect the exact tarball before tagging.
