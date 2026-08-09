# PR4D_BLOCKERS.md

**Date:** 2026-08-04  
**Status:** 🚨 STOPPED - BLOCKER IDENTIFIED

---

## 🚨 BLOCKER #1: Existing Migration Not Reversible

### Description

The existing `DropWorkflowTables1807000000000` migration exists and drops the correct tables (flow, flow_version, flow_run, waitpoint, folder, trigger_event, trigger_source, app_event_routing, git_repo, project_release, template, table_webhook), BUT its `down()` method is a **no-op**.

### Location

- `packages/server/api/src/app/database/migration/postgres/1807000000000-DropWorkflowTables.ts`
- `packages/server/api/src/app/database/migration/sqlite/1807000000000-DropWorkflowTablesSqlite.ts`

### Evidence

```typescript
public async down(queryRunner: QueryRunner): Promise<void> {
    // No-op
}
```

### Why This Is a Blocker

1. **Task Requirement Violation:** The task explicitly states "Migration must be reversible"
2. **Reproducibility Violation:** The task states "Everything must remain reproducible"
3. **Production Risk:** If this migration runs in production, the changes cannot be rolled back

### Stop Condition Triggered

> "STOP CONDITIONS: Immediately stop if... Rollback fails"

The migration **cannot rollback** because the `down()` method is empty.

---

## Resolution Required

The existing migration must be modified to include a proper `down()` method that recreates all dropped tables with their correct schemas and constraints.

**OR**

A new reversible migration must be created to replace the existing one.

---

## Alternative Considerations

### Option 1: Fix Existing Migration

Modify the `down()` method to recreate all dropped tables. This requires:
- Full schema recreation for each table
- All indexes and constraints
- Foreign key relationships
- This is complex because some tables reference each other

### Option 2: Create New Reversible Migration

Create a NEW migration that:
- Drops the same tables
- Has a complete `down()` method that recreates all tables

The challenge is that TypeORM migrations typically auto-generate the `up()` method but require manual authoring of `down()`.

### Option 3: Remove CASCADE and Handle Dependencies Manually

The existing migration uses `CASCADE` which auto-drops dependent objects. For full reversibility, we need to:
1. Remove CASCADE
2. Drop tables in correct order (respecting foreign keys)
3. Create `down()` that recreates tables in reverse order

---

## Next Action

**STOP** until blocker is resolved.

Per task requirements:
> "STOP CONDITIONS: Immediately stop if... Unknown foreign key / Unexpected entity / Unexpected table / Migration deletes strategic table / Metadata build fails / Rollback fails"

The rollback capability is broken (no-op down method), so we must stop and fix this before proceeding.

---

## Affected Tables (to be dropped when resolved)

| Table | Status |
|-------|--------|
| flow | Pending drop |
| flow_version | Pending drop |
| flow_run | Pending drop |
| waitpoint | Pending drop |
| folder | Pending drop |
| trigger_event | Pending drop |
| trigger_source | Pending drop |
| app_event_routing | Pending drop |
| git_repo | Pending drop |
| project_release | Pending drop |
| template | Pending drop |
| table_webhook | Pending drop |

---

## Verified Safe (Not Being Dropped)

- connection ✅
- project ✅
- platform ✅
- user ✅
- file ✅
- flag ✅
- store_entry ✅
- ai_provider ✅
- ai_tool_config ✅
- mcp_server ✅
- mcp_oauth_* ✅
- table, field, record, cell ✅
- All other registered entities ✅