import { Principal, PrincipalType } from '@inboxfm-connect/shared'
import { AuditActor, defineAuditAction } from 'evlog'

const connectionListed = defineAuditAction('connection.listed', { target: 'project' })
const globalConnectionListed = defineAuditAction('global-connection.listed', { target: 'platform' })
const apiKeyCreated = defineAuditAction('apiKey.created', { target: 'apiKey' })
const apiKeyRevoked = defineAuditAction('apiKey.revoked', { target: 'apiKey' })
const apiKeyRotated = defineAuditAction('apiKey.rotated', { target: 'apiKey' })
const connectApiKeyCreated = defineAuditAction('apiKey.created', { target: 'connectApiKey' })
const connectApiKeyRevoked = defineAuditAction('apiKey.revoked', { target: 'connectApiKey' })
const connectApiKeyRotated = defineAuditAction('apiKey.rotated', { target: 'connectApiKey' })

export const auditEvents = {
    connectionListed,
    globalConnectionListed,
    apiKeyCreated,
    apiKeyRevoked,
    apiKeyRotated,
    connectApiKeyCreated,
    connectApiKeyRevoked,
    connectApiKeyRotated,
    actorFromPrincipal,
}

function actorFromPrincipal(principal: Principal): AuditActor {
    switch (principal.type) {
        case PrincipalType.USER:
            return { type: 'user', id: principal.id }
        case PrincipalType.SERVICE:
            return { type: 'api', id: principal.id }
        default:
            return { type: 'system', id: principal.id }
    }
}
