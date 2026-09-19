import { RoleType } from '@inboxfm-connect/core-utils'
import { DefaultProjectRole, rolePermissions } from '@inboxfm-connect/shared'
import { repoFactory } from '../../core/db/repo-factory'
import { system } from '../../helper/system/system'
import { ProjectRoleEntity } from '../../project/project-role/project-role.entity'
import { DataSeed } from './data-seed'

const projectRoleRepo = repoFactory(ProjectRoleEntity)

// DO NOT CHANGE THESE IDS OR SHUFFLE THEM
const roleIds: Record<DefaultProjectRole, string> = {
    [DefaultProjectRole.ADMIN]: '461ueYHzMykyk5dIL8HzQ',
    [DefaultProjectRole.EDITOR]: 'sjWe85TwaFYxyhn2AgOha',
    [DefaultProjectRole.VIEWER]: 'aJVBSSJ3YqZ7r1laFjM0a',
}

export const rolesSeed: DataSeed = {
    run: async () => {
        system.globalLogger().info({ name: 'rolesSeed' }, 'Seeding roles')
        for (const role of Object.values(DefaultProjectRole)) {
            const permissions = rolePermissions[role]
            await projectRoleRepo().upsert({
                name: role,
                permissions,
                type: RoleType.DEFAULT,
                id: roleIds[role],
            }, ['id'])
        }
    },
}
