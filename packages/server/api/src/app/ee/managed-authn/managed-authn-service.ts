import { createHash } from 'crypto'
import { ActivepiecesError, ErrorCode, isNil } from '@inboxfm-connect/core-utils'
import { cryptoUtils } from '@inboxfm-connect/server-utils'
import { AuthenticationResponse, PiecesFilterType, PlatformRole, PrincipalType, Project, ProjectType, User, UserIdentity, UserIdentityProvider } from '@inboxfm-connect/shared'
import { FastifyBaseLogger } from 'fastify'
import { accessTokenManager } from '../../authentication/lib/access-token-manager'
import { userIdentityService } from '../../authentication/user-identity/user-identity-service'
import { distributedLock } from '../../database/redis-connections'
import { pieceTagService } from '../../pieces/tags/pieces/piece-tag.service'
import { platformService } from '../../platform/platform.service'
import { projectService } from '../../project/project-service'
import { userService } from '../../user/user-service'
import { concurrencyPoolService } from '../platform/concurrency-pool/concurrency-pool.service'
import { projectMemberService } from '../projects/project-members/project-member.service'
import { projectLimitsService } from '../projects/project-plan/project-plan.service'
import { externalTokenExtractor } from './lib/external-token-extractor'

export const managedAuthnService = (log: FastifyBaseLogger) => ({
    async externalToken({
        externalAccessToken,
    }: AuthenticateParams): Promise<AuthenticationResponse> {
        const externalPrincipal = await externalTokenExtractor(log).extract(
            externalAccessToken,
        )

        const { project } = await getOrCreateProject({
            platformId: externalPrincipal.platformId,
            externalProjectId: externalPrincipal.externalProjectId,
        }, log)

        if (!isNil(externalPrincipal.projectDisplayName)) {
            await projectService(log).update(project.id, {
                type: project.type,
                displayName: externalPrincipal.projectDisplayName,
            })
        }

        if (!isNil(externalPrincipal.concurrencyPoolKey) && !isNil(externalPrincipal.concurrencyPoolLimit)) {
            const { poolId } = await concurrencyPoolService(log).upsertPool({
                platformId: externalPrincipal.platformId,
                key: externalPrincipal.concurrencyPoolKey,
                maxConcurrentJobs: externalPrincipal.concurrencyPoolLimit,
            })
            await projectService(log).update(project.id, { type: project.type, poolId })
            await concurrencyPoolService(log).assignProject({ projectId: project.id, poolId })
        }

        await updateProjectLimits({
            platformId: project.platformId,
            projectId: project.id,
            piecesTags: externalPrincipal.pieces.tags,
            piecesFilterType: externalPrincipal.pieces.filterType,
            log,
        })

        const user = await getOrCreateUser(externalPrincipal, log)

        await projectMemberService(log).upsert({
            projectId: project.id,
            userId: user.id,
            projectRoleName: externalPrincipal.projectRole,
        })

        const identity = await userIdentityService(log).getOneOrFail({
            id: user.identityId,
        })

        const token = await accessTokenManager(log).generateToken({
            id: user.id,
            type: PrincipalType.USER,
            platform: {
                id: externalPrincipal.platformId,
            },
            tokenVersion: identity.tokenVersion,
        }, 7 * 24 * 60 * 60)
        return {
            id: user.id,
            platformRole: user.platformRole,
            status: user.status,
            externalId: user.externalId,
            platformId: user.platformId,
            firstName: identity.firstName,
            lastName: identity.lastName,
            email: identity.email,
            trackEvents: identity.trackEvents,
            newsLetter: identity.newsLetter,
            verified: identity.verified,
            token,
            projectId: project.id,
        }
    },
})

type UpdateProjectLimitsParams =
    {
        platformId: string
        projectId: string
        piecesTags: string[]
        piecesFilterType: PiecesFilterType
        log: FastifyBaseLogger
    }

const updateProjectLimits = async ({ platformId, projectId, piecesTags, piecesFilterType, log }: UpdateProjectLimitsParams): Promise<void> => {
    const pieces = await getPiecesList({
        platformId,
        projectId,
        piecesTags,
        piecesFilterType,
    })
    await projectLimitsService(log).upsert({
        nickname: 'default-embeddings-limit',
        pieces,
        piecesFilterType,
    }, projectId)
}

