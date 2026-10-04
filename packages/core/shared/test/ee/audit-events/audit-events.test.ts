import { apId } from '@inboxfm-connect/core-utils'
import { describe, expect, it } from 'vitest'
import {
    ApplicationEvent,
    ApplicationEventName,
    buildMockEvent,
    ListAuditEventsRequest,
    summarizeApplicationEvent,
} from '../../../src/lib/ee/audit-events'

describe('Audit Events Contracts and Summarizers', () => {
    describe('ListAuditEventsRequest schema', () => {
        it('accepts empty query parameters object', () => {
            const parsed = ListAuditEventsRequest.parse({})
            expect(parsed.limit).toBeUndefined()
            expect(parsed.action).toBeUndefined()
            expect(parsed.projectId).toBeUndefined()
        })

        it('coerces limit and handles scalar and array values via OptionalArrayFromQuery', () => {
            const scalarQuery = {
                limit: '50',
                action: ApplicationEventName.USER_SIGNED_IN,
                projectId: 'proj_123',
                createdAfter: '2026-01-01T00:00:00.000Z',
            }
            const parsedScalar = ListAuditEventsRequest.parse(scalarQuery)
            expect(parsedScalar.limit).toBe(50)
            expect(parsedScalar.action).toEqual([ApplicationEventName.USER_SIGNED_IN])
            expect(parsedScalar.projectId).toEqual(['proj_123'])

            const arrayQuery = {
                action: [ApplicationEventName.USER_SIGNED_IN, ApplicationEventName.USER_SIGNED_UP],
                projectId: ['proj_1', 'proj_2'],
            }
            const parsedArray = ListAuditEventsRequest.parse(arrayQuery)
            expect(parsedArray.action).toEqual([
                ApplicationEventName.USER_SIGNED_IN,
                ApplicationEventName.USER_SIGNED_UP,
            ])
            expect(parsedArray.projectId).toEqual(['proj_1', 'proj_2'])
        })
    })

    describe('ApplicationEventName enum values', () => {
        it('contains all 13 standard platform audit event names', () => {
            expect(ApplicationEventName.CONNECTION_UPSERTED).toBe('connection.upserted')
            expect(ApplicationEventName.CONNECTION_DELETED).toBe('connection.deleted')
            expect(ApplicationEventName.VARIABLE_UPSERTED).toBe('variable.upserted')
            expect(ApplicationEventName.VARIABLE_DELETED).toBe('variable.deleted')
            expect(ApplicationEventName.VARIABLE_VALUE_REVEALED).toBe('variable.value.revealed')
            expect(ApplicationEventName.USER_SIGNED_UP).toBe('user.signed.up')
            expect(ApplicationEventName.USER_SIGNED_IN).toBe('user.signed.in')
            expect(ApplicationEventName.USER_PASSWORD_RESET).toBe('user.password.reset')
            expect(ApplicationEventName.USER_EMAIL_VERIFIED).toBe('user.email.verified')
            expect(ApplicationEventName.SIGNING_KEY_CREATED).toBe('signing.key.created')
            expect(ApplicationEventName.PROJECT_ROLE_CREATED).toBe('project.role.created')
            expect(ApplicationEventName.PROJECT_ROLE_DELETED).toBe('project.role.deleted')
            expect(ApplicationEventName.PROJECT_ROLE_UPDATED).toBe('project.role.updated')
        })
    })

    describe('buildMockEvent factory and ApplicationEvent schema validation', () => {
        const platformId = apId()
        const projectId = apId()

        const allEvents: ApplicationEventName[] = [
            ApplicationEventName.CONNECTION_UPSERTED,
            ApplicationEventName.CONNECTION_DELETED,
            ApplicationEventName.VARIABLE_UPSERTED,
            ApplicationEventName.VARIABLE_DELETED,
            ApplicationEventName.VARIABLE_VALUE_REVEALED,
            ApplicationEventName.USER_SIGNED_IN,
            ApplicationEventName.USER_PASSWORD_RESET,
            ApplicationEventName.USER_EMAIL_VERIFIED,
            ApplicationEventName.USER_SIGNED_UP,
            ApplicationEventName.SIGNING_KEY_CREATED,
            ApplicationEventName.PROJECT_ROLE_CREATED,
            ApplicationEventName.PROJECT_ROLE_UPDATED,
            ApplicationEventName.PROJECT_ROLE_DELETED,
        ]

        for (const eventName of allEvents) {
            it(`builds and validates mock event for ${eventName}`, () => {
                const event = buildMockEvent({
                    event: eventName,
                    platformId,
                    projectId,
                })
                expect(event.action).toBe(eventName)
                expect(event.platformId).toBe(platformId)
                expect(event.projectId).toBe(projectId)

                const parsed = ApplicationEvent.parse(event)
                expect(parsed.action).toBe(eventName)
            })
        }
    })

    describe('summarizeApplicationEvent messages', () => {
        const platformId = apId()
        const projectId = apId()

        it('summarizes CONNECTION_UPSERTED and CONNECTION_DELETED', () => {
            const upserted = buildMockEvent({
                event: ApplicationEventName.CONNECTION_UPSERTED,
                platformId,
                projectId,
            })
            expect(summarizeApplicationEvent(upserted)).toBe(
                'Sample connection (sample-connection) is updated',
            )

            const deleted = buildMockEvent({
                event: ApplicationEventName.CONNECTION_DELETED,
                platformId,
                projectId,
            })
            expect(summarizeApplicationEvent(deleted)).toBe(
                'Sample connection (sample-connection) is deleted',
            )
        })

        it('summarizes variable events', () => {
            const upserted = buildMockEvent({
                event: ApplicationEventName.VARIABLE_UPSERTED,
                platformId,
                projectId,
            })
            expect(summarizeApplicationEvent(upserted)).toBe(
                'Variable SAMPLE_VARIABLE is created or updated',
            )

            const deleted = buildMockEvent({
                event: ApplicationEventName.VARIABLE_DELETED,
                platformId,
                projectId,
            })
            expect(summarizeApplicationEvent(deleted)).toBe(
                'Variable SAMPLE_VARIABLE is deleted',
            )

            const revealed = buildMockEvent({
                event: ApplicationEventName.VARIABLE_VALUE_REVEALED,
                platformId,
                projectId,
            })
            expect(summarizeApplicationEvent(revealed)).toBe(
                'Variable SAMPLE_VARIABLE value was revealed',
            )
        })

        it('summarizes user authn and registration events', () => {
            const signIn = buildMockEvent({
                event: ApplicationEventName.USER_SIGNED_IN,
                platformId,
                projectId,
            })
            signIn.userEmail = 'test@example.com'
            expect(summarizeApplicationEvent(signIn)).toBe('User test@example.com signed in')

            const reset = buildMockEvent({
                event: ApplicationEventName.USER_PASSWORD_RESET,
                platformId,
                projectId,
            })
            reset.userEmail = 'test@example.com'
            expect(summarizeApplicationEvent(reset)).toBe('User test@example.com reset password')

            const verified = buildMockEvent({
                event: ApplicationEventName.USER_EMAIL_VERIFIED,
                platformId,
                projectId,
            })
            verified.userEmail = 'test@example.com'
            expect(summarizeApplicationEvent(verified)).toBe('User test@example.com verified email')

            const signUp = buildMockEvent({
                event: ApplicationEventName.USER_SIGNED_UP,
                platformId,
                projectId,
            })
            signUp.userEmail = 'new@example.com'
            expect(summarizeApplicationEvent(signUp)).toBe(
                'User new@example.com signed up using email from credentials',
            )
        })

        it('summarizes signing keys and project roles', () => {
            const signingKey = buildMockEvent({
                event: ApplicationEventName.SIGNING_KEY_CREATED,
                platformId,
                projectId,
            })
            expect(summarizeApplicationEvent(signingKey)).toBe('Sample signing key is created')

            const roleCreated = buildMockEvent({
                event: ApplicationEventName.PROJECT_ROLE_CREATED,
                platformId,
                projectId,
            })
            expect(summarizeApplicationEvent(roleCreated)).toBe('Sample role is created')

            const roleUpdated = buildMockEvent({
                event: ApplicationEventName.PROJECT_ROLE_UPDATED,
                platformId,
                projectId,
            })
            expect(summarizeApplicationEvent(roleUpdated)).toBe('Sample role is updated')

            const roleDeleted = buildMockEvent({
                event: ApplicationEventName.PROJECT_ROLE_DELETED,
                platformId,
                projectId,
            })
            expect(summarizeApplicationEvent(roleDeleted)).toBe('Sample role is deleted')
        })
    })
})
