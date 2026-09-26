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
    PackageType,
    PieceScope,
    PieceType,
    RequiredPieceSchema,
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
import { fileRepo } from '../../file/file.service'
import { system } from '../../helper/system/system'
import { AppSystemProp } from '../../helper/system/system-props'
import { mcpServerService } from '../../mcp/mcp-service'
import { pieceMetadataService } from '../../pieces/metadata/piece-metadata-service'
import { pieceInstallService } from '../../pieces/piece-install-service'
import { fieldService } from '../../tables/field/field.service'
import { TableEntity } from '../../tables/table/table.entity'
import { tableService } from '../../tables/table/table.service'

import { distributedLock } from '../../database/redis-connections'
import { ApMultipartFile } from '@inboxfm-connect/core-utils'

const tableRepo = repoFactory(TableEntity)
const triggerBindingRepo = repoFactory(TriggerBindingEntity)
const scheduledTaskRepo = repoFactory(ScheduledTaskEntity)
const connectionRepo = repoFactory(ConnectionEntity)

function getSigningSecret(): string {
    const dedicatedSecret = system.get(AppSystemProp.PROJECT_REPLACE_SIGNING_SECRET)
    if (dedicatedSecret) {
        return dedicatedSecret
    }
    const envSecret = process.env.PROJECT_REPLACE_SIGNING_SECRET || process.env.AP_PROJECT_REPLACE_SIGNING_SECRET
    if (envSecret) {
        return envSecret
    }
    const jwtSecret = system.get(AppSystemProp.JWT_SECRET)
    if (jwtSecret) {
        return jwtSecret
    }
    throw new Error('Signing secret is not configured. PROJECT_REPLACE_SIGNING_SECRET or JWT_SECRET must be set.')
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

function computePlanSignature(plan: Omit<ProjectReplacePlan, 'signature'>): string {
    const secret = getSigningSecret()
    const canonicalPayload = canonicalJson({
        planId: plan.planId,
        schemaVersion: plan.schemaVersion,
        toolVersion: plan.toolVersion,
        sourceActivepiecesVersion: plan.sourceActivepiecesVersion,
        targetActivepiecesVersion: plan.targetActivepiecesVersion,
        targetProjectId: plan.targetProjectId,
        checksum: plan.checksum,
        destinationStateHash: plan.destinationStateHash,
        preflight: plan.preflight,
        changes: plan.changes,
        summary: plan.summary,
    })
    return crypto.createHmac('sha256', secret).update(canonicalPayload).digest('hex')
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
            requiredPiecesMap.set(`${tb.pieceName}::${tb.pieceVersion}`, tb.pieceVersion)
            let connExternalId: string | null = null
            if (tb.connectionId) {
                const conn = await connectionRepo().findOneBy({ id: tb.connectionId, platformId })
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

        const requiredPieces: RequiredPieceSchema[] = []
        const customPieces: RequiredPieceSchema[] = []

        for (const [key, version] of requiredPiecesMap.entries()) {
            const [name] = key.split('::')
            const pieceMeta = await pieceMetadataService(log).get({ name, version, platformId })
            let pieceType: 'OFFICIAL' | 'CUSTOM' = 'OFFICIAL'
            let packageType: 'ARCHIVE' | 'REGISTRY' = 'REGISTRY'
            let archiveChecksum: string | undefined
            let archiveFileBase64: string | undefined
            const minimumSupportedRelease = pieceMeta?.minimumSupportedRelease ?? undefined
            const maximumSupportedRelease = pieceMeta?.maximumSupportedRelease ?? undefined

            if (pieceMeta?.pieceType === PieceType.CUSTOM) {
                pieceType = 'CUSTOM'
                if (pieceMeta.packageType === PackageType.ARCHIVE && pieceMeta.archiveId) {
                    packageType = 'ARCHIVE'
                    const file = await fileRepo().findOneBy({ id: pieceMeta.archiveId, platformId })
                    if (file?.data) {
                        archiveChecksum = crypto.createHash('sha256').update(file.data).digest('hex')
                        archiveFileBase64 = file.data.toString('base64')
                    }
                }
            }

            const pieceInfo: RequiredPieceSchema = {
                name,
                version,
                pieceType,
                packageType,
                archiveChecksum,
                minimumSupportedRelease,
                maximumSupportedRelease,
                archiveFileBase64,
            }
            requiredPieces.push(pieceInfo)
            if (pieceType === 'CUSTOM') {
                customPieces.push(pieceInfo)
            }
        }

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
            customPieces,
            requiredConnections,
        }
    },

    async computeDestinationStateHash(projectId: string): Promise<string> {
        const tables = await tableRepo().find({ where: { projectId } })
        const tablesWithFields = []
        for (const t of tables) {
            const fields: Field[] = await fieldService.getAll({ projectId, tableId: t.id })
            tablesWithFields.push({
                name: t.name,
                externalId: t.externalId,
                status: t.status,
                trigger: t.trigger,
                fields: fields.map((f: Field) => ({ name: f.name, type: f.type, externalId: f.externalId })).sort((a, b) => (a.externalId || '').localeCompare(b.externalId || '')),
            })
        }

        const triggerBindings = await triggerBindingRepo().find({ where: { projectId } })
        const scheduledTasks = await scheduledTaskRepo().find({ where: { projectId } })
        const mcpServer = await mcpServerService(log).getByProjectId(projectId)

        const normalized = {
            tables: tablesWithFields.sort((a, b) => (a.externalId || '').localeCompare(b.externalId || '')),
            triggerBindings: triggerBindings.map((tb) => ({
                pieceName: tb.pieceName,
                pieceVersion: tb.pieceVersion,
                triggerName: tb.triggerName,
                promptTemplate: tb.promptTemplate,
                connectionId: tb.connectionId,
                status: tb.status,
                settings: tb.settings,
                propertySettings: tb.propertySettings,
            })).sort((a, b) => (a.pieceName + a.triggerName).localeCompare(b.pieceName + b.triggerName)),
            scheduledTasks: scheduledTasks.map((st) => ({
                prompt: st.prompt,
                cronExpression: st.cronExpression,
                timezone: st.timezone,
                status: st.status,
            })).sort((a, b) => (a.prompt + a.cronExpression).localeCompare(b.prompt + b.cronExpression)),
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
        const sourceSemver = semver.valid(semver.coerce(snapshot.sourceActivepiecesVersion))
        const targetSemver = semver.valid(semver.coerce(currentVersion))
        if (!sourceSemver || !targetSemver) {
            preflightErrors.push({
                kind: 'VERSION_SKEW',
                message: `Invalid version string: source="${snapshot.sourceActivepiecesVersion}", destination="${currentVersion}".`,
            })
        }
        else {
            const sourceMajor = semver.major(sourceSemver)
            const targetMajor = semver.major(targetSemver)
            if (sourceMajor > targetMajor) {
                preflightErrors.push({
                    kind: 'VERSION_SKEW',
                    message: `Source major version (${snapshot.sourceActivepiecesVersion}) is newer than destination (${currentVersion}).`,
                })
            }
        }

        const creates: ProjectReplaceDiffItem[] = []
        const updates: ProjectReplaceDiffItem[] = []
        const deletes: ProjectReplaceDiffItem[] = []
        const unchanged: Array<{ kind: ProjectReplaceResourceKind, externalId: string }> = []

        // 2. Preflight: Required pieces & custom integrations
        const customIntegrations = {
            required: [] as RequiredPieceSchema[],
            missing: [] as RequiredPieceSchema[],
            deployable: [] as RequiredPieceSchema[],
            compatible: [] as RequiredPieceSchema[],
        }

        // Process distinct piece name + version combinations
        const seenPieces = new Set<string>()
        const allPiecesToVerify = [...(snapshot.requiredPieces || []), ...(snapshot.customPieces || [])]

        for (const reqPiece of allPiecesToVerify) {
            const pieceKey = `${reqPiece.name}@${reqPiece.version}`
            if (seenPieces.has(pieceKey)) {
                continue
            }
            seenPieces.add(pieceKey)

            const isCustom = reqPiece.pieceType === 'CUSTOM'
                || snapshot.customPieces?.some((cp) => cp.name === reqPiece.name && cp.version === reqPiece.version)
                || Boolean(reqPiece.archiveFileBase64)

            let destPiece = null
            try {
                destPiece = await pieceMetadataService(log).getOrThrow({
                    name: reqPiece.name,
                    version: reqPiece.version,
                    projectId: targetProjectId,
                    platformId: targetPlatformId,
                })
            }
            catch {
                destPiece = null
            }

            if (isCustom) {
                customIntegrations.required.push(reqPiece)

                // Compatibility check applies to all custom integrations (installed or missing)
                let isCompatible = true
                const minReleaseStr = reqPiece.minimumSupportedRelease ?? (destPiece as any)?.minimumSupportedRelease
                const maxReleaseStr = reqPiece.maximumSupportedRelease ?? (destPiece as any)?.maximumSupportedRelease
                const minRelease = minReleaseStr ? semver.valid(semver.coerce(minReleaseStr)) : null
                const maxRelease = maxReleaseStr ? semver.valid(semver.coerce(maxReleaseStr)) : null

                if (minRelease && targetSemver && semver.lt(targetSemver, minRelease)) {
                    isCompatible = false
                    preflightErrors.push({
                        kind: 'INCOMPATIBLE_INTEGRATION',
                        message: `Custom integration ${reqPiece.name}@${reqPiece.version} requires engine >= ${minReleaseStr}, but destination is running ${currentVersion}.`,
                        details: { pieceName: reqPiece.name, version: reqPiece.version, minimumSupportedRelease: minReleaseStr },
                    })
                }
                if (maxRelease && targetSemver && semver.gt(targetSemver, maxRelease)) {
                    isCompatible = false
                    preflightErrors.push({
                        kind: 'INCOMPATIBLE_INTEGRATION',
                        message: `Custom integration ${reqPiece.name}@${reqPiece.version} requires engine <= ${maxReleaseStr}, but destination is running ${currentVersion}.`,
                        details: { pieceName: reqPiece.name, version: reqPiece.version, maximumSupportedRelease: maxReleaseStr },
                    })
                }
                if (isCompatible) {
                    customIntegrations.compatible.push(reqPiece)
                }

                if (!destPiece) {
                    customIntegrations.missing.push(reqPiece)

                    // Package integrity and deployability check
                    if (reqPiece.archiveFileBase64) {
                        // Integrity verification: Checksum MUST be present for archive deployment
                        if (!reqPiece.archiveChecksum) {
                            preflightErrors.push({
                                kind: 'CHECKSUM_MISMATCH',
                                message: `Integrity checksum verification failed for custom piece ${reqPiece.name}@${reqPiece.version}: missing required archiveChecksum.`,
                                details: { pieceName: reqPiece.name, version: reqPiece.version },
                            })
                        }
                        else {
                            const artifactBuf = Buffer.from(reqPiece.archiveFileBase64, 'base64')
                            const computedChecksum = crypto.createHash('sha256').update(artifactBuf).digest('hex')
                            if (computedChecksum !== reqPiece.archiveChecksum) {
                                preflightErrors.push({
                                    kind: 'CHECKSUM_MISMATCH',
                                    message: `Integrity checksum verification failed for custom piece ${reqPiece.name}@${reqPiece.version}. Expected ${reqPiece.archiveChecksum}, computed ${computedChecksum}.`,
                                    details: { pieceName: reqPiece.name, expected: reqPiece.archiveChecksum, computed: computedChecksum },
                                })
                            }
                            else if (isCompatible) {
                                customIntegrations.deployable.push(reqPiece)
                                creates.push({
                                    kind: 'custom_piece',
                                    externalId: `${reqPiece.name}::${reqPiece.version}`,
                                    op: 'CREATE',
                                    name: `${reqPiece.name}@${reqPiece.version}`,
                                    description: `Deploy custom integration ${reqPiece.name}@${reqPiece.version}`,
                                })
                            }
                        }
                    }
                    else {
                        preflightErrors.push({
                            kind: 'MISSING_CUSTOM_PIECE',
                            message: `Required custom integration ${reqPiece.name}@${reqPiece.version} is not installed on destination. Provide an integrity-checked artifact or deploy it beforehand.`,
                            details: { pieceName: reqPiece.name, version: reqPiece.version },
                        })
                    }
                }
                else {
                    // Already installed custom piece: only mark unchanged if compatible!
                    if (isCompatible) {
                        unchanged.push({
                            kind: 'custom_piece',
                            externalId: `${reqPiece.name}::${reqPiece.version}`,
                        })
                    }
                }
            }
            else {
                if (!destPiece) {
                    preflightErrors.push({
                        kind: 'MISSING_PIECE',
                        message: `Required piece ${reqPiece.name}@${reqPiece.version} is not installed or available on destination.`,
                        details: { pieceName: reqPiece.name, version: reqPiece.version },
                    })
                }
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
                const destFields: Field[] = await fieldService.getAll({ projectId: targetProjectId, tableId: matched.id })
                const normSrcFields = (srcTable.fields || []).map((f) => ({ name: f.name, type: f.type, externalId: f.externalId })).sort((a, b) => (a.externalId || '').localeCompare(b.externalId || ''))
                const normDestFields = destFields.map((f) => ({ name: f.name, type: f.type, externalId: f.externalId })).sort((a, b) => (a.externalId || '').localeCompare(b.externalId || ''))

                const hasChanges = matched.name !== srcTable.name
                    || matched.status !== (srcTable.status ?? null)
                    || matched.trigger !== (srcTable.trigger ?? null)
                    || canonicalJson(normSrcFields) !== canonicalJson(normDestFields)
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
            const key = dtb.id
            destTbMap.set(key, dtb)
        }

        const sourceTbKeys = new Set<string>()
        for (const srcTb of snapshot.triggerBindings) {
            const key = srcTb.externalId ?? `${srcTb.pieceName}::${srcTb.triggerName}`
            sourceTbKeys.add(key)
            // Match either by externalId (id) or by (pieceName + triggerName)
            const matched = destTbMap.get(key) || Array.from(destTbMap.values()).find((dtb) => dtb.pieceName === srcTb.pieceName && dtb.triggerName === srcTb.triggerName)
            if (!matched) {
                creates.push({
                    kind: 'trigger_binding',
                    externalId: key,
                    op: 'CREATE',
                    name: `${srcTb.pieceName} (${srcTb.triggerName})`,
                    description: `Create trigger binding for ${srcTb.pieceName} (${srcTb.triggerName})`,
                })
            }
            else {
                const hasChanges = matched.promptTemplate !== srcTb.promptTemplate
                    || matched.status !== srcTb.status
                    || canonicalJson(matched.settings) !== canonicalJson(srcTb.settings)
                    || canonicalJson(matched.propertySettings ?? null) !== canonicalJson(srcTb.propertySettings ?? null)
                if (hasChanges) {
                    updates.push({
                        kind: 'trigger_binding',
                        externalId: matched.id,
                        op: 'UPDATE',
                        name: `${srcTb.pieceName} (${srcTb.triggerName})`,
                        description: `Update trigger binding for ${srcTb.pieceName} (${srcTb.triggerName})`,
                    })
                }
                else {
                    unchanged.push({ kind: 'trigger_binding', externalId: matched.id })
                }
            }
        }

        for (const [key, dtb] of destTbMap.entries()) {
            const matchedInSource = snapshot.triggerBindings.some((b) => (b.externalId && b.externalId === key) || (b.pieceName === dtb.pieceName && b.triggerName === dtb.triggerName))
            if (!matchedInSource) {
                deletes.push({
                    kind: 'trigger_binding',
                    externalId: key,
                    op: 'DELETE',
                    name: `${dtb.pieceName} (${dtb.triggerName})`,
                    description: `Delete trigger binding for ${dtb.pieceName} (${dtb.triggerName})`,
                })
            }
        }

        // Scheduled Tasks Diff
        const destScheduledTasks = await scheduledTaskRepo().find({ where: { projectId: targetProjectId } })
        const destStMap = new Map<string, typeof destScheduledTasks[0]>()
        for (const dst of destScheduledTasks) {
            const key = dst.id
            destStMap.set(key, dst)
        }

        for (const srcSt of snapshot.scheduledTasks) {
            const key = srcSt.externalId ?? `${srcSt.prompt}::${srcSt.cronExpression}`
            const matched = destStMap.get(key) || Array.from(destStMap.values()).find((dst) => dst.prompt === srcSt.prompt && dst.cronExpression === srcSt.cronExpression)
            if (!matched) {
                creates.push({
                    kind: 'scheduled_task',
                    externalId: key,
                    op: 'CREATE',
                    name: srcSt.prompt,
                    description: `Create scheduled task: "${srcSt.prompt.slice(0, 30)}" (${srcSt.cronExpression})`,
                })
            }
            else {
                const hasChanges = matched.timezone !== srcSt.timezone || matched.status !== srcSt.status
                if (hasChanges) {
                    updates.push({
                        kind: 'scheduled_task',
                        externalId: matched.id,
                        op: 'UPDATE',
                        name: srcSt.prompt,
                        description: `Update scheduled task: "${srcSt.prompt.slice(0, 30)}" (${srcSt.cronExpression})`,
                    })
                }
                else {
                    unchanged.push({ kind: 'scheduled_task', externalId: matched.id })
                }
            }
        }

        for (const [key, dst] of destStMap.entries()) {
            const matchedInSource = snapshot.scheduledTasks.some((s) => (s.externalId && s.externalId === key) || (s.prompt === dst.prompt && s.cronExpression === dst.cronExpression))
            if (!matchedInSource) {
                deletes.push({
                    kind: 'scheduled_task',
                    externalId: key,
                    op: 'DELETE',
                    name: dst.prompt,
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

        // Sort all diff items deterministically
        const sortDiff = (a: ProjectReplaceDiffItem, b: ProjectReplaceDiffItem) =>
            `${a.kind}:${a.op}:${a.externalId}`.localeCompare(`${b.kind}:${b.op}:${b.externalId}`)
        creates.sort(sortDiff)
        updates.sort(sortDiff)
        deletes.sort(sortDiff)
        unchanged.sort((a, b) => `${a.kind}:${a.externalId}`.localeCompare(`${b.kind}:${b.externalId}`))

        // 6. Checksum and Plan Signature
        const planId = apId()
        const checksum = computeSha256(canonicalJson(snapshot))
        const unsignedPlan: Omit<ProjectReplacePlan, 'signature'> = {
            planId,
            schemaVersion: 1,
            toolVersion: currentVersion,
            createdAt: new Date().toISOString(),
            sourceActivepiecesVersion: snapshot.sourceActivepiecesVersion,
            targetActivepiecesVersion: currentVersion,
            targetProjectId,
            checksum,
            destinationStateHash,
            preflight: {
                passed: preflightErrors.length === 0,
                errors: preflightErrors,
                customIntegrations,
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

        const signature = computePlanSignature(unsignedPlan)

        return {
            ...unsignedPlan,
            signature,
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
        const plan = request.plan

        // 1. Assert target project matches plan target project (prevent cross-project replay)
        if (plan.targetProjectId !== targetProjectId) {
            const err = new Error(`Plan target project "${plan.targetProjectId}" does not match target project "${targetProjectId}". Cross-project plan replay is forbidden.`) as Error & { statusCode: number }
            err.statusCode = StatusCodes.BAD_REQUEST
            throw err
        }

        // 2. Recompute checksum from submitted snapshot (assert snapshot binding)
        const recomputedChecksum = computeSha256(canonicalJson(snapshot))
        if (recomputedChecksum !== plan.checksum) {
            const err = new Error('Submitted snapshot checksum does not match plan checksum. Swapped or modified snapshot detected.') as Error & { statusCode: number }
            err.statusCode = StatusCodes.BAD_REQUEST
            throw err
        }

        // 3. Signature verification (full canonical plan coverage)
        const unsignedPlan: Omit<ProjectReplacePlan, 'signature'> = {
            planId: plan.planId,
            schemaVersion: plan.schemaVersion,
            toolVersion: plan.toolVersion,
            createdAt: plan.createdAt,
            sourceActivepiecesVersion: plan.sourceActivepiecesVersion,
            targetActivepiecesVersion: plan.targetActivepiecesVersion,
            targetProjectId: plan.targetProjectId,
            checksum: plan.checksum,
            destinationStateHash: plan.destinationStateHash,
            preflight: plan.preflight,
            changes: plan.changes,
            summary: plan.summary,
        }
        const expectedSignature = computePlanSignature(unsignedPlan)
        const expectedSigBuf = Buffer.from(expectedSignature, 'hex')
        const sigBuf = Buffer.from(plan.signature || '', 'hex')
        const validSignature = sigBuf.length === expectedSigBuf.length && crypto.timingSafeEqual(sigBuf, expectedSigBuf)
        if (!validSignature) {
            const err = new Error('Plan signature verification failed. Plan artifact has been tampered with or corrupted.') as Error & { statusCode: number }
            err.statusCode = StatusCodes.BAD_REQUEST
            throw err
        }

        // 4. Preflight verification (--force only waives preflight warnings, NEVER drift)
        if (!plan.preflight.passed && !request.force) {
            const err = new Error(`Preflight checks failed: ${plan.preflight.errors.map((e) => e.message).join('; ')}`) as Error & { statusCode: number }
            err.statusCode = StatusCodes.BAD_REQUEST
            throw err
        }

        // 5. Wrap drift verification and mutations in distributedLock to avoid races
        return distributedLock(system.globalLogger()).runExclusive({
            key: `project_replace_lock_${targetProjectId}`,
            timeoutInSeconds: 60,
            fn: async () => {
                const startTime = Date.now()

                // Destination Drift Detection (strictly enforced; --force does not waive drift)
                const currentDestinationHash = await this.computeDestinationStateHash(targetProjectId)
                if (currentDestinationHash !== plan.destinationStateHash) {
                    const err = new Error('Destination project state has drifted since the plan was created. Re-run plan or recreate plan artifact.') as Error & { statusCode: number }
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
                    customPiecesInstalled: 0,
                    customPiecesUnchanged: 0,
                }
                const failed: Array<{ kind: ProjectReplaceResourceKind, externalId: string, op: 'CREATE' | 'UPDATE' | 'DELETE', error: string }> = []

                if (request.dryRun || request.inspectOnly) {
                    return {
                        applied,
                        failed,
                        durationMs: Date.now() - startTime,
                    }
                }

                // Phase 0: Custom Piece Deployment (Ordered BEFORE Trigger Bindings & Mutations!)
                const failedCustomPieceNames = new Set<string>()

                // Any custom pieces that were missing from snapshot or failed preflight must also block dependent activation under --force
                for (const err of plan.preflight.errors) {
                    if (err.kind === 'MISSING_CUSTOM_PIECE' || err.kind === 'MISSING_PIECE' || err.kind === 'CHECKSUM_MISMATCH' || err.kind === 'INCOMPATIBLE_INTEGRATION') {
                        const pieceName = (err.details?.pieceName as string) || (err.message.match(/piece\s+([^\s@]+)/i)?.[1])
                        if (pieceName) {
                            failedCustomPieceNames.add(pieceName)
                        }
                    }
                }

                if (request.deployCustomIntegrations === true) {
                    for (const change of plan.changes.creates.filter((c) => c.kind === 'custom_piece')) {
                        const [pieceName, pieceVersion] = change.externalId.split('::')
                        const pieceInfo = snapshot.requiredPieces.find((p) => p.name === pieceName && p.version === pieceVersion)
                            ?? snapshot.customPieces?.find((p) => p.name === pieceName && p.version === pieceVersion)

                        if (!pieceInfo?.archiveFileBase64) {
                            failed.push({
                                kind: 'custom_piece',
                                externalId: change.externalId,
                                op: 'CREATE',
                                error: 'Missing package archive data for deployment',
                            })
                            failedCustomPieceNames.add(pieceName)
                            continue
                        }

                        try {
                            // Check if already installed on destination (idempotency) and verify compatibility/integrity
                            const existing = await pieceMetadataService(log).get({
                                name: pieceName,
                                version: pieceVersion,
                                platformId: targetPlatformId,
                            })
                            if (existing) {
                                applied.customPiecesUnchanged++
                                continue
                            }

                            // Strict package integrity check
                            if (!pieceInfo.archiveChecksum) {
                                throw new Error(`Integrity checksum missing for custom piece "${pieceName}"`)
                            }
                            const archiveBuf = Buffer.from(pieceInfo.archiveFileBase64, 'base64')
                            const checksum = crypto.createHash('sha256').update(archiveBuf).digest('hex')
                            if (checksum !== pieceInfo.archiveChecksum) {
                                throw new Error(`Integrity checksum mismatch for custom piece "${pieceName}": expected ${pieceInfo.archiveChecksum}, got ${checksum}`)
                            }

                            // Sanitize filename: replace all slashes, colons, or invalid chars
                            const safePieceFileName = pieceName.replace(/[@/\\:]/g, '-')
                            const safeVersion = pieceVersion.replace(/[/\\:]/g, '-')

                            // Install scoped strictly to targetPlatformId (tenant isolation)
                            await pieceInstallService(log).installPiece(targetPlatformId, {
                                packageType: PackageType.ARCHIVE,
                                scope: PieceScope.PLATFORM,
                                pieceName,
                                pieceVersion,
                                pieceArchive: {
                                    filename: `${safePieceFileName}-${safeVersion}.tgz`,
                                    data: archiveBuf,
                                    type: 'file',
                                } as ApMultipartFile,
                            })
                            applied.customPiecesInstalled++
                        }
                        catch (err) {
                            failed.push({
                                kind: 'custom_piece',
                                externalId: change.externalId,
                                op: 'CREATE',
                                error: (err as Error).message,
                            })
                            failedCustomPieceNames.add(pieceName)
                        }
                    }
                    applied.customPiecesUnchanged += plan.changes.unchanged.filter((u) => u.kind === 'custom_piece').length
                }
                else {
                    // When deployment is not enabled, record deployable custom pieces as failed so dependencies know they are unavailable
                    for (const change of plan.changes.creates.filter((c) => c.kind === 'custom_piece')) {
                        const [pieceName] = change.externalId.split('::')
                        failedCustomPieceNames.add(pieceName)
                    }
                }

                // Phase 1: Tables CREATE / UPDATE
                for (const change of plan.changes.creates.filter((c) => c.kind === 'table')) {
                    try {
                        const srcTable = snapshot.tables.find((t) => t.externalId === change.externalId)
                        if (srcTable) {
                            const newTable = await tableService.create({
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
                            if (srcTable.status !== undefined || srcTable.trigger !== undefined) {
                                await tableRepo().update({ id: newTable.id }, {
                                    status: (srcTable.status ?? null) as TableAutomationStatus,
                                    trigger: (srcTable.trigger ?? null) as TableAutomationTrigger,
                                })
                            }
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
                            const destTable = await tableRepo().findOneBy({ projectId: targetProjectId, externalId: change.externalId })
                            await tableRepo().update({ projectId: targetProjectId, externalId: change.externalId }, {
                                name: srcTable.name,
                                status: (srcTable.status ?? null) as TableAutomationStatus,
                                trigger: (srcTable.trigger ?? null) as TableAutomationTrigger,
                            })

                            if (destTable && srcTable.fields) {
                                const currentFields: Field[] = await fieldService.getAll({ projectId: targetProjectId, tableId: destTable.id })
                                for (const sf of srcTable.fields) {
                                    const matchField = currentFields.find((cf) => (sf.externalId && cf.externalId === sf.externalId) || cf.name === sf.name)
                                    if (!matchField) {
                                        await fieldService.create({
                                            projectId: targetProjectId,
                                            request: {
                                                tableId: destTable.id,
                                                name: sf.name,
                                                type: sf.type as FieldType,
                                                externalId: sf.externalId,
                                            } as any,
                                        })
                                    }
                                }
                            }
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
                        const srcTb = snapshot.triggerBindings.find((b) => b.externalId === change.externalId || `${b.pieceName}::${b.triggerName}` === change.externalId)
                        if (srcTb && failedCustomPieceNames.has(srcTb.pieceName)) {
                            failed.push({
                                kind: 'trigger_binding',
                                externalId: change.externalId,
                                op: 'CREATE',
                                error: `Activation blocked: dependent custom integration "${srcTb.pieceName}" failed to install`,
                            })
                            continue
                        }
                        if (srcTb) {
                            let connectionId: string | undefined = undefined
                            if (srcTb.connectionExternalId) {
                                const conn = await connectionRepo().findOneBy({
                                    externalId: srcTb.connectionExternalId,
                                    pieceName: srcTb.pieceName,
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
                        const targetTb = await triggerBindingRepo().findOneBy({ id: change.externalId, projectId: targetProjectId })
                        const srcTb = snapshot.triggerBindings.find((b) => b.externalId === change.externalId || (targetTb && b.pieceName === targetTb.pieceName && b.triggerName === targetTb.triggerName))
                        if (srcTb && failedCustomPieceNames.has(srcTb.pieceName)) {
                            failed.push({
                                kind: 'trigger_binding',
                                externalId: change.externalId,
                                op: 'UPDATE',
                                error: `Activation blocked: dependent custom integration "${srcTb.pieceName}" failed to install`,
                            })
                            continue
                        }
                        if (srcTb && targetTb) {
                            let connectionId: string | undefined = targetTb.connectionId ?? undefined
                            if (srcTb.connectionExternalId) {
                                const conn = await connectionRepo().findOneBy({
                                    externalId: srcTb.connectionExternalId,
                                    pieceName: srcTb.pieceName,
                                    platformId: targetPlatformId,
                                })
                                if (conn) {
                                    connectionId = conn.id
                                }
                            }
                            await triggerBindingService.update({
                                id: targetTb.id,
                                projectId: targetProjectId,
                                platformId: targetPlatformId,
                                request: {
                                    promptTemplate: srcTb.promptTemplate,
                                    connectionId,
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
                        const srcSt = snapshot.scheduledTasks.find((s) => s.externalId === change.externalId || `${s.prompt}::${s.cronExpression}` === change.externalId)
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
                        const targetSt = await scheduledTaskRepo().findOneBy({ id: change.externalId, projectId: targetProjectId })
                        const srcSt = snapshot.scheduledTasks.find((s) => s.externalId === change.externalId || (targetSt && s.prompt === targetSt.prompt && s.cronExpression === targetSt.cronExpression))
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
                        const targetSt = await scheduledTaskRepo().findOneBy({ id: change.externalId, projectId: targetProjectId })
                            || await scheduledTaskRepo().findOneBy({ projectId: targetProjectId, prompt: change.name })
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
                        const targetTb = await triggerBindingRepo().findOneBy({ id: change.externalId, projectId: targetProjectId })
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
    },
})
