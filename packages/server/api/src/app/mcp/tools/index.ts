import { McpToolDefinition, ProjectScopedMcpServer } from '@inboxfm-connect/shared'
import { FastifyBaseLogger } from 'fastify'
import { isToolSearchEnabled } from '../../tool-search/tool-search-flag'
import { apCreateTableTool } from './ap-create-table'
import { apDeleteRecordsTool } from './ap-delete-records'
import { apDeleteTableTool } from './ap-delete-table'
import { apFindRecordsTool } from './ap-find-records'
import { apGetPiecePropsTool } from './ap-get-piece-props'
import { apInsertRecordsTool } from './ap-insert-records'
import { apListAiModelsTool } from './ap-list-ai-models'
import { apListConnectionsTool } from './ap-list-connections'
import { apListTablesTool } from './ap-list-tables'
import { apManageFieldsTool } from './ap-manage-fields'
import { apResearchPiecesTool } from './ap-research-pieces'
import { apResolvePropertyChainTool } from './ap-resolve-property-chain'
import { apResolvePropertyOptionsTool } from './ap-resolve-property-options'
import { apRunActionTool } from './ap-run-action'
import { apSearchActionsTool } from './ap-search-actions'
import { apSearchTriggersTool } from './ap-search-triggers'
import { apSetupGuideTool } from './ap-setup-guide'
import { apUpdateRecordTool } from './ap-update-record'
import { apValidateStepConfigTool } from './ap-validate-step-config'

export const activepiecesTools = (mcp: ProjectScopedMcpServer, userId: string | undefined, log: FastifyBaseLogger): McpToolDefinition[] => [
    apResearchPiecesTool(mcp, log),
    ...(isToolSearchEnabled() ? [apSearchActionsTool(mcp, log), apSearchTriggersTool(mcp, log)] : []),
    apGetPiecePropsTool(mcp, log),
    apResolvePropertyOptionsTool(mcp, log),
    apResolvePropertyChainTool(mcp, log),
    apValidateStepConfigTool(mcp, log),
    apListConnectionsTool(mcp, log),
    apListAiModelsTool(mcp, log),
    apListTablesTool(mcp, log),
    apFindRecordsTool(mcp, log),
    apCreateTableTool(mcp, log),
    apDeleteTableTool(mcp, log),
    apManageFieldsTool(mcp, log),
    apInsertRecordsTool(mcp, log),
    apUpdateRecordTool(mcp, log),
    apDeleteRecordsTool(mcp, log),
    apRunActionTool(mcp, log),
    apSetupGuideTool(mcp, log),
]

export const LOCKED_TOOL_NAMES: string[] = [
    'ap_research_pieces',
    'ap_get_piece_props',
    'ap_resolve_property_options',
    'ap_resolve_property_chain',
    'ap_validate_step_config',
    'ap_list_connections',
    'ap_list_ai_models',
    'ap_list_tables',
    'ap_find_records',
    'ap_setup_guide',
]

export const PLATFORM_LEVEL_TOOL_NAMES: string[] = [
    'ap_research_pieces',
    'ap_search_actions',
    'ap_search_triggers',
    'ap_list_ai_models',
    'ap_get_piece_props',
]

export const ALL_CONTROLLABLE_TOOL_NAMES: string[] = [
    'ap_create_table',
    'ap_delete_table',
    'ap_manage_fields',
    'ap_insert_records',
    'ap_update_record',
    'ap_delete_records',
    'ap_run_action',
]
