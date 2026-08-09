# PR4D_DATABASE_CLEANUP.md

**Date:** 2026-08-04  
**PR:** PR4D — Database Schema Cleanup & Entity Decommissioning

---

## Executive Summary

PR4D focuses on removing obsolete Automation Runtime database entities from InboxFM Connect. The audit confirms that flow-related entities have already been removed from the codebase, and the `DropWorkflowTables` migration is in place to drop the remaining obsolete tables.

**Status:** ✅ Audit complete. No code changes required.

---

## Files Modified

**NONE** — No modifications were necessary.

The previous PR4A–PR4C stages already removed:
- Flow entity registrations from `database-connection.ts`
- Flow entity imports from API source code
- Flow service and controller files

Verification confirmed that no orphaned flow entity references remain.

---

## Files Removed

**NONE** — No orphaned files found.

Searches confirmed:
- No flow entity files (`*.entity.ts` with flow in name) exist in API
- No flow entity imports exist in API source code
- No orphaned database helper files remain

---

## Remaining Database Entities

The following entities are registered in `database-connection.ts` and are **RETAINED**:

### Core Entities (17)
| Entity | Table | Status |
|--------|-------|--------|
| FileEntity | file | ✅ Active |
| FlagEntity | flag | ✅ Active |
| ProjectEntity | project | ✅ Active |
| StoreEntryEntity | store_entry | ✅ Active |
| UserEntity | user | ✅ Active |
| ConnectionEntity | connection | ✅ Active |
| IntegrationMetadataEntity | integration_metadata | ✅ Active |
| PlatformEntity | platform | ✅ Active |
| SecretManagerEntity | secret_manager | ✅ Active |
| TagEntity | tag | ✅ Active |
| PieceTagEntity | piece_tag | ✅ Active |
| UserInvitationEntity | user_invitation | ✅ Active |
| UserIdentityEntity | user_identity | ✅ Active |
| AIProviderEntity | ai_provider | ✅ Active |
| AiToolConfigEntity | ai_tool_config | ✅ Active |
| ProjectRoleEntity | project_role | ✅ Active |
| ToolSearchIndexEntity | tool_search_index | ✅ Active |

### Tables Product Entities (4)
| Entity | Table | Status |
|--------|-------|--------|
| TableEntity | table | ✅ Active |
| FieldEntity | field | ✅ Active |
| RecordEntity | record | ✅ Active |
| CellEntity | cell | ✅ Active |

### MCP Entities (4)
| Entity | Table | Status |
|--------|-------|--------|
| McpServerEntity | mcp_server | ✅ Active |
| McpOAuthClientEntity | mcp_oauth_client | ✅ Active |
| McpOAuthAuthorizationCodeEntity | mcp_oauth_authorization_code | ✅ Active |
| McpOAuthTokenEntity | mcp_oauth_token | ✅ Active |

### Enterprise Entities (12)
| Entity | Table | Status |
|--------|-------|--------|
| ConcurrencyPoolEntity | concurrency_pool | ✅ Active |
| ProjectMemberEntity | project_member | ✅ Active |
| ProjectPlanEntity | project_plan | ✅ Active |
| SigningKeyEntity | signing_key | ✅ Active |
| OAuthAppEntity | oauth_app | ✅ Active |
| OtpEntity | otp | ✅ Active |
| ApiKeyEntity | api_key | ✅ Active |
| AuditEventEntity | audit_event | ✅ Active |
| PlatformAnalyticsReportEntity | platform_analytics_report | ✅ Active |
| EmbedSubdomainEntity | embed_subdomain | ✅ Active |
| AppSumoEntity | app_sumo | ✅ Active |
| ConnectionKeyEntity | connection_key | ✅ Active |
| AppCredentialEntity | app_credential | ✅ Active |
| PlatformPlanEntity | platform_plan | ✅ Active |
| EventDestinationEntity | event_destination | ✅ Active |

---

## Migration Status

### DropWorkflowTables Migration

**File:** `packages/server/api/src/app/database/migration/postgres/1807000000000-DropWorkflowTables.ts`  
**Status:** ✅ Exists and ready to drop obsolete tables

**Tables to be dropped:**
- `flow`
- `flow_version`
- `flow_run`
- `waitpoint`
- `folder`
- `trigger_event`
- `trigger_source`
- `app_event_routing`
- `git_repo`
- `project_release`
- `template`
- `table_webhook`
- `mcp_tool`.`flowId` column

**SQLite version:** `packages/server/api/src/app/database/migration/sqlite/1807000000000-DropWorkflowTablesSqlite.ts`

### Migration Properties
| Property | Value |
|----------|-------|
| breaking | Not set (empty down()) |
| release | Not set |
| reversibility | Forward-only (accepted per repository policy) |

**Note:** Per MIGRATION_POLICY_AUDIT.md, the empty `down()` method is acceptable because:
1. The migration was added in the initial commit before CI validation was possible
2. The repository accepts forward-only migrations for schema cleanup
3. The migration is already committed and immutable

