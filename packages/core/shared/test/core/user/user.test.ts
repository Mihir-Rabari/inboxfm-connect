import { apId } from '@inboxfm-connect/core-utils'
import { describe, expect, it } from 'vitest'
import {
    AP_MAXIMUM_PROFILE_PICTURE_SIZE,
    EmailType,
    PasswordType,
    PlatformRole,
    PROFILE_PICTURE_ALLOWED_TYPES,
    UpdateMeRequestBody,
    UpdateMeResponse,
    User,
    UserStatus,
    UserWithMetaInformation,
} from '../../../src/lib/core/user/user'

describe('User Contracts and Schemas', () => {
    describe('PlatformRole and UserStatus Enums', () => {
        it('defines expected PlatformRole values', () => {
            expect(PlatformRole.ADMIN).toBe('ADMIN')
            expect(PlatformRole.MEMBER).toBe('MEMBER')
            expect(PlatformRole.OPERATOR).toBe('OPERATOR')
        })

        it('defines expected UserStatus values', () => {
            expect(UserStatus.ACTIVE).toBe('ACTIVE')
            expect(UserStatus.INACTIVE).toBe('INACTIVE')
        })
    })

    describe('EmailType and PasswordType schemas', () => {
        it('validates standard email formats and rejects invalid emails', () => {
            expect(EmailType.parse('user@example.com')).toBe('user@example.com')
            expect(EmailType.parse('admin.ops+staging@domain.co.uk')).toBe('admin.ops+staging@domain.co.uk')
            expect(() => EmailType.parse('not-an-email')).toThrow()
            expect(() => EmailType.parse('@missing-user.com')).toThrow()
        })

        it('validates password length bounds (8 to 64 chars)', () => {
            expect(PasswordType.parse('12345678')).toBe('12345678')
            expect(PasswordType.parse('A'.repeat(64))).toBe('A'.repeat(64))
            expect(() => PasswordType.parse('short')).toThrow()
            expect(() => PasswordType.parse('A'.repeat(65))).toThrow()
        })
    })

    describe('User model schema', () => {
        const validUserModel = {
            id: apId(),
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            platformRole: PlatformRole.ADMIN,
            status: UserStatus.ACTIVE,
            identityId: apId(),
            externalId: null,
            platformId: apId(),
            lastActiveDate: new Date().toISOString(),
        }

        it('validates complete User model with platformId and lastActiveDate', () => {
            const parsed = User.parse(validUserModel)
            expect(parsed.platformRole).toBe(PlatformRole.ADMIN)
            expect(parsed.status).toBe(UserStatus.ACTIVE)
            expect(parsed.externalId).toBeNull()
        })

        it('validates User model with null platformId and lastActiveDate', () => {
            const parsed = User.parse({
                ...validUserModel,
                platformId: null,
                lastActiveDate: null,
            })
            expect(parsed.platformId).toBeNull()
            expect(parsed.lastActiveDate).toBeNull()
        })

        it('rejects User model missing required identityId', () => {
            const invalid = { ...validUserModel }
            delete (invalid as Record<string, unknown>).identityId
            expect(() => User.parse(invalid)).toThrow()
        })
    })

    describe('UserWithMetaInformation schema', () => {
        it('validates projected user with full metadata', () => {
            const now = new Date().toISOString()
            const meta = {
                id: apId(),
                email: 'lead@inboxfm.com',
                firstName: 'Jane',
                lastName: 'Doe',
                status: UserStatus.ACTIVE,
                externalId: 'ext_999',
                platformId: apId(),
                platformRole: PlatformRole.MEMBER,
                created: now,
                updated: now,
                lastActiveDate: now,
                imageUrl: 'https://cdn.example.com/avatars/jane.png',
            }
            const parsed = UserWithMetaInformation.parse(meta)
            expect(parsed.email).toBe('lead@inboxfm.com')
            expect(parsed.firstName).toBe('Jane')
            expect(parsed.imageUrl).toBe('https://cdn.example.com/avatars/jane.png')
        })

        it('allows null for imageUrl and externalId', () => {
            const now = new Date().toISOString()
            const meta = {
                id: apId(),
                email: 'lead@inboxfm.com',
                firstName: 'Jane',
                lastName: 'Doe',
                status: UserStatus.ACTIVE,
                externalId: null,
                platformId: null,
                platformRole: PlatformRole.MEMBER,
                created: now,
                updated: now,
                lastActiveDate: null,
                imageUrl: null,
            }
            const parsed = UserWithMetaInformation.parse(meta)
            expect(parsed.imageUrl).toBeNull()
            expect(parsed.externalId).toBeNull()
        })
    })

    describe('Profile picture constraints and UpdateMe DTOs', () => {
        it('defines expected profile picture limits and MIME types', () => {
            expect(AP_MAXIMUM_PROFILE_PICTURE_SIZE).toBe(5 * 1024 * 1024)
            expect(PROFILE_PICTURE_ALLOWED_TYPES).toEqual([
                'image/jpeg',
                'image/png',
                'image/gif',
                'image/webp',
            ])
        })

        it('validates UpdateMeRequestBody with and without profilePicture', () => {
            expect(UpdateMeRequestBody.parse({})).toEqual({})
            expect(UpdateMeRequestBody.parse({ profilePicture: 'binary_data' })).toEqual({
                profilePicture: 'binary_data',
            })
        })

        it('validates UpdateMeResponse', () => {
            const res = {
                email: 'alex@example.com',
                firstName: 'Alex',
                lastName: 'Smith',
                trackEvents: true,
                newsLetter: false,
                imageUrl: null,
            }
            const parsed = UpdateMeResponse.parse(res)
            expect(parsed.email).toBe('alex@example.com')
            expect(parsed.trackEvents).toBe(true)
            expect(parsed.newsLetter).toBe(false)
            expect(parsed.imageUrl).toBeNull()
        })
    })
})
