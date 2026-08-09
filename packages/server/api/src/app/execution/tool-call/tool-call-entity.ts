import { Execution, Project, ToolCall } from '@inboxfm-connect/shared'
import { EntitySchema } from 'typeorm'
import { ApIdSchema, BaseColumnSchemaPart } from '../../database/database-common'

export const ToolCallEntity = new EntitySchema<ToolCallSchema>({
    name: 'tool_call',
    columns: {
        ...BaseColumnSchemaPart,
        executionId: {
            ...ApIdSchema,
            nullable: false,
        },
        projectId: {
            ...ApIdSchema,
            nullable: false,
        },
        pieceName: {
            type: String,
            nullable: false,
        },
        pieceVersion: {
            type: String,
            nullable: false,
        },
        actionName: {
            type: String,
            nullable: false,
        },
        connectionId: {
            ...ApIdSchema,
            nullable: true,
        },
        input: {
            type: 'json',
            nullable: false,
        },
        output: {
            type: 'json',
            nullable: true,
        },
        status: {
            type: String,
            nullable: false,
        },
        error: {
            type: 'json',
            nullable: true,
        },
        latencyMs: {
            type: 'numeric',
            nullable: true,
        },
        finished: {
            type: 'timestamp with time zone',
            nullable: true,
        },
    },
    indices: [
        {
            name: 'idx_tool_call_execution_id',
            columns: ['executionId'],
        },
        {
            name: 'idx_tool_call_project_id',
            columns: ['projectId'],
        },
        {
            name: 'idx_tool_call_created',
            columns: ['created'],
        },
    ],
    relations: {
        execution: {
            type: 'many-to-one',
            target: 'execution',
            cascade: true,
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'executionId',
                foreignKeyConstraintName: 'fk_tool_call_execution_id',
            },
        },
        project: {
            type: 'many-to-one',
            target: 'project',
            cascade: true,
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'projectId',
                foreignKeyConstraintName: 'fk_tool_call_project_id',
            },
        },
    },
})

export type ToolCallSchema = ToolCall & {
    execution: Execution
    project: Project
}
