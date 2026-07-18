import { BaseModelSchema, DateOrString, OptionalArrayFromQuery, ProjectRole } from '@inboxfm-connect/core-utils'
import { z } from 'zod'
import * as zMini from 'zod/mini'
import { UserWithMetaInformation } from '../../core/user/user'
import { SigningKey } from '../signing-key'

export const ListAuditEventsRequest = z.object({
    limit: z.coerce.number().optional(),
    cursor: z.string().optional(),
    action: OptionalArrayFromQuery(z.string()),
    projectId: OptionalArrayFromQuery(z.string()),
    userId: z.string().optional(),
    createdBefore: z.string().optional(),
    createdAfter: z.string().optional(),
})

export type ListAuditEventsRequest = z.infer<typeof ListAuditEventsRequest>

const UserMeta = UserWithMetaInformation.pick({ email: true, id: true, firstName: true, lastName: true })

export enum ApplicationEventName {
    CONNECTION_UPSERTED = 'connection.upserted',
    CONNECTION_DELETED = 'connection.deleted',
    VARIABLE_UPSERTED = 'variable.upserted',
    VARIABLE_DELETED = 'variable.deleted',
    VARIABLE_VALUE_REVEALED = 'variable.value.revealed',
    USER_SIGNED_UP = 'user.signed.up',
    USER_SIGNED_IN = 'user.signed.in',
    USER_PASSWORD_RESET = 'user.password.reset',
    USER_EMAIL_VERIFIED = 'user.email.verified',
    SIGNING_KEY_CREATED = 'signing.key.created',
    PROJECT_ROLE_CREATED = 'project.role.created',
    PROJECT_ROLE_DELETED = 'project.role.deleted',
    PROJECT_ROLE_UPDATED = 'project.role.updated',
}

const BaseAuditEventProps = {
    ...BaseModelSchema,
    platformId: z.string(),
    projectId: z.string().optional(),
    projectDisplayName: z.string().optional(),
    userId: z.string().optional(),
    userEmail: z.string().optional(),
    ip: z.string().optional(),
}

const ConnectionEventData = z.object({
    connection: z.object({
        displayName: z.string(),
        externalId: z.string(),
        pieceName: z.string(),
        status: z.string(),
        type: z.string(),
        id: z.string(),
        created: DateOrString,
        updated: DateOrString,
    }),
    project: z.object({
        displayName: z.string(),
    }).optional(),
})

export const ConnectionEvent = z.object({
    ...BaseAuditEventProps,
    action: z.union([
        z.literal(ApplicationEventName.CONNECTION_DELETED),
        z.literal(ApplicationEventName.CONNECTION_UPSERTED),
    ]),
    data: ConnectionEventData,
})
export type ConnectionEvent = z.infer<typeof ConnectionEvent>

export const ConnectionUpsertedEvent = z.object({
    ...BaseAuditEventProps,
    action: z.literal(ApplicationEventName.CONNECTION_UPSERTED),
    data: ConnectionEventData,
})
export type ConnectionUpsertedEvent = z.infer<typeof ConnectionUpsertedEvent>

export const ConnectionDeletedEvent = z.object({
    ...BaseAuditEventProps,
    action: z.literal(ApplicationEventName.CONNECTION_DELETED),
    data: ConnectionEventData,
})
export type ConnectionDeletedEvent = z.infer<typeof ConnectionDeletedEvent>

const VariableEventData = z.object({
    variable: z.object({
        id: z.string(),
        name: z.string(),
        created: DateOrString,
        updated: DateOrString,
    }),
    project: z.object({
        displayName: z.string(),
    }).optional(),
})

export const VariableEvent = z.object({
    ...BaseAuditEventProps,
    action: z.union([
        z.literal(ApplicationEventName.VARIABLE_UPSERTED),
        z.literal(ApplicationEventName.VARIABLE_DELETED),
        z.literal(ApplicationEventName.VARIABLE_VALUE_REVEALED),
    ]),
    data: VariableEventData,
})
export type VariableEvent = z.infer<typeof VariableEvent>

export const VariableUpsertedEvent = z.object({
    ...BaseAuditEventProps,
    action: z.literal(ApplicationEventName.VARIABLE_UPSERTED),
    data: VariableEventData,
})
export type VariableUpsertedEvent = z.infer<typeof VariableUpsertedEvent>

export const VariableDeletedEvent = z.object({
    ...BaseAuditEventProps,
    action: z.literal(ApplicationEventName.VARIABLE_DELETED),
    data: VariableEventData,
})
export type VariableDeletedEvent = z.infer<typeof VariableDeletedEvent>

export const VariableValueRevealedEvent = z.object({
    ...BaseAuditEventProps,
    action: z.literal(ApplicationEventName.VARIABLE_VALUE_REVEALED),
    data: VariableEventData,
})
export type VariableValueRevealedEvent = z.infer<typeof VariableValueRevealedEvent>

