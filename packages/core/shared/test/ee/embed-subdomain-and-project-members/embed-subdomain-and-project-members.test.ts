import { apId, RoleType } from '@inboxfm-connect/core-utils'
import { describe, expect, it } from 'vitest'
import {
    EmbedSubdomain,
    EmbedSubdomainStatus,
    EmbedVerificationRecord,
    EmbedVerificationRecordPurpose,
    EmbedVerificationRecordType,
    GenerateEmbedSubdomainRequest,
} from '../../../src/lib/ee/embed-subdomain'
import { ListOAuth2AppRequest, OAuthApp, UpsertOAuth2AppRequest } from '../../../src/lib/ee/oauth-apps'
import { ProjectMember } from '../../../src/lib/ee/project-members/project-member'
import {
    AcceptInvitationRequest,
    GetCurrentProjectMemberRoleQuery,
    ListProjectMembersRequestQuery,
    UpdateProjectMemberRoleRequestBody,
} from '../../../src/lib/ee/project-members/project-member-request'
import {
    CreateProjectRoleRequestBody,
    ListProjectMembersForProjectRoleRequestQuery,
    UpdateProjectRoleRequestBody,
} from '../../../src/lib/management/project-role/project-role.request'

describe('Embed Subdomain, Project Members, and RBAC Contracts (#141)', () => {
    describe('Embed Subdomain Contracts', () => {
        describe('Enums', () => {
            it('defines valid EmbedSubdomainStatus values', () => {
                expect(EmbedSubdomainStatus.PENDING_VERIFICATION).toBe('PENDING_VERIFICATION')
                expect(EmbedSubdomainStatus.ACTIVE).toBe('ACTIVE')
                expect(EmbedSubdomainStatus.FAILED).toBe('FAILED')
            })

            it('defines valid EmbedVerificationRecordType and Purpose values', () => {
                expect(EmbedVerificationRecordType.CNAME).toBe('CNAME')
                expect(EmbedVerificationRecordType.TXT).toBe('TXT')

                expect(EmbedVerificationRecordPurpose.HOSTNAME).toBe('HOSTNAME')
                expect(EmbedVerificationRecordPurpose.OWNERSHIP).toBe('OWNERSHIP')
                expect(EmbedVerificationRecordPurpose.SSL).toBe('SSL')
            })
        })

        describe('EmbedVerificationRecord and EmbedSubdomain schemas', () => {
            it('parses valid verification records', () => {
                const record = EmbedVerificationRecord.parse({
                    type: EmbedVerificationRecordType.CNAME,
                    name: '_acme-challenge.app.example.com',
                    value: 'cf-verify.cloudflare.com',
                    purpose: EmbedVerificationRecordPurpose.SSL,
                })
                expect(record.type).toBe('CNAME')
                expect(record.purpose).toBe('SSL')
            })

            it('parses full EmbedSubdomain entity', () => {
                const raw = {
                    id: apId(),
                    created: '2026-10-01T00:00:00.000Z',
                    updated: '2026-10-01T00:00:00.000Z',
                    platformId: 'plat-123',
                    hostname: 'connect.saas-platform.com',
                    status: EmbedSubdomainStatus.ACTIVE,
                    cloudflareId: 'cf-subdomain-zone-id',
                    verificationRecords: [
                        {
                            type: EmbedVerificationRecordType.CNAME,
                            name: 'connect.saas-platform.com',
                            value: 'proxy.inboxfm.io',
                            purpose: EmbedVerificationRecordPurpose.HOSTNAME,
                        },
                    ],
                }
                const parsed = EmbedSubdomain.parse(raw)
                expect(parsed.hostname).toBe('connect.saas-platform.com')
                expect(parsed.status).toBe('ACTIVE')
                expect(parsed.verificationRecords).toHaveLength(1)
            })
        })

        describe('GenerateEmbedSubdomainRequest schema & hostname validation', () => {
            it('accepts valid lowercase dotted hostnames', () => {
                const validHostnames = [
                    'connect.example.com',
                    'app.sub.domain.org',
                    'auth.customer-portal.io',
                ]
                for (const hostname of validHostnames) {
                    const result = GenerateEmbedSubdomainRequest.safeParse({ hostname })
                    expect(result.success).toBe(true)
                }
            })

            it('rejects uppercase hostnames', () => {
                const result = GenerateEmbedSubdomainRequest.safeParse({ hostname: 'Connect.Example.com' })
                expect(result.success).toBe(false)
            })

            it('rejects single-label hostnames without dots', () => {
                const result = GenerateEmbedSubdomainRequest.safeParse({ hostname: 'localhost' })
                expect(result.success).toBe(false)
            })

            it('rejects hostnames shorter than 4 characters', () => {
                const result = GenerateEmbedSubdomainRequest.safeParse({ hostname: 'a.b' })
                expect(result.success).toBe(false)
            })
        })
    })

    describe('OAuth Apps Contracts', () => {
        it('parses OAuthApp entity', () => {
            const raw = {
                id: apId(),
                created: '2026-10-01T00:00:00.000Z',
                updated: '2026-10-01T00:00:00.000Z',
                pieceName: '@inboxfm-connect/piece-slack',
                platformId: 'plat-123',
                clientId: 'slack-client-id-abc',
            }
            const parsed = OAuthApp.parse(raw)
            expect(parsed.pieceName).toBe('@inboxfm-connect/piece-slack')
            expect(parsed.clientId).toBe('slack-client-id-abc')
        })

        it('parses UpsertOAuth2AppRequest', () => {
            const parsed = UpsertOAuth2AppRequest.parse({
                pieceName: '@inboxfm-connect/piece-google-sheets',
                clientId: 'client-id-xyz',
                clientSecret: 'secret-xyz',
            })
            expect(parsed.clientSecret).toBe('secret-xyz')
        })

        it('parses ListOAuth2AppRequest with coercion', () => {
            const parsed = ListOAuth2AppRequest.parse({
                limit: '20',
                cursor: 'cursor-123',
            })
            expect(parsed.limit).toBe(20)
        })
    })

    describe('Project Members and Roles Contracts', () => {
        describe('ProjectMember schema', () => {
            it('parses ProjectMember entity with ApId fields', () => {
                const raw = {
                    id: apId(),
                    created: '2026-10-01T00:00:00.000Z',
                    updated: '2026-10-01T00:00:00.000Z',
                    platformId: apId(),
                    userId: apId(),
                    projectId: 'proj-xyz',
                    projectRoleId: apId(),
                }
                const parsed = ProjectMember.parse(raw)
                expect(parsed.projectId).toBe('proj-xyz')
            })
        })

        describe('Project Member Requests', () => {
            it('parses AcceptInvitationRequest', () => {
                const parsed = AcceptInvitationRequest.parse({ token: 'invite-jwt-token' })
                expect(parsed.token).toBe('invite-jwt-token')
            })

            it('parses ListProjectMembersRequestQuery with coercion', () => {
                const parsed = ListProjectMembersRequestQuery.parse({
                    projectId: 'proj-123',
                    limit: '50',
                })
                expect(parsed.projectId).toBe('proj-123')
                expect(parsed.limit).toBe(50)
            })

            it('parses UpdateProjectMemberRoleRequestBody', () => {
                const parsed = UpdateProjectMemberRoleRequestBody.parse({ role: 'ADMIN' })
                expect(parsed.role).toBe('ADMIN')
            })

            it('parses GetCurrentProjectMemberRoleQuery', () => {
                const parsed = GetCurrentProjectMemberRoleQuery.parse({ projectId: 'proj-456' })
                expect(parsed.projectId).toBe('proj-456')
            })
        })

        describe('Project Roles Request Schemas', () => {
            it('parses CreateProjectRoleRequestBody with safe name regex and RoleType', () => {
                const parsed = CreateProjectRoleRequestBody.parse({
                    name: 'Workflow_Developer',
                    permissions: ['READ_FLOW', 'WRITE_FLOW'],
                    type: RoleType.CUSTOM,
                })
                expect(parsed.name).toBe('Workflow_Developer')
                expect(parsed.type).toBe('CUSTOM')
                expect(parsed.permissions).toHaveLength(2)
            })

            it('rejects unsafe characters (slashes, dots) in role name', () => {
                const resultWithSlash = CreateProjectRoleRequestBody.safeParse({
                    name: 'Admin/Role',
                    permissions: [],
                    type: RoleType.CUSTOM,
                })
                expect(resultWithSlash.success).toBe(false)

                const resultWithDot = CreateProjectRoleRequestBody.safeParse({
                    name: 'Admin.Role',
                    permissions: [],
                    type: RoleType.CUSTOM,
                })
                expect(resultWithDot.success).toBe(false)
            })

            it('parses UpdateProjectRoleRequestBody', () => {
                const parsed = UpdateProjectRoleRequestBody.parse({
                    name: 'Senior_Editor',
                    permissions: ['READ_FLOW'],
                })
                expect(parsed.name).toBe('Senior_Editor')
            })

            it('parses ListProjectMembersForProjectRoleRequestQuery', () => {
                const parsed = ListProjectMembersForProjectRoleRequestQuery.parse({
                    limit: '10',
                    cursor: 'cur-role-1',
                })
                expect(parsed.limit).toBe(10)
            })
        })
    })
})
