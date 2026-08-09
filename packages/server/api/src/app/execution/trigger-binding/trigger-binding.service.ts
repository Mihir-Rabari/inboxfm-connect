import { ActivepiecesError, apId, ErrorCode, isNil, SeekPage } from '@inboxfm-connect/core-utils'
import { scheduler } from '@inboxfm-connect/scheduler'
import {
    CreateTriggerBindingRequest,
    ExecuteTriggerResponse,
    Execution,
    PlatformId,
    ProjectId,
    TriggerBinding,
    TriggerBindingStatus,
    TriggerHookType,
    UpdateTriggerBindingRequest,
} from '@inboxfm-connect/shared'
import { databaseConnection } from '../../database/database-connection'
import { userInteractionWatcher } from '../../helper/user-interaction/user-interaction-watcher'
import { executionService } from '../execution.service'
import { TriggerBindingEntity } from './trigger-binding-entity'

const repo = databaseConnection().getRepository(TriggerBindingEntity)

export const triggerBindingService = {
    async create({ request, projectId, platformId }: CreateParams): Promise<TriggerBinding> {
        const id = apId()
        const newBinding: TriggerBinding = {
            id,
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            projectId,
            platformId,
            pieceName: request.pieceName,
            pieceVersion: request.pieceVersion,
            triggerName: request.triggerName,
            connectionId: request.connectionId ?? null,
            promptTemplate: request.promptTemplate,
            settings: request.settings,
            propertySettings: request.propertySettings,
            status: request.status ?? TriggerBindingStatus.ENABLED,
        }

        const saved = await repo.save(newBinding)

        if (saved.status === TriggerBindingStatus.ENABLED) {
            await executeEngineHook({
                binding: saved,
                hookType: TriggerHookType.ON_ENABLE,
            })
            await syncTriggerSchedule(saved)
        }

        return saved
    },

    async getOneOrThrow({ id, projectId, platformId }: GetOneParams): Promise<TriggerBinding> {
        const whereClause: Record<string, unknown> = { id }
        if (!isNil(projectId)) whereClause.projectId = projectId
        if (!isNil(platformId)) whereClause.platformId = platformId
        const binding = await repo.findOneBy(whereClause)
        if (isNil(binding)) {
            throw new ActivepiecesError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: { message: `TriggerBinding ${id} not found` },
            })
        }
        return binding
    },

    async list({ projectId, platformId }: ListParams): Promise<SeekPage<TriggerBinding>> {
        const bindings = await repo.findBy({ projectId, platformId })
        return {
            data: bindings,
            next: null,
            previous: null,
        }
    },

    async update({ id, projectId, platformId, request }: UpdateParams): Promise<TriggerBinding> {
        const existing = await triggerBindingService.getOneOrThrow({ id, projectId, platformId })
        const oldStatus = existing.status

        const updatedBinding: TriggerBinding = {
            ...existing,
            ...(request.pieceName !== undefined ? { pieceName: request.pieceName } : {}),
            ...(request.pieceVersion !== undefined ? { pieceVersion: request.pieceVersion } : {}),
            ...(request.triggerName !== undefined ? { triggerName: request.triggerName } : {}),
            ...(request.connectionId !== undefined ? { connectionId: request.connectionId } : {}),
            ...(request.promptTemplate !== undefined ? { promptTemplate: request.promptTemplate } : {}),
            ...(request.settings !== undefined ? { settings: request.settings } : {}),
            ...(request.propertySettings !== undefined ? { propertySettings: request.propertySettings } : {}),
            ...(request.status !== undefined ? { status: request.status } : {}),
            updated: new Date().toISOString(),
        }

        const saved = await repo.save(updatedBinding)

        if (oldStatus === TriggerBindingStatus.DISABLED && saved.status === TriggerBindingStatus.ENABLED) {
            await executeEngineHook({ binding: saved, hookType: TriggerHookType.ON_ENABLE })
            await syncTriggerSchedule(saved)
        }
        else if (oldStatus === TriggerBindingStatus.ENABLED && saved.status === TriggerBindingStatus.DISABLED) {
            await executeEngineHook({ binding: saved, hookType: TriggerHookType.ON_DISABLE })
            await unsyncTriggerSchedule(saved.id)
        }

        return saved
    },

    async enable({ id, projectId, platformId }: GetOneParams): Promise<TriggerBinding> {
        const binding = await triggerBindingService.getOneOrThrow({ id, projectId, platformId })
        return triggerBindingService.update({
            id,
            projectId: binding.projectId,
            platformId: binding.platformId,
            request: { status: TriggerBindingStatus.ENABLED },
        })
    },

    async disable({ id, projectId, platformId }: GetOneParams): Promise<TriggerBinding> {
        const binding = await triggerBindingService.getOneOrThrow({ id, projectId, platformId })
        return triggerBindingService.update({
            id,
            projectId: binding.projectId,
            platformId: binding.platformId,
            request: { status: TriggerBindingStatus.DISABLED },
        })
    },

    async renew({ id, projectId, platformId }: GetOneParams): Promise<ExecuteTriggerResponse<TriggerHookType.RENEW>> {
        const binding = await triggerBindingService.getOneOrThrow({ id, projectId, platformId })
        return executeEngineHook<TriggerHookType.RENEW>({
            binding,
            hookType: TriggerHookType.RENEW,
        })
    },

    async executeRun({ id, projectId, platformId, triggerPayload }: ExecuteRunParams): Promise<Execution[]> {
        const binding = await triggerBindingService.getOneOrThrow({ id, projectId, platformId })

        if (binding.status !== TriggerBindingStatus.ENABLED) {
            throw new ActivepiecesError({
                code: ErrorCode.VALIDATION,
                params: { message: `TriggerBinding ${id} is currently disabled` },
            })
        }

        const runResult = await executeEngineHook<TriggerHookType.RUN>({
            binding,
            hookType: TriggerHookType.RUN,
            triggerPayload,
        })

        const items = Array.isArray(runResult.output) ? runResult.output : (runResult.output ? [runResult.output] : [])
        const createdExecutions: Execution[] = []

        for (const item of items) {
            const execution = await executionService.create({
                prompt: binding.promptTemplate,
                metadata: {
                    triggerBindingId: binding.id,
                    pieceName: binding.pieceName,
                    triggerName: binding.triggerName,
                    item: typeof item === 'object' && item !== null ? item : { value: item },
                },
                projectId: binding.projectId,
                platformId: binding.platformId,
            })
            createdExecutions.push(execution)
        }

        return createdExecutions
    },

    async delete({ id, projectId, platformId }: GetOneParams): Promise<void> {
        const binding = await triggerBindingService.getOneOrThrow({ id, projectId, platformId })
        await unsyncTriggerSchedule(id)

        if (binding.status === TriggerBindingStatus.ENABLED) {
            try {
                await executeEngineHook({ binding, hookType: TriggerHookType.ON_DISABLE })
            }
            catch (e) {
                // Best-effort cleanup on delete
            }
        }

        await repo.delete({ id, projectId, platformId })
    },
}

