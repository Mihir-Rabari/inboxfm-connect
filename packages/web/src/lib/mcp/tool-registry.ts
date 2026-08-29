export type McpToolParamType = 'string' | 'string[]' | 'number' | 'boolean' | 'object' | 'object[]' | 'enum'

export interface McpToolParam {
  name: string
  type: McpToolParamType
  required: boolean
}

export interface McpToolAnnotations {
  readOnly?: boolean
  destructive?: boolean
  idempotent?: boolean
  openWorld?: boolean
}

export interface McpToolInfo {
  name: string
  displayName: string
  description: string
  locked: boolean
  annotations: McpToolAnnotations
  params: McpToolParam[]
}

const p = (name: string, type: McpToolParamType, required = false): McpToolParam => ({ name, type, required })

/**
 * Mirrors the server-side MCP tool registry (packages/server/api/src/app/mcp/tools).
 * The backend exposes no REST endpoint listing tools, so this manifest documents the
 * ap_* tools exactly as registered by mcp-server-builder.ts. Keep in sync with
 * LOCKED_TOOL_NAMES / ALL_CONTROLLABLE_TOOL_NAMES in tools/index.ts.
 */
export const MCP_TOOLS: McpToolInfo[] = [
  {
    name: 'ap_research_pieces',
    displayName: 'Research Pieces',
    description:
      'Research available pieces. Use pieceNames for bulk exact lookup (always returns actions and triggers, each with an AI guidance hint). Use searchQuery for fuzzy discovery. Pass forIntent with what you are trying to do to get recommendedActions ranked by AI guidance.',
    locked: true,
    annotations: { readOnly: true, idempotent: true },
    params: [
      p('pieceNames', 'string[]'),
      p('searchQuery', 'string'),
      p('forIntent', 'string'),
      p('includeActions', 'boolean'),
      p('includeTriggers', 'boolean'),
    ],
  },
  {
    name: 'ap_get_piece_props',
    displayName: 'Get Piece Props',
    description:
      "Get the input schema for a piece action or trigger, plus AI guidance for using it: an AI-written description of what it does, an idempotency hint and, when available, the output field paths it produces. Use the AI description to pick the right action.",
    locked: true,
    annotations: { readOnly: true, idempotent: true },
    params: [
      p('pieceName', 'string', true),
      p('actionOrTriggerName', 'string', true),
      p('type', 'enum', true),
      p('auth', 'string'),
      p('input', 'object'),
    ],
  },
  {
    name: 'ap_resolve_property_options',
    displayName: 'Resolve Property Options',
    description:
      'Resolve dropdown options for a single piece property. Returns the available options with labels and values (IDs). Use this to discover valid values for DROPDOWN fields (e.g. Slack channels, Google Sheets, email labels). Always use the value from the returned options, not the label.',
    locked: true,
    annotations: { readOnly: true, idempotent: true },
    params: [
      p('pieceName', 'string', true),
      p('actionOrTriggerName', 'string', true),
      p('type', 'enum', true),
      p('propertyName', 'string', true),
      p('auth', 'string'),
      p('input', 'object'),
      p('searchValue', 'string'),
    ],
  },
  {
    name: 'ap_resolve_property_chain',
    displayName: 'Resolve Property Chain',
    description:
      'Resolve a chain of dependent dropdown properties in one call. For actions with cascading fields (e.g. Spreadsheet → Sheet → Columns), resolves each property sequentially. Pass selectedValue for properties whose value is already known; the tool stops and returns options when it hits one without.',
    locked: true,
    annotations: { readOnly: true, idempotent: true },
    params: [
      p('pieceName', 'string', true),
      p('actionOrTriggerName', 'string', true),
      p('type', 'enum', true),
      p('propertyChain', 'object[]', true),
    ],
  },
  {
    name: 'ap_validate_step_config',
    displayName: 'Validate Step Config',
    description:
      'Validate a step configuration before applying it. Returns field-level errors without modifying anything. Use this to check a config is correct before saving it.',
    locked: true,
    annotations: { readOnly: true, idempotent: true },
    params: [p('stepType', 'enum', true), p('pieceName', 'string'), p('actionName', 'string'), p('triggerName', 'string'), p('input', 'object')],
  },
  {
    name: 'ap_list_connections',
    displayName: 'List Connections',
    description:
      'List OAuth/app connections in the project. Returns externalId needed for the auth parameter on steps.',
    locked: true,
    annotations: { readOnly: true, idempotent: true },
    params: [],
  },
  {
    name: 'ap_list_ai_models',
    displayName: 'List AI Models',
    description:
      'List configured AI providers and their available models. Use this to discover valid provider and model values for configuring agent steps.',
    locked: true,
    annotations: { readOnly: true, idempotent: true, openWorld: true },
    params: [],
  },
  {
    name: 'ap_list_tables',
    displayName: 'List Tables',
    description:
      'List all tables in the current project with their fields (name, type, id) and row counts. Use this to discover available tables before querying or modifying data.',
    locked: true,
    annotations: { readOnly: true, idempotent: true },
    params: [],
  },
  {
    name: 'ap_find_records',
    displayName: 'Find Records',
    description:
      'Query records from a table with optional filtering. Operators: eq, neq, gt, gte, lt, lte, co, exists, not_exists.',
    locked: true,
    annotations: { readOnly: true, idempotent: true },
    params: [p('tableId', 'string', true), p('filters', 'object[]')],
  },
  {
    name: 'ap_setup_guide',
    displayName: 'Setup Guide',
    description: 'Get setup instructions for connections or AI providers. Returns steps for the user to follow in the UI.',
    locked: true,
    annotations: { readOnly: true },
    params: [p('topic', 'enum', true), p('pieceName', 'string')],
  },
  {
    name: 'ap_run_action',
    displayName: 'Run Action',
    description:
      'Execute a single piece action once, without building or saving anything. Use this for one-shot tasks like "check my inbox" or "send one Slack message". Works with any integration connected to the project.',
    locked: false,
    annotations: { destructive: true, openWorld: true },
    params: [
      p('pieceName', 'string', true),
      p('actionName', 'string', true),
      p('input', 'object'),
      p('connectionExternalId', 'string'),
    ],
  },
  {
    name: 'ap_create_table',
    displayName: 'Create Table',
    description: 'Create a new table with an initial set of fields. Types: TEXT, NUMBER, DATE, STATIC_DROPDOWN.',
    locked: false,
    annotations: {},
    params: [p('name', 'string', true), p('fields', 'object[]', true)],
  },
  {
    name: 'ap_delete_table',
    displayName: 'Delete Table',
    description: 'Permanently delete a table and all its data.',
    locked: false,
    annotations: { destructive: true },
    params: [p('tableId', 'string', true), p('displayName', 'string')],
  },
  {
    name: 'ap_manage_fields',
    displayName: 'Manage Fields',
    description: 'Add, rename, or delete fields on a table. Max 100 fields per table.',
    locked: false,
    annotations: {},
    params: [p('tableId', 'string', true), p('operation', 'enum', true), p('fieldId', 'string'), p('name', 'string'), p('options', 'string[]')],
  },
  {
    name: 'ap_insert_records',
    displayName: 'Insert Records',
    description: 'Insert one or more records into a table. Max 50 records per call.',
    locked: false,
    annotations: {},
    params: [p('tableId', 'string', true), p('records', 'object[]', true)],
  },
  {
    name: 'ap_update_record',
    displayName: 'Update Record',
    description: 'Update specific cells in a record. Only specified fields are changed.',
    locked: false,
    annotations: { idempotent: true },
    params: [p('tableId', 'string', true), p('recordId', 'string', true), p('fields', 'object', true)],
  },
  {
    name: 'ap_delete_records',
    displayName: 'Delete Records',
    description: 'Permanently delete one or more records by their IDs.',
    locked: false,
    annotations: { destructive: true },
    params: [p('recordIds', 'string[]', true), p('displayName', 'string')],
  },
]

export function isToolEnabled(tool: McpToolInfo, disabledTools: ReadonlySet<string>): boolean {
  return tool.locked || !disabledTools.has(tool.name)
}
