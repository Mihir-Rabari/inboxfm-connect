import { Permission, PrincipalType, ProjectReplaceApplyRequest, ProjectStateSnapshot } from '@inboxfm-connect/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { ProjectResourceType } from '../../core/security/authorization/common'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { projectReplaceService } from './project-replace.service'

const ProjectParamsSchema = z.object({
    projectId: z.string(),
})

export const projectReplaceController: FastifyPluginAsyncZod = async (fastify) => {
    // 1. Export source project state snapshot (schema-only, zero secrets/tokens)
    fastify.get('/export', {
        schema: {
            params: ProjectParamsSchema,
        },
        config: {
            security: securityAccess.project(
                [PrincipalType.USER, PrincipalType.SERVICE],
                Permission.READ_PROJECT,
                { type: ProjectResourceType.PARAM },
            ),
        },
    }, async (request) => {
        const projectId = request.params.projectId
        const platformId = request.principal.platform.id
        return projectReplaceService(request.log).exportSnapshot({ projectId, platformId })
    })

    // 2. Generate reviewable plan artifact (preflight + deterministic diff + signing, zero writes)
    fastify.post('/plan', {
        schema: {
            params: ProjectParamsSchema,
            body: ProjectStateSnapshot,
        },
        config: {
            security: securityAccess.project(
                [PrincipalType.USER, PrincipalType.SERVICE],
                Permission.READ_PROJECT,
                { type: ProjectResourceType.PARAM },
            ),
        },
    }, async (request, reply) => {
        const projectId = request.params.projectId
        const platformId = request.principal.platform.id
        const plan = await projectReplaceService(request.log).createPlan({
            targetProjectId: projectId,
            targetPlatformId: platformId,
            snapshot: request.body,
        })
        const statusCode = plan.preflight.passed ? StatusCodes.OK : StatusCodes.BAD_REQUEST
        return reply.status(statusCode).send({
            artifactVersion: 1,
            toolVersion: plan.toolVersion,
            createdAt: plan.createdAt,
            snapshot: request.body,
            plan,
        })
    })

    // 3. Inspect-only endpoint (zero mutations, accessible with READ_PROJECT permission)
    fastify.post('/inspect', {
        schema: {
            params: ProjectParamsSchema,
            body: z.object({
                plan: ProjectReplaceApplyRequest.shape.plan,
                snapshot: ProjectStateSnapshot,
            }),
        },
        config: {
            security: securityAccess.project(
                [PrincipalType.USER, PrincipalType.SERVICE],
                Permission.READ_PROJECT,
                { type: ProjectResourceType.PARAM },
            ),
        },
    }, async (request, reply) => {
        const projectId = request.params.projectId
        const platformId = request.principal.platform.id
        const result = await projectReplaceService(request.log).applyPlan({
            targetProjectId: projectId,
            targetPlatformId: platformId,
            request: {
                plan: request.body.plan,
                snapshot: request.body.snapshot,
                dryRun: false,
                force: false,
                inspectOnly: true,
            },
            snapshot: request.body.snapshot,
        })
        return reply.status(StatusCodes.OK).send(result)
    })

    // 4. Apply reviewed plan artifact (validates signature, checks drift, applies ordered mutations)
    fastify.post('/apply', {
        schema: {
            params: ProjectParamsSchema,
            body: z.object({
                plan: ProjectReplaceApplyRequest.shape.plan,
                snapshot: ProjectStateSnapshot,
                dryRun: z.boolean().optional(),
                force: z.boolean().optional(),
                deployCustomIntegrations: z.boolean().optional(),
                inspectOnly: z.boolean().optional(),
            }),
        },
        config: {
            security: securityAccess.project(
                [PrincipalType.USER, PrincipalType.SERVICE],
                Permission.WRITE_PROJECT,
                { type: ProjectResourceType.PARAM },
            ),
        },
    }, async (request, reply) => {
        const projectId = request.params.projectId
        const platformId = request.principal.platform.id
        const result = await projectReplaceService(request.log).applyPlan({
            targetProjectId: projectId,
            targetPlatformId: platformId,
            request: {
                plan: request.body.plan,
                snapshot: request.body.snapshot,
                dryRun: request.body.dryRun,
                force: request.body.force,
                deployCustomIntegrations: request.body.deployCustomIntegrations,
                inspectOnly: request.body.inspectOnly,
            },
            snapshot: request.body.snapshot,
        })
        const statusCode = result.failed.length > 0 ? StatusCodes.MULTI_STATUS : StatusCodes.OK
        return reply.status(statusCode).send(result)
    })

    // 4. Combined replace endpoint (direct live or dry-run replace)
    fastify.post('/', {
        schema: {
            params: ProjectParamsSchema,
            body: z.object({
                snapshot: ProjectStateSnapshot,
                dryRun: z.boolean().optional(),
                force: z.boolean().optional(),
            }),
        },
        config: {
            security: securityAccess.project(
                [PrincipalType.USER, PrincipalType.SERVICE],
                Permission.WRITE_PROJECT,
                { type: ProjectResourceType.PARAM },
            ),
        },
    }, async (request, reply) => {
        const projectId = request.params.projectId
        const platformId = request.principal.platform.id
        const service = projectReplaceService(request.log)

        const plan = await service.createPlan({
            targetProjectId: projectId,
            targetPlatformId: platformId,
            snapshot: request.body.snapshot,
        })

        if (!plan.preflight.passed && !request.body.force) {
            return reply.status(StatusCodes.BAD_REQUEST).send({
                error: 'PREFLIGHT_FAILED',
                plan,
            })
        }

        if (request.body.dryRun) {
            return reply.status(StatusCodes.OK).send({
                dryRun: true,
                artifactVersion: 1,
                toolVersion: plan.toolVersion,
                createdAt: plan.createdAt,
                snapshot: request.body.snapshot,
                plan,
            })
        }

        const result = await service.applyPlan({
            targetProjectId: projectId,
            targetPlatformId: platformId,
            request: {
                plan,
                snapshot: request.body.snapshot,
                dryRun: false,
                force: request.body.force,
            },
            snapshot: request.body.snapshot,
        })

        const statusCode = result.failed.length > 0 ? StatusCodes.MULTI_STATUS : StatusCodes.OK
        return reply.status(statusCode).send(result)
    })
}