async function syncTriggerSchedule(binding: TriggerBinding): Promise<void> {
    const cronExpr = typeof binding.settings?.cronExpression === 'string' ? binding.settings.cronExpression : null
    if (cronExpr) {
        await scheduler.cron({
            name: `trigger-cron-${binding.id}`,
            cronExpression: cronExpr,
            fn: async () => {
                await triggerBindingService.executeRun({ id: binding.id, projectId: binding.projectId, platformId: binding.platformId })
            },
        })
    }

    const renewCron = typeof binding.settings?.renewCronExpression === 'string' ? binding.settings.renewCronExpression : null
    if (renewCron) {
        await scheduler.cron({
            name: `trigger-renew-${binding.id}`,
            cronExpression: renewCron,
            fn: async () => {
                await triggerBindingService.renew({ id: binding.id, projectId: binding.projectId, platformId: binding.platformId })
            },
        })
    }
}

async function unsyncTriggerSchedule(id: string): Promise<void> {
    await scheduler.cancel(`trigger-cron-${id}`)
    await scheduler.cancel(`trigger-renew-${id}`)
}

async function executeEngineHook<HT extends TriggerHookType>({ binding, hookType, triggerPayload }: ExecuteEngineHookParams<HT>): Promise<ExecuteTriggerResponse<HT>> {
    const jobData = {
        jobType: 'EXECUTE_TRIGGER_HOOK' as const,
        platformId: binding.platformId,
        projectId: binding.projectId,
        schemaVersion: 1,
        triggerBindingId: binding.id,
        test: false,
        hookType,
        triggerBinding: {
            id: binding.id,
            projectId: binding.projectId,
            platformId: binding.platformId,
            pieceName: binding.pieceName,
            pieceVersion: binding.pieceVersion,
            triggerName: binding.triggerName,
            connectionId: binding.connectionId,
            promptTemplate: binding.promptTemplate,
            settings: binding.settings,
            propertySettings: binding.propertySettings,
            status: binding.status,
        },
        webhookUrl: `http://localhost:3000/v1/trigger-bindings/${binding.id}/webhook`,
        triggerPayload,
        piece: {
            pieceName: binding.pieceName,
            pieceVersion: binding.pieceVersion,
            packageType: 'REGISTRY' as const,
            pieceType: 'OFFICIAL' as const,
        },
        requestId: apId(),
        webserverId: 'inline',
    }

    return userInteractionWatcher.submitAndWaitForResponse<ExecuteTriggerResponse<HT>>(jobData, console as any)
}

type CreateParams = {
    request: CreateTriggerBindingRequest
    projectId: ProjectId
    platformId: PlatformId
}

type GetOneParams = {
    id: string
    projectId?: ProjectId
    platformId?: PlatformId
}

type ListParams = {
    projectId: ProjectId
    platformId: PlatformId
}

type UpdateParams = {
    id: string
    projectId: ProjectId
    platformId: PlatformId
    request: UpdateTriggerBindingRequest
}

type ExecuteRunParams = {
    id: string
    projectId?: ProjectId
    platformId?: PlatformId
    triggerPayload?: unknown
}

type ExecuteEngineHookParams<HT extends TriggerHookType> = {
    binding: TriggerBinding
    hookType: HT
    triggerPayload?: unknown
}
