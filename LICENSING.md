# Licensing boundary — read before touching `ee/`

This repo is a fork of Activepieces. The root [`LICENSE`](LICENSE) file is dual:

- Everything **outside** `packages/ee/` and `packages/server/api/src/app/ee/` is **MIT** — free to use, modify, and ship, no restrictions.
- Everything **inside** those two directories is governed by a separate [`packages/ee/LICENSE`](packages/ee/LICENSE), copyright Activepieces Inc. That license explicitly permits modifying the code **for development and testing**, but forbids using it **in production** — for any user, under any product name — without a paid Activepieces Enterprise license.

**Forking and rebranding this repo does not change that.** The license is attached to the code, not the product name. Running `ee/`-licensed code in production for real users, without a license from Activepieces, applies exactly the same to "Inboxfm Connect" as it would to a repo still called "Activepieces."

## What happened here

The Connect platform (project-scoped API keys, connect sessions, the public `/connect/:token` flow) was originally built by extending four existing files inside `packages/server/api/src/app/ee/`:

- `ee/api-keys/api-key-entity.ts`
- `ee/api-keys/api-key-service.ts`
- `ee/api-keys/api-key-module.ts`
- `ee/authentication/project-role/rbac-service.ts`

Those four files have since been **reverted to their pristine, unmodified state** — identical to what a clean Activepieces checkout ships. `ee/` in this repo is now exactly as-is, untouched, and not part of the Connect platform's dependency graph at all.

## Where the Connect platform actually lives now

All of it is original code, outside `ee/`, available on every edition (Community, Enterprise, Cloud) with no license check:

| Module | Path | Replaces |
|---|---|---|
| Connect API keys | `packages/server/api/src/app/connect-api-keys/` | `ee/api-keys/` (not extended, not imported) |
| Connect OAuth app config | `packages/server/api/src/app/connect-oauth-apps/` | `ee/oauth-apps/` (not extended, not imported) |
| Connect sessions | `packages/server/api/src/app/connect-sessions/` | n/a, new |
| Client SDK | `packages/connect-sdk/` | n/a, new |
| Shared DTOs | `packages/core/shared/src/lib/connect-api-key/`, `connect-oauth-app/`, `connect-session/` | n/a, new |

Two small, deliberately-placed additions to **non-ee, MIT-licensed** core files close the security gap that the ee `rbac-service.ts` used to handle:

- `packages/server/api/src/app/core/security/v2/authn/authenticate.ts` — recognizes a distinct `cak-` token prefix (vs. Activepieces' own `sk-` platform keys) and mints a principal bound to one project.
- `packages/server/api/src/app/core/security/v2/authz/authorize.ts` — `assertServicePrincipalScope()` rejects a Connect API key trying to touch a project it isn't bound to. This runs *before* the untouched `ee/rbac-service.ts` check, so `ee/` never needed to change.

## The rule going forward

**Do not import from, extend, or otherwise depend on anything under `packages/ee/` or `packages/server/api/src/app/ee/` from Connect-platform code.** If the Connect platform needs something that already exists in `ee/` (audit logging, SSO, project roles, etc.), write an original, independent implementation the way `connect-oauth-app.entity.ts` re-implemented `oauth-app.entity.ts`'s shape rather than reusing it. `ee/` itself is left alone — it's Activepieces' own feature set, gated behind their own license, exactly as they shipped it. This repo simply doesn't build on top of it anymore.
