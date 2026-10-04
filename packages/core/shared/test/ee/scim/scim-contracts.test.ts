import { describe, expect, it } from 'vitest'
import { PlatformRole } from '../../../src/lib/core/user'
import {
    CreateScimGroupRequest,
    CreateScimUserRequest,
    parseScimFilter,
    ReplaceScimGroupRequest,
    ReplaceScimUserRequest,
    SCIM_CUSTOM_USER_ATTRIBUTES_SCHEMA,
    SCIM_ERROR_SCHEMA,
    SCIM_GROUP_SCHEMA,
    SCIM_LIST_RESPONSE_SCHEMA,
    SCIM_PATCH_OP_SCHEMA,
    SCIM_RESOURCE_TYPE_SCHEMA,
    SCIM_SCHEMA_SCHEMA,
    SCIM_SERVICE_PROVIDER_CONFIG_SCHEMA,
    SCIM_USER_SCHEMA,
    ScimEmail,
    ScimError,
    ScimErrorResponse,
    ScimGroupResource,
    ScimListQueryParams,
    ScimListResponse,
    ScimName,
    ScimPatchOperation,
    ScimPatchRequest,
    ScimResourceId,
    ScimUserResource,
} from '../../../src/lib/ee/scim'

describe('SCIM Protocol Contracts and Schemas (#141)', () => {
    describe('Schema URN Constants', () => {
        it('exports official RFC 7643 / 7644 and Activepieces custom schema identifiers', () => {
            expect(SCIM_USER_SCHEMA).toBe('urn:ietf:params:scim:schemas:core:2.0:User')
            expect(SCIM_GROUP_SCHEMA).toBe('urn:ietf:params:scim:schemas:core:2.0:Group')
            expect(SCIM_LIST_RESPONSE_SCHEMA).toBe('urn:ietf:params:scim:api:messages:2.0:ListResponse')
            expect(SCIM_PATCH_OP_SCHEMA).toBe('urn:ietf:params:scim:api:messages:2.0:PatchOp')
            expect(SCIM_ERROR_SCHEMA).toBe('urn:ietf:params:scim:api:messages:2.0:Error')
            expect(SCIM_SERVICE_PROVIDER_CONFIG_SCHEMA).toBe('urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig')
            expect(SCIM_RESOURCE_TYPE_SCHEMA).toBe('urn:ietf:params:scim:schemas:core:2.0:ResourceType')
            expect(SCIM_SCHEMA_SCHEMA).toBe('urn:ietf:params:scim:schemas:core:2.0:Schema')
            expect(SCIM_CUSTOM_USER_ATTRIBUTES_SCHEMA).toBe('urn:ietf:params:scim:schemas:activepieces:1.0:CustomUserAttributes')
        })
    })

    describe('parseScimFilter helper', () => {
        it('returns undefined when filter is nil or undefined', () => {
            expect(parseScimFilter(undefined, 'userName')).toBeUndefined()
        })

        it('extracts and normalizes matched filter field value', () => {
            const filter = 'userName eq "John.Doe@example.COM"'
            const parsed = parseScimFilter(filter, 'userName')
            expect(parsed).toBe('john.doe@example.com')
        })

        it('supports case-insensitive operator and field name matching', () => {
            const filter = 'USERNAME EQ "  Admin_User@Domain.Com  "'
            const parsed = parseScimFilter(filter, 'userName')
            expect(parsed).toBe('admin_user@domain.com')
        })

        it('returns undefined when field name does not match target', () => {
            const filter = 'email eq "test@example.com"'
            const parsed = parseScimFilter(filter, 'userName')
            expect(parsed).toBeUndefined()
        })
    })

    describe('ScimError class', () => {
        it('formats structured JSON representation with SCIM error schema', () => {
            const err = new ScimError(404, 'User not found')
            expect(err.status).toBe(404)
            expect(err.detail).toBe('User not found')
            expect(err.message).toBe('User not found')

            const jsonStr = err.toString()
            const parsedJson = JSON.parse(jsonStr) as { schemas: string[], status: string, detail: string }
            expect(parsedJson.schemas).toEqual([SCIM_ERROR_SCHEMA])
            expect(parsedJson.status).toBe('404')
            expect(parsedJson.detail).toBe('User not found')
        })
    })

    describe('ScimEmail schema', () => {
        it('parses valid email object with boolean primary', () => {
            const parsed = ScimEmail.parse({
                value: 'developer@example.com',
                type: 'work',
                primary: true,
            })
            expect(parsed.value).toBe('developer@example.com')
            expect(parsed.type).toBe('work')
            expect(parsed.primary).toBe(true)
        })

        it('coerces string primary representation into boolean', () => {
            const trueCase = ScimEmail.parse({ value: 'a@example.com', primary: 'true' })
            expect(trueCase.primary).toBe(true)

            const falseCase = ScimEmail.parse({ value: 'b@example.com', primary: 'false' })
            expect(falseCase.primary).toBe(false)
        })

        it('rejects email payload missing value property', () => {
            const result = ScimEmail.safeParse({ type: 'work' })
            expect(result.success).toBe(false)
        })
    })

    describe('ScimName and ScimUserResource schemas', () => {
        it('validates ScimName with optional components', () => {
            const name = ScimName.parse({
                givenName: 'Ada',
                familyName: 'Lovelace',
                formatted: 'Ada Lovelace',
            })
            expect(name.givenName).toBe('Ada')
            expect(name.familyName).toBe('Lovelace')
        })

        it('validates full ScimUserResource with standard and custom attributes', () => {
            const rawUser = {
                schemas: [SCIM_USER_SCHEMA, SCIM_CUSTOM_USER_ATTRIBUTES_SCHEMA],
                id: 'scim_usr_01',
                externalId: 'ext_usr_01',
                userName: 'ada@example.com',
                name: { givenName: 'Ada', familyName: 'Lovelace' },
                emails: [{ value: 'ada@example.com', primary: true }],
                active: true,
                [SCIM_CUSTOM_USER_ATTRIBUTES_SCHEMA]: {
                    platformRole: PlatformRole.ADMIN,
                },
                meta: {
                    resourceType: 'User',
                    created: '2026-10-01T00:00:00.000Z',
                    lastModified: '2026-10-04T00:00:00.000Z',
                    location: 'https://api.example.com/v1/scim/Users/scim_usr_01',
                },
            }
            const parsed = ScimUserResource.parse(rawUser)
            expect(parsed.id).toBe('scim_usr_01')
            expect(parsed.userName).toBe('ada@example.com')
            expect(parsed.active).toBe(true)
            expect(parsed[SCIM_CUSTOM_USER_ATTRIBUTES_SCHEMA]?.platformRole).toBe(PlatformRole.ADMIN)
        })

        it('validates CreateScimUserRequest and ReplaceScimUserRequest', () => {
            const createRaw = {
                schemas: [SCIM_USER_SCHEMA],
                userName: 'newbie@example.com',
                active: true,
            }
            const created = CreateScimUserRequest.parse(createRaw)
            expect(created.userName).toBe('newbie@example.com')
            expect(created.active).toBe(true)

            const replaceRaw = {
                schemas: [SCIM_USER_SCHEMA],
                userName: 'replaced@example.com',
                emails: [{ value: 'replaced@example.com' }],
            }
            const replaced = ReplaceScimUserRequest.parse(replaceRaw)
            expect(replaced.userName).toBe('replaced@example.com')
            expect(replaced.emails?.[0].value).toBe('replaced@example.com')
        })
    })

    describe('ScimGroupResource schemas', () => {
        it('validates ScimGroupResource with members and metadata', () => {
            const rawGroup = {
                schemas: [SCIM_GROUP_SCHEMA],
                id: 'grp_01',
                externalId: 'ext_grp_01',
                displayName: 'Engineering',
                members: [
                    { value: 'usr_01', display: 'Ada Lovelace' },
                    { value: 'usr_02', display: 'Charles Babbage', $ref: 'https://api.example.com/v1/scim/Users/usr_02' },
                ],
                meta: {
                    resourceType: 'Group',
                },
            }
            const parsed = ScimGroupResource.parse(rawGroup)
            expect(parsed.displayName).toBe('Engineering')
            expect(parsed.members.length).toBe(2)
            expect(parsed.members[1].$ref).toBe('https://api.example.com/v1/scim/Users/usr_02')
        })

        it('validates CreateScimGroupRequest and ReplaceScimGroupRequest', () => {
            const createGroup = CreateScimGroupRequest.parse({
                schemas: [SCIM_GROUP_SCHEMA],
                displayName: 'Security Operations',
            })
            expect(createGroup.displayName).toBe('Security Operations')

            const replaceGroup = ReplaceScimGroupRequest.parse({
                schemas: [SCIM_GROUP_SCHEMA],
                displayName: 'Platform Team',
                members: [{ value: 'usr_03' }],
            })
            expect(replaceGroup.displayName).toBe('Platform Team')
            expect(replaceGroup.members?.[0].value).toBe('usr_03')
        })
    })

    describe('ScimPatchRequest and Operation schemas', () => {
        it('accepts valid operations across lower and capitalized spellings', () => {
            const validOps = ['add', 'remove', 'replace', 'Add', 'Remove', 'Replace']
            for (const op of validOps) {
                const parsed = ScimPatchOperation.parse({
                    op,
                    path: 'members',
                    value: [{ value: 'usr_10' }],
                })
                expect(parsed.op).toBe(op)
            }
        })

        it('rejects unsupported patch operations', () => {
            const result = ScimPatchOperation.safeParse({
                op: 'delete',
                path: 'members',
            })
            expect(result.success).toBe(false)
        })

        it('validates ScimPatchRequest envelope', () => {
            const request = ScimPatchRequest.parse({
                schemas: [SCIM_PATCH_OP_SCHEMA],
                Operations: [
                    { op: 'replace', path: 'active', value: false },
                ],
            })
            expect(request.Operations.length).toBe(1)
            expect(request.Operations[0].op).toBe('replace')
        })
    })

    describe('ScimListResponse, ErrorResponse, and QueryParams schemas', () => {
        it('validates ScimListResponse with pagination counters', () => {
            const response = ScimListResponse.parse({
                schemas: [SCIM_LIST_RESPONSE_SCHEMA],
                totalResults: 42,
                startIndex: 1,
                itemsPerPage: 10,
                Resources: [{ id: 'item_1' }, { id: 'item_2' }],
            })
            expect(response.totalResults).toBe(42)
            expect(response.Resources.length).toBe(2)
        })

        it('validates ScimErrorResponse', () => {
            const errResponse = ScimErrorResponse.parse({
                schemas: [SCIM_ERROR_SCHEMA],
                status: '409',
                detail: 'User already exists',
                scimType: 'uniqueness',
            })
            expect(errResponse.status).toBe('409')
            expect(errResponse.scimType).toBe('uniqueness')
        })

        it('coerces and defaults ScimListQueryParams', () => {
            const defaultParams = ScimListQueryParams.parse({})
            expect(defaultParams.startIndex).toBe(1)
            expect(defaultParams.count).toBe(100)

            const coercedParams = ScimListQueryParams.parse({
                startIndex: '11',
                count: '25',
                filter: 'userName eq "test@example.com"',
            })
            expect(coercedParams.startIndex).toBe(11)
            expect(coercedParams.count).toBe(25)
            expect(coercedParams.filter).toBe('userName eq "test@example.com"')
        })

        it('validates ScimResourceId schema', () => {
            const res = ScimResourceId.parse({ id: 'res_abc_123' })
            expect(res.id).toBe('res_abc_123')
        })
    })
})