function isUniqueConstraintViolation(error: unknown): boolean {
    // Postgres unique-violation driver code (SQLSTATE 23505), gated on the driver
    // code exactly as the approved #460/#466 helpers do: the two drivers pinned in this
    // repo (pg 8.11.3, @electric-sql/pglite 0.3.14) do not surface the code on the same
    // property, so match both the top-level error and the wrapped driverError. Any other
    // failure must propagate raw rather than be mistaken for a lost race.
    const candidate = error as { code?: string, driverError?: { code?: string } } | null | undefined
    return candidate?.code === '23505' || candidate?.driverError?.code === '23505'
}

// Serializes a get-or-create on its natural key so the loser's lookup happens strictly
// after the winner's commit. Fail-open on lock unavailability so a Redis outage cannot
// block sign-in - `converge` then absorbs the unique violation the interleaving causes.
// Same shape as the merged #466 helper.
async function runGetOrCreateExclusiveOrWithoutLock<T>({ key, fn, converge, log }: {
    key: string
    fn: () => Promise<T>
    converge: () => Promise<T>
    log: FastifyBaseLogger
}): Promise<T> {
    let fnSettled = false
    try {
        return await distributedLock(log).runExclusive({
            key,
            timeoutInSeconds: 60,
            fn: async () => {
                try {
                    return await fn()
                }
                finally {
                    // Settled on EVERY exit path, not just the throw path: a lock-infra
                    // error surfacing after a successful fn must not take the fail-open
                    // branch and run the get-or-create a second time.
                    fnSettled = true
                }
            },
        })
    }
    catch (error) {
        if (fnSettled) {
            // fn already ran. A unique violation here means the lock failed open and a
            // concurrent request won the insert - converge on that row. Anything else
            // is a real failure and must propagate.
            if (isUniqueConstraintViolation(error)) {
                return converge()
            }
            throw error
        }
        log.warn({ error, lockKey: key }, 'Managed authn get-or-create lock unavailable - failing open')
        try {
            return await fn()
        }
        catch (error) {
            if (isUniqueConstraintViolation(error)) {
                return converge()
            }
            throw error
        }
    }
}

const getOrCreateUser = async (
    params: GetOrCreateUserParams,
    log: FastifyBaseLogger,
): Promise<User> => {
    const findUser = async (): Promise<User> => {
        const existingUser = await userService(log).getByPlatformAndExternalId({
            platformId: params.platformId,
            externalId: params.externalUserId,
        })
        if (!isNil(existingUser)) {
            return existingUser
        }
        const identity = await getOrCreateUserIdentity(params, log)
        return userService(log).create({
            externalId: params.externalUserId,
            platformId: params.platformId,
            identityId: identity.id,
            platformRole: PlatformRole.MEMBER,
        })
    }

    // idx_user_platform_id_external_id is unique, so a concurrent first sign-in
    // inserting the same external user loses the insert. Converge on its row instead
    // of failing the sign-in with a raw driver error.
    const converge = async (): Promise<User> => {
        const winner = await userService(log).getByPlatformAndExternalId({
            platformId: params.platformId,
            externalId: params.externalUserId,
        })
        if (isNil(winner)) {
            throw new ActivepiecesError({
                code: ErrorCode.VALIDATION,
                params: { message: 'User insert lost a unique-violation race but no row could be read back' },
            })
        }
        return winner
    }

    return runGetOrCreateExclusiveOrWithoutLock({
        key: ['managed-authn', 'user', params.platformId, params.externalUserId].join(':'),
        fn: findUser,
        converge,
        log,
    })
}

