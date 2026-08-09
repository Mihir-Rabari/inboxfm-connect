# MIGRATION_POLICY_NOTE.md

**Date:** 2026-08-04  
**Type:** Phase 0 — Breaking Migration Consistency Audit

---

## Question

Does `DropWorkflowTables1807000000000` SHOULD have declared `breaking = true`?

---

## Findings

### 1. When the breaking flag was introduced

The `breaking` flag and migration rollback policy was introduced in **commit `5f52ab2856`** before the initial repository commit:

```
commit 5f52ab2856
Author: Louai Boumediene
Date:   Mon Jul 6 11:50:14 2026 +0100
chore: add database migration rollback system (#12289)
```

The check script `tools/scripts/check-migration-rollback.ts` was added in this commit with the following policy:

```typescript
if (instance.breaking === undefined) {
    errors.push('Missing "breaking" property (must be set to true or false)')
}

if (!instance.release || !semver.valid(instance.release)) {
    errors.push("Missing or invalid \"release\" property...")
}

if (instance.breaking !== true) {
    if (typeof instance.down !== 'function') {
        errors.push('Missing down() method (required for non-breaking migrations)')
    }
}
```

**The policy existed BEFORE the initial commit.**

### 2. Whether older migrations are intentionally exempt

**YES — by design.**

The check script only validates **NEW migrations** being added in a PR:

```typescript
function getChangedMigrationFiles(): string[] {
    const baseBranch = process.env.GITHUB_BASE_REF ?? 'main'
    const diffOutput = execSync(
        `git diff --name-only --diff-filter=A origin/${baseBranch}...HEAD`,
        { encoding: 'utf-8' },
    ).trim()
    // ...
}
```

It compares `origin/${baseBranch}...HEAD` — only migrations NEW to this PR are checked.

**`DropWorkflowTables1807000000000` was added in the initial commit (`178c1d529c`) which established the repository baseline. It was never checked because there was no prior branch to compare against.**

### 3. Whether check-migration-rollback.ts validates historical migrations

**NO — only new migrations are validated.**

The script:
1. Gets list of changed migration files (new to this branch/PR)
2. Validates only those files
3. Historical migrations are never checked

### 4. Whether adding breaking=true now would provide any value

**NO — adding breaking=true now would provide no practical value.**

| Aspect | Analysis |
|--------|----------|
| CI validation | Would NOT be validated (not a new migration in any PR) |
| Historical record | Would incorrectly suggest it was added with proper flags |
| Immutability | Migration is already committed — cannot be modified |
| Functional impact | None — the migration behavior is unchanged |

Adding `breaking = true` now would be a cosmetic/documentation change that provides no actual value.

---

## Conclusion

### Did DropWorkflowTables1807000000000 predates the migration policy?

**NO — the policy existed before the initial commit.**

The breaking/release policy was established in commit `5f52ab2856` (before initial commit). `DropWorkflowTables` was added in the initial commit without following the policy.

### Was it intentionally exempt?

**YES — implicitly, by the design of the validation system.**

The CI check was designed to only validate NEW migrations added in PRs. Migrations in the initial commit were never checked and are effectively "grandfathered."

### Should it have had breaking = true?

**ARGUMENT FOR:** The migration drops major schema (flow, flow_version, flow_run, etc.) which is inherently "breaking" by any definition.

**ARGUMENT AGAINST:** The migration was added before proper PR validation was possible. It was added in the same commit that established the codebase baseline.

### Final Determination

**The migration predates meaningful CI validation but NOT the policy itself.**

The policy was created before the initial commit, but the specific migration `DropWorkflowTables1807000000000` was added in the initial commit without `breaking = true` or `release` properties.

**This is a historical anomaly, not a deliberate exemption.**

**No action is required or recommended.** Modifying the migration now would:
1. Provide no functional benefit
2. Not trigger any CI validation
3. Create a misleading historical record

The migration remains immutable and is effectively accepted as-is by the repository.

---

**Note generated:** 2026-08-04  
**Classification:** Documentation only — no action required