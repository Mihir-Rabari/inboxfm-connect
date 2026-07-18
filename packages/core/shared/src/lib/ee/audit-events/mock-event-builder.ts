import { apId, PlatformId, ProjectId } from '@inboxfm-connect/core-utils'
import {
    ApplicationEvent,
    ApplicationEventName,
    AuthenticationEvent,
    ConnectionEvent,
    ProjectRoleEvent,
    SigningKeyEvent,
    SignUpEvent,
    VariableEvent,
} from './index'

export const buildMockEvent = ({ event, platformId, projectId }: BuildMockEventParams): ApplicationEvent => {
    const isoNow = new Date().toISOString()
    const baseEnvelope = {
        id: apId(),
        created: isoNow,
        updated: isoNow,
        ip: '127.0.0.1',
        platformId,
        projectId,
        userId: apId(),
    }
    const project = { displayName: 'Dream Department' }
    const user = {
        id: apId(),
        email: 'sample@example.com',
        firstName: 'Sample',
        lastName: 'User',
    }

    switch (event) {
        case ApplicationEventName.CONNECTION_UPSERTED:
        case ApplicationEventName.CONNECTION_DELETED: {
            const mock: ConnectionEvent = {
                ...baseEnvelope,
                action: event,
                data: {
                    connection: {
                        id: apId(),
                        displayName: 'Sample connection',
                        externalId: 'sample-connection',
                        pieceName: '@inboxfm-connect/piece-sample',
                        status: 'ACTIVE',
                        type: 'CUSTOM_AUTH',
                        created: isoNow,
                        updated: isoNow,
                    },
                    project,
                },
            }
            return mock
        }
        case ApplicationEventName.VARIABLE_UPSERTED:
        case ApplicationEventName.VARIABLE_DELETED:
        case ApplicationEventName.VARIABLE_VALUE_REVEALED: {
            const mock: VariableEvent = {
                ...baseEnvelope,
                action: event,
                data: {
                    variable: {
                        id: apId(),
                        name: 'SAMPLE_VARIABLE',
                        created: isoNow,
                        updated: isoNow,
                    },
                    project,
                },
            }
            return mock
        }
        case ApplicationEventName.USER_SIGNED_IN:
        case ApplicationEventName.USER_PASSWORD_RESET:
        case ApplicationEventName.USER_EMAIL_VERIFIED: {
            const mock: AuthenticationEvent = {
                ...baseEnvelope,
                action: event,
                data: { user },
            }
            return mock
        }
        case ApplicationEventName.USER_SIGNED_UP: {
            const mock: SignUpEvent = {
                ...baseEnvelope,
                action: ApplicationEventName.USER_SIGNED_UP,
                data: { source: 'credentials', user },
            }
            return mock
        }
        case ApplicationEventName.SIGNING_KEY_CREATED: {
            const mock: SigningKeyEvent = {
                ...baseEnvelope,
                action: ApplicationEventName.SIGNING_KEY_CREATED,
                data: {
                    signingKey: {
                        id: apId(),
                        displayName: 'Sample signing key',
                        created: isoNow,
                        updated: isoNow,
                    },
                },
            }
            return mock
        }
        case ApplicationEventName.PROJECT_ROLE_CREATED:
        case ApplicationEventName.PROJECT_ROLE_UPDATED:
        case ApplicationEventName.PROJECT_ROLE_DELETED: {
            const mock: ProjectRoleEvent = {
                ...baseEnvelope,
                action: event,
                data: {
                    projectRole: {
                        id: apId(),
                        created: isoNow,
                        updated: isoNow,
                        name: 'Sample role',
                        permissions: [],
                        platformId,
                    },
                },
            }
            return mock
        }
    }
}

export type BuildMockEventParams = {
    event: ApplicationEventName
    platformId: PlatformId
    projectId?: ProjectId
}