const getOrCreateUserIdentity = async (
    params: GetOrCreateUserParams,
    log: FastifyBaseLogger,
): Promise<UserIdentity> => {
    const cleanedEmail = generateEmailHash(params)

    const findOrCreateIdentity = async (): Promise<UserIdentity> => {
        const existingIdentity = await userIdentityService(log).getIdentityByEmail(cleanedEmail)
        if (!isNil(existingIdentity)) {
            return existingIdentity
        }
        return userIdentityService(log).create({
            email: cleanedEmail,
            password: await cryptoUtils.generateRandomPassword(),
            firstName: params.externalFirstName,
            lastName: params.externalLastName,
            trackEvents: true,
            newsLetter: false,
            provider: UserIdentityProvider.JWT,
            verified: true,
        })
    }

    // idx_user_identity_email is unique. For managed JWT the email is a deterministic
    // hash of (platformId, externalUserId), so this really is the same person's
    // identity - losing this insert means asserting an account already exists for an
    // email that did not exist a moment ago. EXISTING_USER is the same "lost the race"
    // signal as 23505 on this leg, so converge on the winner's row.
    const converge = async (): Promise<UserIdentity> => {
        const winner = await userIdentityService(log).getIdentityByEmail(cleanedEmail)
        if (isNil(winner)) {
            throw new ActivepiecesError({
                code: ErrorCode.VALIDATION,
                params: { message: 'Identity insert lost a race but no row could be read back' },
            })
        }
        return winner
    }

    try {
        return await runGetOrCreateExclusiveOrWithoutLock({
            key: ['managed-authn', 'identity', cleanedEmail].join(':'),
            fn: findOrCreateIdentity,
            converge,
            log,
        })
    }
    catch (error) {
        if (error instanceof ActivepiecesError && error.error.code === ErrorCode.EXISTING_USER) {
            return converge()
        }
        throw error
    }
}
const getOrCreateProject = async ({
    platformId,
    externalProjectId,
}: GetOrCreateProjectParams, log: FastifyBaseLogger): Promise<{ project: Project, isNewProject: boolean }> => {
    const findOrCreateProject = async (): Promise<{ project: Project, isNewProject: boolean }> => {
        const existingProject = await projectService(log).getByPlatformIdAndExternalId({
            platformId,
            externalId: externalProjectId,
        })

        if (!isNil(existingProject)) {
            return { project: existingProject, isNewProject: false }
        }

        const platform = await platformService(log).getOneOrThrow(platformId)

        const project = await projectService(log).create({
            displayName: externalProjectId,
            ownerId: platform.ownerId,
            platformId,
            externalId: externalProjectId,
            type: ProjectType.TEAM,
        })

        return { project, isNewProject: true }
    }

    // idx_project_platform_id_external_id is unique. A loser converging on the winner's
    // project must report isNewProject: false so the follow-on projectMember/limits
    // upserts are not replayed as if this request were the creator.
    const converge = async (): Promise<{ project: Project, isNewProject: boolean }> => {
        const winner = await projectService(log).getByPlatformIdAndExternalId({
            platformId,
            externalId: externalProjectId,
        })
        if (isNil(winner)) {
            throw new ActivepiecesError({
                code: ErrorCode.VALIDATION,
                params: { message: 'Project insert lost a unique-violation race but no row could be read back' },
            })
        }
        return { project: winner, isNewProject: false }
    }

    return runGetOrCreateExclusiveOrWithoutLock({
        key: ['managed-authn', 'project', platformId, externalProjectId].join(':'),
        fn: findOrCreateProject,
        converge,
        log,
    })
}

const getPiecesList = async ({
    piecesFilterType,
    piecesTags,
    platformId,
}: UpdateProjectLimits): Promise<string[]> => {
    switch (piecesFilterType) {
        case PiecesFilterType.ALLOWED: {
            return pieceTagService.findByPlatformAndTags(
                platformId,
                piecesTags,
            )
        }
        case PiecesFilterType.NONE: {
            return []
        }
    }
}

function generateEmailHash(params: { platformId: string, externalUserId: string }): string {
    const inputString = `managed_${params.platformId}_${params.externalUserId}`
    return cleanEmailOtherwiseCompareFails(createHash('sha256').update(inputString).digest('hex'))
}

function cleanEmailOtherwiseCompareFails(email: string): string {
    return email.trim().toLowerCase()
}

type AuthenticateParams = {
    externalAccessToken: string
}

type GetOrCreateUserParams = {
    platformId: string
    externalUserId: string
    externalProjectId: string
    externalFirstName: string
    externalLastName: string
}

type GetOrCreateProjectParams = {
    platformId: string
    externalProjectId: string
}

type UpdateProjectLimits = {
    platformId: string
    projectId: string
    piecesTags: string[]
    piecesFilterType: PiecesFilterType
}
