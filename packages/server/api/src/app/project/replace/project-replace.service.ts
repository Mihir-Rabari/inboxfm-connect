import crypto from 'crypto'
import { apId } from '@inboxfm-connect/core-utils'
import { apVersionUtil } from '@inboxfm-connect/server-utils'
import {
    Field,
    FieldType,
    PreflightError,
    ProjectReplaceApplyRequest,
    ProjectReplaceApplyResult,
    ProjectReplaceDiffItem,
    ProjectReplacePlan,
    ProjectReplaceResourceKind,
    ProjectStateSnapshot,
    ScheduledTaskStatus,
    Table,
    TableAutomationStatus,
    TableAutomationTrigger,
    TriggerBindingStatus,
} from '@inboxfm-connect/shared'
import { FastifyBaseLogger } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import semver from 'semver'
import { ConnectionEntity } from '../../app-connection/app-connection.entity'
import { repoFactory } from '../../core/db/repo-factory'
import { ScheduledTaskEntity } from '../../execution/scheduled-task/scheduled-task-entity'
import { scheduledTaskService } from '../../execution/scheduled-task/scheduled-task.service'
import { TriggerBindingEntity } from '../../execution/trigger-binding/trigger-binding-entity'
import { triggerBindingService } from '../../execution/trigger-binding/trigger-binding.service'
import { system } from '../../helper/system/system'
import { AppSystemProp } from '../../helper/system/system-props'
import { mcpServerService } from '../../mcp/mcp-service'
import { pieceMetadataService } from '../../pieces/metadata/piece-metadata-service'
import { fieldService } from '../../tables/field/field.service'
import { TableEntity } from '../../tables/table/table.entity'
import { tableService } from '../../tables/table/table.service'

const tableRepo = repoFactory(TableEntity)
const triggerBindingRepo = repoFactory(TriggerBindingEntity)
const scheduledTaskRepo = repoFactory(ScheduledTaskEntity)
const connectionRepo = repoFactory(ConnectionEntity)

function getSigningSecret(): string {
    return system.get(AppSystemProp.JWT_SECRET) ?? system.get(AppSystemProp.ENCRYPTION_KEY) ?? 'inboxfm-default-secret'
}

function canonicalJson(obj: unknown): string {
    if (obj === null || typeof obj !== 'object') {
        return JSON.stringify(obj)
    }
    if (Array.isArray(obj)) {
        return '[' + obj.map(canonicalJson).join(',') + ']'
    }
    const keys = Object.keys(obj as Record<string, unknown>).sort()
    const entries = keys.map((key) => `${JSON.stringify(key)}:${canonicalJson((obj as Record<string, unknown>)[key])}`)
    return '{' + entries.join(',') + '}'
}

function computeSha256(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex')
}

function computePlanSignature(planId: string, checksum: string, destinationStateHash: string): string {
    const secret = getSigningSecret()
    return crypto.createHmac('sha256', secret).update(`${planId}:${checksum}:${destinationStateHash}`).digest('hex')
}

