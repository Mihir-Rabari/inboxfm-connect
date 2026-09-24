import { ProjectRole } from '@inboxfm-connect/core-utils'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart } from '../../database/database-common'

// Relations to project roles are owned by the referencing side (project_member,
// user_invitation), so only columns need to be declared here.
export const ProjectRoleEntity = new EntitySchema<ProjectRole>({
    name: 'project_role',
    columns: {
        ...BaseColumnSchemaPart,
        name: {
            type: String,
            nullable: false,
        },
        permissions: {
            type: String,
            array: true,
            nullable: false,
        },
        platformId: {
            type: String,
            nullable: true,
        },
        type: {
            type: String,
            nullable: false,
        },
    },
})
