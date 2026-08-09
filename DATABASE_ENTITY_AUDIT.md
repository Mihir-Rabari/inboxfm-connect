# DATABASE_ENTITY_AUDIT.md

**Date:** 2026-08-04  
**Audit Type:** Phase 1 - Repository-wide Entity Audit  
**Status:** 🚨 BLOCKER IDENTIFIED

---

## Executive Summary

The database entity audit reveals that:

1. **NO flow-related entities are currently registered** in `database-connection.ts` - ✅ GOOD
2. **DropWorkflowTables migration EXISTS but is NOT reversible** - ❌ BLOCKER
3. **The migration drops tables that match the product contract for removal** - ✅ CORRECT

The existing `DropWorkflowTables1807000000000` migration violates the requirement that "Migration must be reversible" because its `down()` method is a no-op.

---

## Entity Registration Status (from database-connection.ts)

### Currently Registered Entities (40 total)

| Entity | Table | Registered | Notes |
|--------|-------|------------|-------|
| FileEntity | file | ✅ YES | Core |
| FlagEntity | flag | ✅ YES | Core |
| ProjectEntity | project | ✅ YES | Core |
| StoreEntryEntity | store_entry | ✅ YES | Core |
| UserEntity | user | ✅ YES | Core |
| ConnectionEntity | connection | ✅ YES | Core |
| IntegrationMetadataEntity | integration_metadata | ✅ YES | Core |
| PlatformEntity | platform | ✅ YES | Core |
| SecretManagerEntity | secret_manager | ✅ YES | Core |
| TagEntity | tag | ✅ YES | Core |
| PieceTagEntity | piece_tag | ✅ YES | Core |
| UserInvitationEntity | user_invitation | ✅ YES | Core |
| AIProviderEntity | ai_provider | ✅ YES | Core |
| AiToolConfigEntity | ai_tool_config | ✅ YES | Core |
| ProjectRoleEntity | project_role | ✅ YES | EE |
| TableEntity | table | ✅ YES | Tables |
| FieldEntity | field | ✅ YES | Tables |
| RecordEntity | record | ✅ YES | Tables |
| CellEntity | cell | ✅ YES | Tables |
| UserIdentityEntity | user_identity | ✅ YES | Core |
| McpServerEntity | mcp_server | ✅ YES | MCP |
| McpOAuthClientEntity | mcp_oauth_client | ✅ YES | MCP |
| McpOAuthAuthorizationCodeEntity | mcp_oauth_authorization_code | ✅ YES | MCP |
| McpOAuthTokenEntity | mcp_oauth_token | ✅ YES | MCP |
| ToolSearchIndexEntity | tool_search_index | ✅ YES | Tools |
| ConcurrencyPoolEntity | concurrency_pool | ✅ YES | EE |
| ProjectMemberEntity | project_member | ✅ YES | EE |
| ProjectPlanEntity | project_plan | ✅ YES | EE |
| SigningKeyEntity | signing_key | ✅ YES | EE |
| OAuthAppEntity | oauth_app | ✅ YES | EE |
| OtpEntity | otp | ✅ YES | EE |
| ApiKeyEntity | api_key | ✅ YES | EE |
| AuditEventEntity | audit_event | ✅ YES | EE |
| PlatformAnalyticsReportEntity | platform_analytics_report | ✅ YES | EE |
| EmbedSubdomainEntity | embed_subdomain | ✅ YES | EE |
| AppSumoEntity | app_sumo | ✅ YES | CLOUD |
| ConnectionKeyEntity | connection_key | ✅ YES | CLOUD |
| AppCredentialEntity | app_credential | ✅ YES | CLOUD |
| PlatformPlanEntity | platform_plan | ✅ YES | CLOUD |
| EventDestinationEntity | event_destination | ✅ YES | CLOUD |

### Flow-related Entities (NOT registered)

| Entity | Table | Exists in Migrations | Should Remove |
|--------|-------|---------------------|---------------|
| FlowEntity | flow | ✅ YES | ✅ YES |
| FlowVersionEntity | flow_version | ✅ YES | ✅ YES |
| FlowRunEntity | flow_run | ✅ YES | ✅ YES |
| WaitpointEntity | waitpoint | ✅ YES | ✅ YES |
| FolderEntity | folder | ✅ YES | ✅ YES |
| TriggerSourceEntity | trigger_source | ✅ YES | ✅ YES |
| TriggerEventEntity | trigger_event | ✅ YES | ✅ YES |
| AppEventRoutingEntity | app_event_routing | ✅ YES | ✅ YES |
| ProjectReleaseEntity | project_release | ✅ YES | ✅ YES |
| GitRepoEntity | git_repo | ✅ YES | ✅ YES |

---

## Migration Analysis

### Existing DropWorkflowTables Migration

**File:** `packages/server/api/src/app/database/migration/postgres/1807000000000-DropWorkflowTables.ts`

**up() method drops:**
- waitpoint
- trigger_event
- trigger_source
- flow_run
- flow_version
- flow
- folder
- app_event_routing
- git_repo
- project_release
- template
- table_webhook

**down() method:** `// No-op` ❌ **NOT REVERSIBLE**

### SQLite Version

**File:** `packages/server/api/src/app/database/migration/sqlite/1807000000000-DropWorkflowTablesSqlite.ts`

Same issue - `down()` is a no-op.

---

## 🚨 BLOCKER

### Issue: Migration Not Reversible

The existing `DropWorkflowTables1807000000000` migration violates the task requirement:

> "Migration must be reversible."

The `down()` method is empty (`// No-op`), which means:
- Rolling back the migration is impossible
- If applied to production, the changes cannot be reverted
- This violates the reproducibility requirement

---

## Can Remove Analysis

| Table | Can Remove | Reasoning |
|-------|-----------|-----------|
| flow | ✅ YES | Not registered, dropped by existing migration |
| flow_version | ✅ YES | Not registered, dropped by existing migration |
| flow_run | ✅ YES | Not registered, dropped by existing migration |
| waitpoint | ✅ YES | Not registered, dropped by existing migration |
| folder | ✅ YES | Not registered, dropped by existing migration |
| trigger_event | ✅ YES | Not registered, dropped by existing migration |
| trigger_source | ✅ YES | Not registered, dropped by existing migration |
| app_event_routing | ✅ YES | Not registered, dropped by existing migration |
| project_release | ✅ YES | Not registered, dropped by existing migration |
| git_repo | ✅ YES | Not registered, dropped by existing migration |
| template | ⚠️ CHECK | Not in expected list, check usage |
| table_webhook | ⚠️ CHECK | Not in expected list, check usage |

---

## Tables to RETAIN (DO NOT DROP)

- connection
- project
- platform
- user
- oauth
- knowledge_base
- knowledge_base_chunk
- knowledge_base_file
- integration_metadata
- piece_metadata
- scheduler
- redis metadata
- file
- flag
- store_entry
- tag
- piece_tag
- mcp_server
- mcp_oauth_*
- ai_provider
- ai_tool_config
- table, field, record, cell
- And all other currently registered entities

---

## References

- `database-connection.ts` - Entity registration
- `1807000000000-DropWorkflowTables.ts` - Existing migration (not reversible)
- `1807000000000-DropWorkflowTablesSqlite.ts` - SQLite version (not reversible)

---

## Next Steps

1. **FIX BLOCKER:** The existing migration must be made reversible OR a new reversible migration must be created
2. Verify no foreign key dependencies exist on the tables being dropped
3. Generate PR4D_BLOCKERS.md documenting the issue
4. Stop until blocker is resolved per STOP CONDITIONS