---

## Verification Results

### 1. Entity Registration Verification

✅ **PASSED** — `database-connection.ts` only registers entities that exist.

Searches confirmed:
- No flow entity files exist in API source
- No flow entity imports exist in API source code
- All registered entities have corresponding files

### 2. Import Cleanup Verification

✅ **PASSED** — No imports for deleted flow entities found.

Grep searches for flow entity imports returned no results in `packages/server/api/src/`.

### 3. Orphaned ORM Metadata Verification

✅ **PASSED** — No orphaned ORM metadata found.

All entities in `database-connection.ts` are properly defined.

### 4. Orphaned Exports Verification

✅ **PASSED** — No orphaned exports found.

No dead exports related to flow entities detected.

### 5. Dead Database Helpers Verification

✅ **PASSED** — No dead database helpers found.

No database helper files referencing deleted flow entities exist in the API package.

### 6. Remaining References Verification

✅ **PASSED** — No remaining references to deleted flow entities.

Searches confirmed flow entity references exist only in:
- `packages/core/execution/` — Engine execution code (not database entities)
- `packages/integrations/community/*/` — Piece trigger definitions (not database entities)
- `packages/server/sandbox/` — Sandbox cache (out of scope per PR4D rules)

### 7. Migration Recreation Verification

✅ **PASSED** — No migration attempts to recreate deleted workflow entities.

The `DropWorkflowTables` migration only drops tables — it does not create or recreate any tables.

### 8. Migration History Verification

✅ **PASSED** — No migration history modified.

No changes were made to any migration files.

### 9. Build Verification

⚠️ **PRE-EXISTING ERROR** — Build fails with pre-existing TypeScript error:

```
src/app/tables/field/field.service.ts(33,25): error TS2741: Property 'options' is missing in type 'Record<string, unknown>' but required in type '{ options: { value: string; }[]; }'.
```

**Analysis:** This is a pre-existing error unrelated to PR4D. It is a type mismatch in the tables/field service that existed before this audit.

### 10. Lint Verification

⚠️ **PRE-EXISTING WARNINGS/ERRORS** — Lint shows pre-existing code quality issues.

Most issues are:
- Missing return type on function
- Forbidden non-null assertion
- Unused variables

None of the issues are related to flow entities.

---

## What Was Verified (But Not Changed)

| Item | Why Safe | Who Referenced | What Replaced It | Remaining References |
|------|---------|----------------|------------------|---------------------|
| FlowEntity | Removed from registry | N/A (not registered) | N/A | None in API |
| FlowVersionEntity | Removed from registry | N/A (not registered) | N/A | None in API |
| FlowRunEntity | Removed from registry | N/A (not registered) | N/A | None in API |
| WaitpointEntity | Removed from registry | N/A (not registered) | N/A | None in API |
| FolderEntity | Removed from registry | N/A (not registered) | N/A | None in API |
| TriggerSourceEntity | Removed from registry | N/A (not registered) | N/A | None in API |
| TriggerEventEntity | Removed from registry | N/A (not registered) | N/A | None in API |
| AppEventRoutingEntity | Removed from registry | N/A (not registered) | N/A | None in API |
| ProjectReleaseEntity | Removed from registry | N/A (not registered) | N/A | None in API |
| GitRepoEntity | Removed from registry | N/A (not registered) | N/A | None in API |

---

## Technical Debt

### Pre-existing Build Error

The build fails with a pre-existing TypeScript error in `field.service.ts`. This is **NOT related to PR4D** and existed before this audit.

**Recommendation:** Fix in a separate PR.

### Pre-existing Lint Issues

The codebase has pre-existing lint warnings and errors. These are **NOT related to PR4D**.

**Recommendation:** Address in a dedicated code quality cleanup PR.

---

## Conclusion

PR4D database cleanup audit is **COMPLETE**.

**Finding:** No code changes were required. The previous PR4A–PR4C stages successfully removed all flow entity registrations, imports, and related code. The `DropWorkflowTables` migration is in place to drop the remaining obsolete database tables when executed.

**Migration Status:** The `DropWorkflowTables1807000000000` migration exists and is ready. It will drop all obsolete workflow tables when applied.

**Note:** The build failure is a pre-existing issue unrelated to PR4D and should be addressed separately.

---

## Reports Generated

1. `DATABASE_ENTITY_AUDIT.md` — Phase 1 entity audit
2. `PR4D_BLOCKERS.md` — Initial blocker documentation (superseded)
3. `MIGRATION_STATUS_AUDIT.md` — Migration immutability audit
4. `MIGRATION_POLICY_AUDIT.md` — Repository migration policy analysis
5. `MIGRATION_POLICY_NOTE.md` — Phase 0 consistency note
6. `PR4D_DATABASE_CLEANUP.md` — This report

---

**PR4D Status:** ✅ COMPLETE (audit only, no code changes needed)