export const projectReplaceService = (log: FastifyBaseLogger) => ({
    async exportSnapshot({ projectId, platformId }: { projectId: string, platformId: string }): Promise<ProjectStateSnapshot> {
        const currentVersion = apVersionUtil.getCurrentRelease()

        // 1. Tables (schema only, zero records)
        const tables = await tableRepo().find({ where: { projectId } })
        const tablesSnapshot = []
        for (const tbl of tables) {
            const fields: Field[] = await fieldService.getAll({ projectId, tableId: tbl.id })
            tablesSnapshot.push({
                name: tbl.name,
                externalId: tbl.externalId ?? tbl.id,
                fields: fields.map((f: Field) => ({
                    name: f.name,
                    type: f.type,
                    externalId: f.externalId ?? f.id,
                })),
                status: tbl.status ?? null,
                trigger: tbl.trigger ?? null,
            })
        }

        // 2. Trigger bindings
        const triggerBindings = await triggerBindingRepo().find({ where: { projectId } })
        const triggerBindingsSnapshot = []
        const requiredPiecesMap = new Map<string, string>()
        const requiredConnectionsMap = new Map<string, string>()

        for (const tb of triggerBindings) {
            requiredPiecesMap.set(tb.pieceName, tb.pieceVersion)
            let connExternalId: string | null = null
            if (tb.connectionId) {
                const conn = await connectionRepo().findOneBy({ id: tb.connectionId })
                if (conn && conn.externalId) {
                    connExternalId = conn.externalId
                    requiredConnectionsMap.set(conn.externalId, conn.pieceName)
                }
            }

            triggerBindingsSnapshot.push({
                externalId: tb.id,
                pieceName: tb.pieceName,
                pieceVersion: tb.pieceVersion,
                triggerName: tb.triggerName,
                promptTemplate: tb.promptTemplate,
                connectionExternalId: connExternalId,
                settings: (tb.settings as Record<string, unknown>) ?? {},
                propertySettings: (tb.propertySettings as Record<string, unknown>) ?? null,
                status: tb.status,
            })
        }

        // 3. Scheduled tasks
        const scheduledTasks = await scheduledTaskRepo().find({ where: { projectId } })
        const scheduledTasksSnapshot = scheduledTasks.map((st) => ({
            externalId: st.id,
            prompt: st.prompt,
            cronExpression: st.cronExpression,
            timezone: st.timezone,
            status: st.status,
        }))

        // 4. MCP server (disabledTools only, NO live bearer tokens!)
        const mcpServer = await mcpServerService(log).getByProjectId(projectId)
        const mcpSnapshot = {
            disabledTools: mcpServer?.disabledTools ?? [],
        }

        const requiredPieces = Array.from(requiredPiecesMap.entries()).map(([name, version]) => ({
            name,
            version,
        }))

        const requiredConnections = Array.from(requiredConnectionsMap.entries()).map(([externalId, pieceName]) => ({
            externalId,
            pieceName,
        }))

        return {
            schemaVersion: 1,
            sourceActivepiecesVersion: currentVersion,
            exportedAt: new Date().toISOString(),
            sourceEnvironment: {
                platformId,
                projectId,
            },
            tables: tablesSnapshot,
            triggerBindings: triggerBindingsSnapshot,
            scheduledTasks: scheduledTasksSnapshot,
            mcp: mcpSnapshot,
            requiredPieces,
            requiredConnections,
        }
    },

    async computeDestinationStateHash(projectId: string): Promise<string> {
        const tables = await tableRepo().find({ where: { projectId } })
        const triggerBindings = await triggerBindingRepo().find({ where: { projectId } })
        const scheduledTasks = await scheduledTaskRepo().find({ where: { projectId } })
        const mcpServer = await mcpServerService(log).getByProjectId(projectId)

        const normalized = {
            tables: tables.map((t) => ({ name: t.name, externalId: t.externalId, status: t.status, trigger: t.trigger })).sort((a, b) => (a.externalId || '').localeCompare(b.externalId || '')),
            triggerBindings: triggerBindings.map((tb) => ({ pieceName: tb.pieceName, triggerName: tb.triggerName, status: tb.status })).sort((a, b) => (a.pieceName + a.triggerName).localeCompare(b.pieceName + b.triggerName)),
            scheduledTasks: scheduledTasks.map((st) => ({ prompt: st.prompt, cronExpression: st.cronExpression, status: st.status })).sort((a, b) => (a.prompt + a.cronExpression).localeCompare(b.prompt + b.cronExpression)),
            mcp: { disabledTools: [...(mcpServer?.disabledTools ?? [])].sort() },
        }

        return computeSha256(canonicalJson(normalized))
    },

    async createPlan({
        targetProjectId,
        targetPlatformId,
        snapshot,
    }: {
        targetProjectId: string
        targetPlatformId: string
        snapshot: ProjectStateSnapshot
    }): Promise<ProjectReplacePlan> {
        const currentVersion = apVersionUtil.getCurrentRelease()
        const preflightErrors: PreflightError[] = []

        // 1. Preflight: Version skew
        const sourceMajor = semver.major(snapshot.sourceActivepiecesVersion)
        const targetMajor = semver.major(currentVersion)
        if (sourceMajor > targetMajor) {
            preflightErrors.push({
                kind: 'VERSION_SKEW',
                message: `Source major version (${snapshot.sourceActivepiecesVersion}) is newer than destination (${currentVersion}).`,
            })
        }

        // 2. Preflight: Required pieces
        for (const reqPiece of snapshot.requiredPieces) {
            try {
                await pieceMetadataService(log).getOrThrow({
                    name: reqPiece.name,
                    version: reqPiece.version,
                    projectId: targetProjectId,
                    platformId: targetPlatformId,
                })
            }
            catch {
                preflightErrors.push({
                    kind: 'MISSING_PIECE',
                    message: `Required piece ${reqPiece.name}@${reqPiece.version} is not installed or available on destination.`,
                    details: { pieceName: reqPiece.name, version: reqPiece.version },
                })
            }
        }

        // 3. Preflight: Required connections
        for (const reqConn of snapshot.requiredConnections) {
            const destConn = await connectionRepo().findOneBy({
                externalId: reqConn.externalId,
                pieceName: reqConn.pieceName,
                platformId: targetPlatformId,
            })
            if (!destConn) {
                preflightErrors.push({
                    kind: 'MISSING_CONNECTION',
                    message: `Required connection with externalId "${reqConn.externalId}" (${reqConn.pieceName}) does not exist on destination.`,
                    details: { externalId: reqConn.externalId, pieceName: reqConn.pieceName },
                })
            }
        }

        // 4. Current destination state & state hash
        const destinationStateHash = await this.computeDestinationStateHash(targetProjectId)

        // 5. Diff computation (READ ONLY, zero destination mutations)
        const creates: ProjectReplaceDiffItem[] = []
        const updates: ProjectReplaceDiffItem[] = []
        const deletes: ProjectReplaceDiffItem[] = []
        const unchanged: Array<{ kind: ProjectReplaceResourceKind, externalId: string }> = []

        // Tables Diff
        const destTables = await tableRepo().find({ where: { projectId: targetProjectId } })
        const destTableMap = new Map<string, Table>()
        for (const dt of destTables) {
            destTableMap.set(dt.externalId ?? dt.id, dt)
        }

        const sourceTableExtIds = new Set<string>()
        for (const srcTable of snapshot.tables) {
            sourceTableExtIds.add(srcTable.externalId)
            const matched = destTableMap.get(srcTable.externalId)
            if (!matched) {
                creates.push({
                    kind: 'table',
                    externalId: srcTable.externalId,
                    op: 'CREATE',
                    name: srcTable.name,
                    description: `Create table "${srcTable.name}"`,
                })
            }
            else {
                const hasChanges = matched.name !== srcTable.name
                    || matched.status !== (srcTable.status ?? null)
                    || matched.trigger !== (srcTable.trigger ?? null)
                if (hasChanges) {
                    updates.push({
                        kind: 'table',
                        externalId: srcTable.externalId,
                        op: 'UPDATE',
                        name: srcTable.name,
                        description: `Update table "${srcTable.name}"`,
                        changes: {
                            oldName: matched.name,
                            newName: srcTable.name,
                        },
                    })
                }
                else {
                    unchanged.push({ kind: 'table', externalId: srcTable.externalId })
                }
            }
        }

        for (const [destExtId, destTable] of destTableMap.entries()) {
            if (!sourceTableExtIds.has(destExtId)) {
                deletes.push({
                    kind: 'table',
                    externalId: destExtId,
                    op: 'DELETE',
                    name: destTable.name,
                    description: `Delete table "${destTable.name}"`,
                })
            }
        }

        // Trigger Bindings Diff
        const destTriggerBindings = await triggerBindingRepo().find({ where: { projectId: targetProjectId } })
        const destTbMap = new Map<string, typeof destTriggerBindings[0]>()
        for (const dtb of destTriggerBindings) {
            const key = `${dtb.pieceName}::${dtb.triggerName}`
            destTbMap.set(key, dtb)
        }

        const sourceTbKeys = new Set<string>()
        for (const srcTb of snapshot.triggerBindings) {
            const key = `${srcTb.pieceName}::${srcTb.triggerName}`
            sourceTbKeys.add(key)
            const matched = destTbMap.get(key)
            if (!matched) {
                creates.push({
                    kind: 'trigger_binding',
                    externalId: key,
                    op: 'CREATE',
                    name: key,
                    description: `Create trigger binding for ${srcTb.pieceName} (${srcTb.triggerName})`,
                })
            }
            else {
                const hasChanges = matched.promptTemplate !== srcTb.promptTemplate
                    || matched.status !== srcTb.status
                    || canonicalJson(matched.settings) !== canonicalJson(srcTb.settings)
                if (hasChanges) {
                    updates.push({
                        kind: 'trigger_binding',
                        externalId: key,
                        op: 'UPDATE',
                        name: key,
                        description: `Update trigger binding for ${srcTb.pieceName} (${srcTb.triggerName})`,
                    })
                }
                else {
                    unchanged.push({ kind: 'trigger_binding', externalId: key })
                }
            }
        }

        for (const [key, dtb] of destTbMap.entries()) {
            if (!sourceTbKeys.has(key)) {
                deletes.push({
                    kind: 'trigger_binding',
                    externalId: key,
                    op: 'DELETE',
                    name: key,
                    description: `Delete trigger binding for ${dtb.pieceName} (${dtb.triggerName})`,
                })
            }
        }

        // Scheduled Tasks Diff
        const destScheduledTasks = await scheduledTaskRepo().find({ where: { projectId: targetProjectId } })
        const destStMap = new Map<string, typeof destScheduledTasks[0]>()
        for (const dst of destScheduledTasks) {
            const key = `${dst.prompt}::${dst.cronExpression}`
            destStMap.set(key, dst)
        }

        const sourceStKeys = new Set<string>()
        for (const srcSt of snapshot.scheduledTasks) {
            const key = `${srcSt.prompt}::${srcSt.cronExpression}`
            sourceStKeys.add(key)
            const matched = destStMap.get(key)
            if (!matched) {
                creates.push({
                    kind: 'scheduled_task',
                    externalId: key,
                    op: 'CREATE',
                    name: key,
                    description: `Create scheduled task: "${srcSt.prompt.slice(0, 30)}" (${srcSt.cronExpression})`,
                })
            }
            else {
                const hasChanges = matched.timezone !== srcSt.timezone || matched.status !== srcSt.status
                if (hasChanges) {
                    updates.push({
                        kind: 'scheduled_task',
                        externalId: key,
                        op: 'UPDATE',
                        name: key,
                        description: `Update scheduled task: "${srcSt.prompt.slice(0, 30)}" (${srcSt.cronExpression})`,
                    })
                }
                else {
                    unchanged.push({ kind: 'scheduled_task', externalId: key })
                }
            }
        }

        for (const [key, dst] of destStMap.entries()) {
            if (!sourceStKeys.has(key)) {
                deletes.push({
                    kind: 'scheduled_task',
                    externalId: key,
                    op: 'DELETE',
                    name: key,
                    description: `Delete scheduled task: "${dst.prompt.slice(0, 30)}" (${dst.cronExpression})`,
                })
            }
        }

        // MCP Diff
        const destMcp = await mcpServerService(log).getByProjectId(targetProjectId)
        const sourceDisabledTools = [...(snapshot.mcp?.disabledTools ?? [])].sort()
        const destDisabledTools = [...(destMcp?.disabledTools ?? [])].sort()
        if (canonicalJson(sourceDisabledTools) !== canonicalJson(destDisabledTools)) {
            updates.push({
                kind: 'mcp_server',
                externalId: targetProjectId,
                op: 'UPDATE',
                name: 'mcp_server',
                description: 'Update MCP server disabled tools configuration',
                changes: {
                    oldDisabledTools: destDisabledTools,
                    newDisabledTools: sourceDisabledTools,
                },
            })
        }
        else {
            unchanged.push({ kind: 'mcp_server', externalId: targetProjectId })
        }

        // 6. Checksum and Plan Signature
        const planId = apId()
        const checksum = computeSha256(canonicalJson(snapshot))
        const signature = computePlanSignature(planId, checksum, destinationStateHash)

        return {
            planId,
            schemaVersion: 1,
            toolVersion: currentVersion,
            createdAt: new Date().toISOString(),
            sourceActivepiecesVersion: snapshot.sourceActivepiecesVersion,
            targetActivepiecesVersion: currentVersion,
            targetProjectId,
            checksum,
            destinationStateHash,
            signature,
            preflight: {
                passed: preflightErrors.length === 0,
                errors: preflightErrors,
            },
            changes: {
                creates,
                updates,
                deletes,
                unchanged,
            },
            summary: {
                created: creates.length,
                updated: updates.length,
                deleted: deletes.length,
                unchanged: unchanged.length,
            },
        }
    },

    async applyPlan({
        targetProjectId,
        targetPlatformId,
        request,
        snapshot,
    }: {
        targetProjectId: string
        targetPlatformId: string
        request: ProjectReplaceApplyRequest
        snapshot: ProjectStateSnapshot
    }): Promise<ProjectReplaceApplyResult> {
        const startTime = Date.now()
        const plan = request.plan

        // 1. Signature check
        const expectedSignature = computePlanSignature(plan.planId, plan.checksum, plan.destinationStateHash)
        const expectedSigBuf = Buffer.from(expectedSignature, 'hex')
        const sigBuf = Buffer.from(plan.signature || '', 'hex')
        const validSignature = sigBuf.length === expectedSigBuf.length && crypto.timingSafeEqual(sigBuf, expectedSigBuf)
        if (!validSignature) {
            const err = new Error('Plan signature verification failed. Plan artifact has been tampered with or corrupted.') as Error & { statusCode: number }
            err.statusCode = StatusCodes.BAD_REQUEST
            throw err
        }

        // 2. Preflight verification
        if (!plan.preflight.passed && !request.force) {
            const err = new Error(`Preflight checks failed: ${plan.preflight.errors.map((e) => e.message).join('; ')}`) as Error & { statusCode: number }
            err.statusCode = StatusCodes.BAD_REQUEST
            throw err
        }

        // 3. Destination Drift Detection
        const currentDestinationHash = await this.computeDestinationStateHash(targetProjectId)
        if (currentDestinationHash !== plan.destinationStateHash && !request.force) {
            const err = new Error('Destination project state has drifted since the plan was created. Re-run plan or use force.') as Error & { statusCode: number }
            err.statusCode = StatusCodes.CONFLICT
            throw err
        }

        const applied = {
            tablesCreated: 0,
            tablesUpdated: 0,
            tablesDeleted: 0,
            tablesUnchanged: 0,
            triggerBindingsCreated: 0,
            triggerBindingsUpdated: 0,
            triggerBindingsDeleted: 0,
            triggerBindingsUnchanged: 0,
            scheduledTasksCreated: 0,
            scheduledTasksUpdated: 0,
            scheduledTasksDeleted: 0,
            scheduledTasksUnchanged: 0,
            mcpUpdated: 0,
        }
        const failed: Array<{ kind: ProjectReplaceResourceKind, externalId: string, op: 'CREATE' | 'UPDATE' | 'DELETE', error: string }> = []

        if (request.dryRun) {
            return {
                applied,
                failed,
                durationMs: Date.now() - startTime,
            }
        }

        // Apply changes in ordered sequence:
        // Phase 1: Tables CREATE / UPDATE
        for (const change of plan.changes.creates.filter((c) => c.kind === 'table')) {
            try {
                const srcTable = snapshot.tables.find((t) => t.externalId === change.externalId)
                if (srcTable) {
                    await tableService.create({
                        projectId: targetProjectId,
                        request: {
                            projectId: targetProjectId,
                            name: srcTable.name,
                            externalId: srcTable.externalId,
                            fields: srcTable.fields?.map((f) => ({
                                name: f.name,
                                type: f.type as FieldType,
                                externalId: f.externalId,
                            })),
                        },
                    })
                    applied.tablesCreated++
                }
            }
            catch (err) {
                failed.push({ kind: 'table', externalId: change.externalId, op: 'CREATE', error: (err as Error).message })
            }
        }

        for (const change of plan.changes.updates.filter((c) => c.kind === 'table')) {
            try {
                const srcTable = snapshot.tables.find((t) => t.externalId === change.externalId)
                if (srcTable) {
                    await tableRepo().update({ projectId: targetProjectId, externalId: change.externalId }, {
                        name: srcTable.name,
                        status: (srcTable.status as TableAutomationStatus) ?? undefined,
                        trigger: (srcTable.trigger as TableAutomationTrigger) ?? undefined,
                    })
                    applied.tablesUpdated++
                }
            }
            catch (err) {
                failed.push({ kind: 'table', externalId: change.externalId, op: 'UPDATE', error: (err as Error).message })
            }
        }

        applied.tablesUnchanged = plan.changes.unchanged.filter((u) => u.kind === 'table').length

        // Phase 2: Trigger Bindings CREATE / UPDATE
        for (const change of plan.changes.creates.filter((c) => c.kind === 'trigger_binding')) {
            try {
                const [pieceName, triggerName] = change.externalId.split('::')
                const srcTb = snapshot.triggerBindings.find((b) => b.pieceName === pieceName && b.triggerName === triggerName)
                if (srcTb) {
                    let connectionId: string | undefined = undefined
                    if (srcTb.connectionExternalId) {
                        const conn = await connectionRepo().findOneBy({
                            externalId: srcTb.connectionExternalId,
                            platformId: targetPlatformId,
                        })
                        if (conn) {
                            connectionId = conn.id
                        }
                    }

                    await triggerBindingService.create({
                        projectId: targetProjectId,
                        platformId: targetPlatformId,
                        request: {
                            pieceName: srcTb.pieceName,
                            pieceVersion: srcTb.pieceVersion,
                            triggerName: srcTb.triggerName,
                            promptTemplate: srcTb.promptTemplate,
                            connectionId,
                            settings: srcTb.settings,
                            propertySettings: srcTb.propertySettings ?? undefined,
                            status: (srcTb.status as TriggerBindingStatus) ?? TriggerBindingStatus.ENABLED,
                        },
                    })
                    applied.triggerBindingsCreated++
                }
            }
            catch (err) {
                failed.push({ kind: 'trigger_binding', externalId: change.externalId, op: 'CREATE', error: (err as Error).message })
            }
        }

        for (const change of plan.changes.updates.filter((c) => c.kind === 'trigger_binding')) {
            try {
                const [pieceName, triggerName] = change.externalId.split('::')
                const srcTb = snapshot.triggerBindings.find((b) => b.pieceName === pieceName && b.triggerName === triggerName)
                const targetTb = await triggerBindingRepo().findOneBy({ projectId: targetProjectId, pieceName, triggerName })
                if (srcTb && targetTb) {
                    await triggerBindingService.update({
                        id: targetTb.id,
                        projectId: targetProjectId,
                        platformId: targetPlatformId,
                        request: {
                            promptTemplate: srcTb.promptTemplate,
                            settings: srcTb.settings,
                            propertySettings: srcTb.propertySettings ?? undefined,
                            status: (srcTb.status as TriggerBindingStatus) ?? TriggerBindingStatus.ENABLED,
                        },
                    })
                    applied.triggerBindingsUpdated++
                }
            }
            catch (err) {
                failed.push({ kind: 'trigger_binding', externalId: change.externalId, op: 'UPDATE', error: (err as Error).message })
            }
        }

        applied.triggerBindingsUnchanged = plan.changes.unchanged.filter((u) => u.kind === 'trigger_binding').length

        // Phase 3: Scheduled Tasks CREATE / UPDATE
        for (const change of plan.changes.creates.filter((c) => c.kind === 'scheduled_task')) {
            try {
                const [prompt, cronExpression] = change.externalId.split('::')
                const srcSt = snapshot.scheduledTasks.find((s) => s.prompt === prompt && s.cronExpression === cronExpression)
                if (srcSt) {
                    await scheduledTaskService.create({
                        projectId: targetProjectId,
                        platformId: targetPlatformId,
                        request: {
                            prompt: srcSt.prompt,
                            cronExpression: srcSt.cronExpression,
                            timezone: srcSt.timezone,
                            status: (srcSt.status as ScheduledTaskStatus) ?? ScheduledTaskStatus.ENABLED,
                        },
                    })
                    applied.scheduledTasksCreated++
                }
            }
            catch (err) {
                failed.push({ kind: 'scheduled_task', externalId: change.externalId, op: 'CREATE', error: (err as Error).message })
            }
        }

        for (const change of plan.changes.updates.filter((c) => c.kind === 'scheduled_task')) {
            try {
                const [prompt, cronExpression] = change.externalId.split('::')
                const srcSt = snapshot.scheduledTasks.find((s) => s.prompt === prompt && s.cronExpression === cronExpression)
                const targetSt = await scheduledTaskRepo().findOneBy({ projectId: targetProjectId, prompt, cronExpression })
                if (srcSt && targetSt) {
                    await scheduledTaskService.update({
                        id: targetSt.id,
                        projectId: targetProjectId,
                        platformId: targetPlatformId,
                        request: {
                            prompt: srcSt.prompt,
                            cronExpression: srcSt.cronExpression,
                            timezone: srcSt.timezone,
                            status: (srcSt.status as ScheduledTaskStatus) ?? ScheduledTaskStatus.ENABLED,
                        },
                    })
                    applied.scheduledTasksUpdated++
                }
            }
            catch (err) {
                failed.push({ kind: 'scheduled_task', externalId: change.externalId, op: 'UPDATE', error: (err as Error).message })
            }
        }

        applied.scheduledTasksUnchanged = plan.changes.unchanged.filter((u) => u.kind === 'scheduled_task').length

        // Phase 4: MCP UPDATE
        const mcpUpdate = plan.changes.updates.find((c) => c.kind === 'mcp_server')
        if (mcpUpdate && snapshot.mcp) {
            try {
                await mcpServerService(log).update({
                    projectId: targetProjectId,
                    disabledTools: snapshot.mcp.disabledTools ?? [],
                })
                applied.mcpUpdated++
            }
            catch (err) {
                failed.push({ kind: 'mcp_server', externalId: mcpUpdate.externalId, op: 'UPDATE', error: (err as Error).message })
            }
        }

        // Phase 5: Scheduled Tasks DELETE
        for (const change of plan.changes.deletes.filter((c) => c.kind === 'scheduled_task')) {
            try {
                const [prompt, cronExpression] = change.externalId.split('::')
                const targetSt = await scheduledTaskRepo().findOneBy({ projectId: targetProjectId, prompt, cronExpression })
                if (targetSt) {
                    await scheduledTaskService.delete({
                        id: targetSt.id,
                        projectId: targetProjectId,
                        platformId: targetPlatformId,
                    })
                    applied.scheduledTasksDeleted++
                }
            }
            catch (err) {
                failed.push({ kind: 'scheduled_task', externalId: change.externalId, op: 'DELETE', error: (err as Error).message })
            }
        }

        // Phase 6: Trigger Bindings DELETE
        for (const change of plan.changes.deletes.filter((c) => c.kind === 'trigger_binding')) {
            try {
                const [pieceName, triggerName] = change.externalId.split('::')
                const targetTb = await triggerBindingRepo().findOneBy({ projectId: targetProjectId, pieceName, triggerName })
                if (targetTb) {
                    await triggerBindingService.delete({
                        id: targetTb.id,
                        projectId: targetProjectId,
                        platformId: targetPlatformId,
                    })
                    applied.triggerBindingsDeleted++
                }
            }
            catch (err) {
                failed.push({ kind: 'trigger_binding', externalId: change.externalId, op: 'DELETE', error: (err as Error).message })
            }
        }

        // Phase 7: Tables DELETE
        for (const change of plan.changes.deletes.filter((c) => c.kind === 'table')) {
            try {
                const targetTbl = await tableRepo().findOneBy({ projectId: targetProjectId, externalId: change.externalId })
                if (targetTbl) {
                    await tableService.delete({
                        id: targetTbl.id,
                        projectId: targetProjectId,
                    })
                    applied.tablesDeleted++
                }
            }
            catch (err) {
                failed.push({ kind: 'table', externalId: change.externalId, op: 'DELETE', error: (err as Error).message })
            }
        }

        return {
            applied,
            failed,
            durationMs: Date.now() - startTime,
        }
    },
})
