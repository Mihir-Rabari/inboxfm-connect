import { assertNotNullOrUndefined, isNil } from '@inboxfm-connect/core-utils'
import { InvitationType, UserInvitation } from '@inboxfm-connect/shared'
import { FastifyBaseLogger } from 'fastify'
import { platformService } from '../../platform/platform.service'
import { projectService } from '../../project/project-service'
import { domainHelper } from '../domain-helper'
import { smtpEmailSender } from './smtp-email-sender'

// Project-role metadata still sits behind the ee license boundary (see #13 and
// #25), so CE code cannot resolve a project role's display name. CE platforms
// cannot create PROJECT invitations at all — the open-source plan ships with
// `projectRolesEnabled` disabled and the controller rejects them with 402 — so
// this label only surfaces for data written by editions that had project roles
// enabled.
const UNRESOLVED_PROJECT_ROLE_LABEL = 'member'

export const emailService = (log: FastifyBaseLogger) => ({
    async sendInvitation({ userInvitation, invitationLink }: SendInvitationParams): Promise<void> {
        log.info({
            invitation: {
                id: userInvitation.id,
                email: userInvitation.email,
                type: userInvitation.type,
            },
            platform: { id: userInvitation.platformId },
            project: { id: userInvitation.projectId },
        }, '[emailService#sendInvitation] sending invitation email')
        const { entityName } = await resolveInvitationEntityName({ userInvitation, log })
        await smtpEmailSender(log).send({
            platformId: userInvitation.platformId,
            recipients: [userInvitation.email],
            template: 'invitation-email',
            vars: {
                setupLink: invitationLink,
                projectName: entityName,
            },
        })
    },

    async sendProjectMemberAdded({ userInvitation }: SendProjectMemberAddedParams): Promise<void> {
        log.info({
            invitation: {
                id: userInvitation.id,
                email: userInvitation.email,
                type: userInvitation.type,
            },
            platform: { id: userInvitation.platformId },
            project: { id: userInvitation.projectId },
        }, '[emailService#sendProjectMemberAdded] sending project member added email')
        const { entityName, role } = await resolveInvitationEntityName({ userInvitation, log })
        const postLoginPath = `sign-in?from=${encodeURIComponent(buildPostLoginPath(userInvitation))}`
        const loginLink = await domainHelper.getPublicUrl({ path: postLoginPath })
        await smtpEmailSender(log).send({
            platformId: userInvitation.platformId,
            recipients: [userInvitation.email],
            template: 'project-member-added',
            vars: {
                loginLink,
                projectName: entityName,
                role,
            },
        })
    },
})

async function resolveInvitationEntityName({ userInvitation, log }: ResolveInvitationEntityNameParams): Promise<InvitationEntityName> {
    switch (userInvitation.type) {
        case InvitationType.PLATFORM: {
            const platform = await platformService(log).getOneOrThrow(userInvitation.platformId)
            assertNotNullOrUndefined(userInvitation.platformRole, 'platformRole')
            return {
                entityName: platform.name,
                role: capitalizeFirstLetter(userInvitation.platformRole),
            }
        }
        case InvitationType.PROJECT: {
            assertNotNullOrUndefined(userInvitation.projectId, 'projectId')
            const project = await projectService(log).getOneOrThrow(userInvitation.projectId)
            return {
                entityName: project.displayName,
                role: UNRESOLVED_PROJECT_ROLE_LABEL,
            }
        }
    }
}

function buildPostLoginPath(userInvitation: UserInvitation): string {
    return isNil(userInvitation.projectId) ? '/flows' : `/projects/${userInvitation.projectId}/flows`
}

function capitalizeFirstLetter(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

export type SendInvitationParams = {
    userInvitation: UserInvitation
    invitationLink: string
}

export type SendProjectMemberAddedParams = {
    userInvitation: UserInvitation
}

type InvitationEntityName = {
    entityName: string
    role: string
}

type ResolveInvitationEntityNameParams = {
    userInvitation: UserInvitation
    log: FastifyBaseLogger
}
