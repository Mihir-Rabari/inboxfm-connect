import { z } from 'zod'

export const ProjectReplaceResourceKind = z.enum(['table', 'trigger_binding', 'scheduled_task', 'mcp_server'])
export type ProjectReplaceResourceKind = z.infer<typeof ProjectReplaceResourceKind>

export const ProjectReplaceOp = z.enum(['CREATE', 'UPDATE', 'DELETE'])
export type ProjectReplaceOp = z.infer<typeof ProjectReplaceOp>

export const TableSnapshotSchema = z.object({
    name: z.string(),
    externalId: z.string(),
    fields: z.array(z.object({
        name: z.string(),
        type: z.string(),
        externalId: z.string().optional(),
    })).optional(),
    status: z.string().nullable().optional(),
    trigger: z.string().nullable().optional(),
})
export type TableSnapshotSchema = z.infer<typeof TableSnapshotSchema>

export const TriggerBindingSnapshotSchema = z.object({
    externalId: z.string().optional(),
    pieceName: z.string(),
    pieceVersion: z.string(),
    triggerName: z.string(),
    promptTemplate: z.string(),
    connectionExternalId: z.string().nullable().optional(),
    settings: z.record(z.string(), z.unknown()),
    propertySettings: z.record(z.string(), z.unknown()).nullable().optional(),
    status: z.string(),
})
export type TriggerBindingSnapshotSchema = z.infer<typeof TriggerBindingSnapshotSchema>

export const ScheduledTaskSnapshotSchema = z.object({
    externalId: z.string().optional(),
    prompt: z.string(),
    cronExpression: z.string(),
    timezone: z.string(),
    status: z.string(),
})
export type ScheduledTaskSnapshotSchema = z.infer<typeof ScheduledTaskSnapshotSchema>

export const McpServerSnapshotSchema = z.object({
    disabledTools: z.array(z.string()).nullable().optional(),
})
export type McpServerSnapshotSchema = z.infer<typeof McpServerSnapshotSchema>

export const ProjectStateSnapshot = z.object({
    schemaVersion: z.literal(1),
    sourceActivepiecesVersion: z.string(),
    exportedAt: z.string(),
    sourceEnvironment: z.object({
        platformId: z.string().optional(),
        projectId: z.string().optional(),
    }).optional(),
    tables: z.array(TableSnapshotSchema),
    triggerBindings: z.array(TriggerBindingSnapshotSchema),
    scheduledTasks: z.array(ScheduledTaskSnapshotSchema),
    mcp: McpServerSnapshotSchema.nullable().optional(),
    requiredPieces: z.array(z.object({
        name: z.string(),
        version: z.string(),
    })),
    requiredConnections: z.array(z.object({
        externalId: z.string(),
        pieceName: z.string(),
    })),
})
export type ProjectStateSnapshot = z.infer<typeof ProjectStateSnapshot>

export const PreflightError = z.object({
    kind: z.enum(['VERSION_SKEW', 'MISSING_PIECE', 'MISSING_CONNECTION', 'PERMISSIONS', 'GENERAL']),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
})
export type PreflightError = z.infer<typeof PreflightError>

export const ProjectReplaceDiffItem = z.object({
    kind: ProjectReplaceResourceKind,
    externalId: z.string(),
    op: ProjectReplaceOp,
    name: z.string().optional(),
    description: z.string().optional(),
    changes: z.record(z.string(), z.unknown()).optional(),
})
export type ProjectReplaceDiffItem = z.infer<typeof ProjectReplaceDiffItem>

export const ProjectReplacePlan = z.object({
    planId: z.string(),
    schemaVersion: z.literal(1),
    toolVersion: z.string(),
    createdAt: z.string(),
    sourceActivepiecesVersion: z.string(),
    targetActivepiecesVersion: z.string(),
    targetProjectId: z.string(),
    checksum: z.string(),
    destinationStateHash: z.string(),
    signature: z.string(),
    preflight: z.object({
        passed: z.boolean(),
        errors: z.array(PreflightError),
    }),
    changes: z.object({
        creates: z.array(ProjectReplaceDiffItem),
        updates: z.array(ProjectReplaceDiffItem),
        deletes: z.array(ProjectReplaceDiffItem),
        unchanged: z.array(z.object({
            kind: ProjectReplaceResourceKind,
            externalId: z.string(),
        })),
    }),
    summary: z.object({
        created: z.number(),
        updated: z.number(),
        deleted: z.number(),
        unchanged: z.number(),
    }),
})
export type ProjectReplacePlan = z.infer<typeof ProjectReplacePlan>

export const ProjectReplaceArtifact = z.object({
    artifactVersion: z.literal(1),
    toolVersion: z.string(),
    createdAt: z.string(),
    snapshot: ProjectStateSnapshot,
    plan: ProjectReplacePlan,
})
export type ProjectReplaceArtifact = z.infer<typeof ProjectReplaceArtifact>

export const ProjectReplaceApplyRequest = z.object({
    plan: ProjectReplacePlan,
    dryRun: z.boolean().optional(),
    force: z.boolean().optional(),
})
export type ProjectReplaceApplyRequest = z.infer<typeof ProjectReplaceApplyRequest>

export const ProjectReplaceApplyResult = z.object({
    applied: z.object({
        tablesCreated: z.number(),
        tablesUpdated: z.number(),
        tablesDeleted: z.number(),
        tablesUnchanged: z.number(),
        triggerBindingsCreated: z.number(),
        triggerBindingsUpdated: z.number(),
        triggerBindingsDeleted: z.number(),
        triggerBindingsUnchanged: z.number(),
        scheduledTasksCreated: z.number(),
        scheduledTasksUpdated: z.number(),
        scheduledTasksDeleted: z.number(),
        scheduledTasksUnchanged: z.number(),
        mcpUpdated: z.number(),
    }),
    failed: z.array(z.object({
        kind: ProjectReplaceResourceKind,
        externalId: z.string(),
        op: ProjectReplaceOp,
        error: z.string(),
    })),
    durationMs: z.number(),
})
export type ProjectReplaceApplyResult = z.infer<typeof ProjectReplaceApplyResult>