const AuthenticationEventData = z.object({
    user: UserMeta.optional(),
})

export const AuthenticationEvent = z.object({
    ...BaseAuditEventProps,
    action: z.union([
        z.literal(ApplicationEventName.USER_SIGNED_IN),
        z.literal(ApplicationEventName.USER_PASSWORD_RESET),
        z.literal(ApplicationEventName.USER_EMAIL_VERIFIED),
    ]),
    data: AuthenticationEventData,
})

export type AuthenticationEvent = z.infer<typeof AuthenticationEvent>

export const UserSignedInEvent = z.object({
    ...BaseAuditEventProps,
    action: z.literal(ApplicationEventName.USER_SIGNED_IN),
    data: AuthenticationEventData,
})
export type UserSignedInEvent = z.infer<typeof UserSignedInEvent>

export const UserPasswordResetEvent = z.object({
    ...BaseAuditEventProps,
    action: z.literal(ApplicationEventName.USER_PASSWORD_RESET),
    data: AuthenticationEventData,
})
export type UserPasswordResetEvent = z.infer<typeof UserPasswordResetEvent>

export const UserEmailVerifiedEvent = z.object({
    ...BaseAuditEventProps,
    action: z.literal(ApplicationEventName.USER_EMAIL_VERIFIED),
    data: AuthenticationEventData,
})
export type UserEmailVerifiedEvent = z.infer<typeof UserEmailVerifiedEvent>

export const SignUpEvent = z.object({
    ...BaseAuditEventProps,
    action: z.literal(ApplicationEventName.USER_SIGNED_UP),
    data: z.object({
        source: z.union([
            z.literal('credentials'),
            z.literal('sso'),
            z.literal('managed'),
        ]),
        user: UserMeta.optional(),
    }),
})
export type SignUpEvent = z.infer<typeof SignUpEvent>

export const SigningKeyEvent = z.object({
    ...BaseAuditEventProps,
    action: z.union([z.literal(ApplicationEventName.SIGNING_KEY_CREATED)]),
    data: z.object({
        signingKey: SigningKey.pick({
            id: true,
            created: true,
            updated: true,
            displayName: true,
        }),
    }),
})

export type SigningKeyEvent = z.infer<typeof SigningKeyEvent>

export const ProjectRoleEvent = z.object({
    ...BaseAuditEventProps,
    action: z.union([
        z.literal(ApplicationEventName.PROJECT_ROLE_CREATED),
        z.literal(ApplicationEventName.PROJECT_ROLE_UPDATED),
        z.literal(ApplicationEventName.PROJECT_ROLE_DELETED),
    ]),
    data: z.object({
        projectRole: zMini.pick(ProjectRole, {
            id: true,
            created: true,
            updated: true,
            name: true,
            permissions: true,
            platformId: true,
        }),
    }),
})

export type ProjectRoleEvent = z.infer<typeof ProjectRoleEvent>

export const ApplicationEvent = z.union([
    ConnectionEvent,
    VariableEvent,
    AuthenticationEvent,
    SignUpEvent,
    SigningKeyEvent,
    ProjectRoleEvent,
])

export type ApplicationEvent = z.infer<typeof ApplicationEvent>

export function summarizeApplicationEvent(event: ApplicationEvent) {
    switch (event.action) {
        case ApplicationEventName.CONNECTION_UPSERTED:
            return `${event.data.connection.displayName} (${event.data.connection.externalId}) is updated`
        case ApplicationEventName.CONNECTION_DELETED:
            return `${event.data.connection.displayName} (${event.data.connection.externalId}) is deleted`
        case ApplicationEventName.VARIABLE_UPSERTED:
            return `Variable ${event.data.variable.name} is created or updated`
        case ApplicationEventName.VARIABLE_DELETED:
            return `Variable ${event.data.variable.name} is deleted`
        case ApplicationEventName.VARIABLE_VALUE_REVEALED:
            return `Variable ${event.data.variable.name} value was revealed`
        case ApplicationEventName.USER_SIGNED_IN:
            return `User ${event.userEmail} signed in`
        case ApplicationEventName.USER_PASSWORD_RESET:
            return `User ${event.userEmail} reset password`
        case ApplicationEventName.USER_EMAIL_VERIFIED:
            return `User ${event.userEmail} verified email`
        case ApplicationEventName.USER_SIGNED_UP:
            return `User ${event.userEmail} signed up using email from ${event.data.source}`
        case ApplicationEventName.SIGNING_KEY_CREATED:
            return `${event.data.signingKey.displayName} is created`
        case ApplicationEventName.PROJECT_ROLE_CREATED:
            return `${event.data.projectRole.name} is created`
        case ApplicationEventName.PROJECT_ROLE_UPDATED:
            return `${event.data.projectRole.name} is updated`
        case ApplicationEventName.PROJECT_ROLE_DELETED:
            return `${event.data.projectRole.name} is deleted`
    }
}

export * from './mock-event-builder'

