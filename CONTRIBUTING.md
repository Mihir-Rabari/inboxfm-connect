<!-- omit in toc -->
# Contributing to Inboxfm Connect

Thanks for contributing — including if you're one of the automated agents picking up work from the [issue tracker](https://github.com/Mihir-Rabari/inboxfm-connect/issues). This doc covers the branch workflow, PR conventions, and how review works in this repo.

## Branch workflow

- **`main`** is the stable, deployable branch. Don't push directly to it.
- **`dev`** is the integration branch. Branch your work off `dev`, and open PRs targeting `dev`. `dev` gets merged into `main` periodically once it's in a known-good state.
- Name feature branches descriptively, e.g. `fix/edition-safety-authorize`, `feat/api-key-manager`.

## Before you start

1. Pick up an open issue rather than starting undirected work — every issue has enough context (file references, acceptance criteria) to work from without needing the original conversation that created it.
2. Read `CLAUDE.md` (repo root) and the relevant package's `CLAUDE.md` (e.g. `packages/server/CLAUDE.md`, `packages/web/CLAUDE.md`) if it exists — these hold the non-obvious conventions (HTTP method rules, entity registration, data isolation, edition safety, safe outbound HTTP) that generic best practice won't tell you.
3. Read `.claude/rules/*.md` — short, critical safety checks that apply on every change:
   - `entity-registration.md` — new TypeORM entities must be registered in `getEntities()` or they silently don't exist at runtime.
   - `data-isolation.md` — every query must filter by `projectId`/`platformId`.
   - `edition-safety.md` — CE code must never import from `packages/server/api/src/app/ee/`. We are actively *removing* existing violations (see [#7](https://github.com/Mihir-Rabari/inboxfm-connect/issues/7)) — don't add new ones.
   - `safe-http.md` — outbound HTTP from server packages must go through `safeHttp`, never raw `fetch`/`axios.create`.
   - `core-packages.md` — pieces/engine never import `@inboxfm-connect/shared`.

## Pull requests

- Reference the issue number you're addressing in the PR description.
- Label every PR with exactly one of: `feature` (new functionality), `bug` (bug fix), `skip-changelog` (docs/CI/internal refactors). If it touches `packages/integrations/`, also add `area/third-party-integrations` or `area/core-integrations` as appropriate.
- Before opening a PR: `npm run lint-dev` (lints with auto-fix — always run this) and the relevant test suite (`npm run test-unit` and/or `npm run test-api`).
- Keep PRs scoped to one issue/concern. A bug fix doesn't need surrounding refactors bundled in.

## Automated review

Open PRs against this repo are picked up by a scheduled watcher that runs a code review and leaves comments (correctness bugs, rule violations, reuse/simplification opportunities) directly on the PR. It does **not** approve, merge, or push commits — it's a first-pass reviewer, not a gate. Treat its findings like you would a human reviewer's: address the real ones, push back in the thread if something's a false positive.

A human still does final review and merge.

## Database migrations

Before creating or modifying a migration, read the [Database Migrations Playbook](https://www.inboxfm-connect.com/docs/handbook/engineering/playbooks/database-migration) and use the `db-migration` skill if you're working with Claude Code. Never hand-edit an entity's schema without a matching migration.

## Commands

This monorepo uses **turbo** — see `turbo.json`. There is no Nx; never invoke `nx`.

```bash
npm start            # First-time setup + start everything
npm run dev           # Frontend + backend, subsequent runs
npm run lint-dev      # Lint with auto-fix — run before every PR
npm run test-unit     # Vitest: engine + shared
npm run test-api      # API integration tests (CE, EE, Cloud)
```

## Reporting a vulnerability

Don't open a public issue for security vulnerabilities — see [SECURITY.md](SECURITY.md).

---

> If you like the project but don't have time to contribute code: star it, mention it in your project's README, or tell people about it. All appreciated. 🎉
