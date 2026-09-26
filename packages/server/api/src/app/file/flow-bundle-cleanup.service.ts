import { isNil, tryCatch } from '@inboxfm-connect/core-utils'
import { FileType } from '@inboxfm-connect/shared'
import { FastifyBaseLogger } from 'fastify'
import { In } from 'typeorm'
import { fileRepo } from './file.service'
import { s3Helper } from './s3-helper'

export const flowBundleCleanupService = (log: FastifyBaseLogger) => ({
    async cleanupForProject({ projectId }: CleanupForProjectParams): Promise<FlowBundleCleanupResult> {
        return cleanupFlowBundles({
            log,
            where: { type: FileType.FLOW_BUNDLE, projectId },
            context: { project: { id: projectId } },
        })
    },
    async cleanupForPlatform({ platformId }: CleanupForPlatformParams): Promise<FlowBundleCleanupResult> {
        return cleanupFlowBundles({
            log,
            where: { type: FileType.FLOW_BUNDLE, platformId },
            context: { platform: { id: platformId } },
        })
    },
})

/**
 * Decides whether a hard-delete job should retry the flow-bundle cleanup step or give up.
 *
 * Flow bundles are only ever removed here alongside their owning project/platform row (see
 * `.agents/features/file-storage.md`), so a failed cleanup must not silently vanish: the caller
 * re-schedules itself through `systemJobsSchedule` with the returned delay up to
 * `FLOW_BUNDLE_CLEANUP_MAX_ATTEMPTS` times. Once exhausted, this logs a dead-letter error (grouped
 * under `flowBundle`, per the evlog field-schema convention) so the failure is observable instead of
 * swallowed, and the caller is expected to proceed with the parent deletion regardless — an
 * object-storage outage must not block a project/platform the owner already asked to delete forever.
 * The deterministic `project/<projectId>/FLOW_BUNDLE/<fileId>` / `platform/<platformId>/FLOW_BUNDLE/<fileId>`
 * S3 key layout (see `s3Helper#constructS3Key`) is the operator's manual remediation path once the
 * database row is gone.
 */
export function nextFlowBundleCleanupAttempt({ attempt, log, context }: NextFlowBundleCleanupAttemptParams): FlowBundleCleanupAttemptDecision {
    if (attempt >= FLOW_BUNDLE_CLEANUP_MAX_ATTEMPTS) {
        log.error({
            flowBundle: { cleanupAttempts: attempt },
            ...context,
        }, '[flowBundleCleanupService] exhausted flow bundle cleanup retries — dead-lettering; remaining FLOW_BUNDLE object-storage keys under this scope must be removed manually')
        return { action: 'dead-letter' }
    }
    return { action: 'retry', delayMs: FLOW_BUNDLE_CLEANUP_RETRY_DELAY_MS, nextAttempt: attempt + 1 }
}

async function cleanupFlowBundles({ log, where, context }: CleanupFlowBundlesParams): Promise<FlowBundleCleanupResult> {
    const files = await fileRepo().find({
        select: ['id', 's3Key'],
        where,
    })
    if (files.length === 0) {
        return { deletedCount: 0, failed: false }
    }

    const s3Keys = files.map((file) => file.s3Key).filter((s3Key): s3Key is string => !isNil(s3Key))
    const { error } = await tryCatch(() => s3Helper(log).deleteFiles(s3Keys))
    if (!isNil(error)) {
        log.error({
            flowBundle: { pendingCount: files.length },
            ...context,
            error,
        }, '[flowBundleCleanupService] failed to delete flow bundle objects from object storage; leaving database rows intact for retry')
        return { deletedCount: 0, failed: true }
    }

    const result = await fileRepo().delete({
        id: In(files.map((file) => file.id)),
        type: FileType.FLOW_BUNDLE,
    })
    const deletedCount = result.affected ?? 0
    log.info({
        flowBundle: { deletedCount },
        ...context,
    }, '[flowBundleCleanupService] deleted flow bundle artifacts')
    return { deletedCount, failed: false }
}

type CleanupForProjectParams = {
    projectId: string
}

type CleanupForPlatformParams = {
    platformId: string
}

type FlowBundleWhere =
    | { type: FileType.FLOW_BUNDLE, projectId: string }
    | { type: FileType.FLOW_BUNDLE, platformId: string }

type FlowBundleLogContext =
    | { project: { id: string } }
    | { platform: { id: string } }

type CleanupFlowBundlesParams = {
    log: FastifyBaseLogger
    where: FlowBundleWhere
    context: FlowBundleLogContext
}

type NextFlowBundleCleanupAttemptParams = {
    attempt: number
    log: FastifyBaseLogger
    context: FlowBundleLogContext
}

export type FlowBundleCleanupResult = {
    deletedCount: number
    failed: boolean
}

export type FlowBundleCleanupAttemptDecision =
    | { action: 'retry', delayMs: number, nextAttempt: number }
    | { action: 'dead-letter' }

export const FLOW_BUNDLE_CLEANUP_MAX_ATTEMPTS = 10
export const FLOW_BUNDLE_CLEANUP_RETRY_DELAY_MS = 60_000
export const ACTIVE_EXECUTION_RECHECK_DELAY_MS = 30_000
