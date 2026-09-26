import { Command } from 'commander'
import fs from 'fs'
import path from 'path'
import { ProjectReplaceArtifact, ProjectStateSnapshot } from '@inboxfm-connect/shared'

type ReplaceCliOptions = {
    sourceUrl?: string
    sourceToken?: string
    sourceProject?: string
    destUrl: string
    destToken: string
    destProject: string
    planFile?: string
    out?: string
    dryRun?: boolean
    force?: boolean
    json?: boolean
}

async function fetchJson<T>(url: string, init: RequestInit): Promise<{ ok: boolean, status: number, data: T }> {
    try {
        const res = await fetch(url, init)
        const text = await res.text()
        let parsed: unknown
        try {
            parsed = JSON.parse(text)
        }
        catch {
            parsed = text
        }
        return { ok: res.ok, status: res.status, data: parsed as T }
    }
    catch (err) {
        throw new Error(`Transport error calling ${url}: ${(err as Error).message}`)
    }
}

export const projectReplaceCommand = new Command('replace')
    .description('Mirror a project configuration from source to destination, or review dry-run plan')
    .option('--source-url <url>', 'Source Activepieces API URL')
    .option('--source-token <token>', 'Source authorization token')
    .option('--source-project <id>', 'Source project ID')
    .requiredOption('--dest-url <url>', 'Destination Activepieces API URL')
    .requiredOption('--dest-token <token>', 'Destination authorization token')
    .requiredOption('--dest-project <id>', 'Destination project ID')
    .option('--plan-file <path>', 'Path to a signed plan artifact JSON file to apply')
    .option('--out <path>', 'Path to write generated plan artifact JSON')
    .option('--dry-run', 'Generate reviewable plan artifact without mutating destination', false)
    .option('--force', 'Bypass drift detection or preflight warnings', false)
    .option('--json', 'Output machine-readable JSON', false)
    .action(async (options: ReplaceCliOptions) => {
        try {
            const destBase = options.destUrl.replace(/\/$/, '')

            let snapshot: ProjectStateSnapshot
            let artifact: ProjectReplaceArtifact | null = null

            // 1. If --plan-file is supplied, load it from disk
            if (options.planFile) {
                const raw = fs.readFileSync(path.resolve(options.planFile), 'utf-8')
                artifact = JSON.parse(raw) as ProjectReplaceArtifact
                snapshot = artifact.snapshot
            }
            else {
                // Otherwise source details are required to fetch snapshot
                if (!options.sourceUrl || !options.sourceToken || !options.sourceProject) {
                    console.error('Error: --source-url, --source-token, and --source-project are required when --plan-file is not provided.')
                    process.exit(4)
                }

                const sourceBase = options.sourceUrl.replace(/\/$/, '')
                const exportRes = await fetchJson<ProjectStateSnapshot>(
                    `${sourceBase}/api/v1/projects/${options.sourceProject}/replace/export`,
                    {
                        headers: {
                            Authorization: `Bearer ${options.sourceToken}`,
                            'Content-Type': 'application/json',
                        },
                    },
                )

                if (!exportRes.ok) {
                    console.error(`Error: Failed to export snapshot from source (${exportRes.status}):`, exportRes.data)
                    process.exit(exportRes.status === 401 || exportRes.status === 403 ? 4 : 3)
                }
                snapshot = exportRes.data
            }

            // 2. If dry-run or plan generation
            if (options.dryRun || !options.planFile) {
                const planRes = await fetchJson<ProjectReplaceArtifact>(
                    `${destBase}/api/v1/projects/${options.destProject}/replace/plan`,
                    {
                        method: 'POST',
                        headers: {
                            Authorization: `Bearer ${options.destToken}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(snapshot),
                    },
                )

                if (planRes.status === 400 && (!planRes.data?.plan?.preflight?.passed)) {
                    if (options.json) {
                        console.log(JSON.stringify(planRes.data, null, 2))
                    }
                    else {
                        console.error('Preflight checks failed on destination:')
                        for (const err of planRes.data.plan.preflight.errors) {
                            console.error(`  - [${err.kind}]: ${err.message}`)
                        }
                    }
                    process.exit(2)
                }

                if (!planRes.ok) {
                    console.error(`Error: Failed to generate plan on destination (${planRes.status}):`, planRes.data)
                    process.exit(planRes.status === 409 ? 3 : 4)
                }

                artifact = planRes.data

                if (options.out) {
                    const outPath = path.resolve(options.out)
                    fs.mkdirSync(path.dirname(outPath), { recursive: true })
                    fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2), 'utf-8')
                }

                if (options.dryRun) {
                    if (options.json) {
                        console.log(JSON.stringify(artifact, null, 2))
                    }
                    else {
                        console.log(`Plan ID: ${artifact.plan.planId}`)
                        console.log(`Checksum: ${artifact.plan.checksum}`)
                        console.log(`Signature: ${artifact.plan.signature}`)
                        console.log('\nPlanned Changes:')
                        console.log(`  Creates:   ${artifact.plan.summary.created}`)
                        console.log(`  Updates:   ${artifact.plan.summary.updated}`)
                        console.log(`  Deletes:   ${artifact.plan.summary.deleted}`)
                        console.log(`  Unchanged: ${artifact.plan.summary.unchanged}`)
                    }
                    const totalChanges = artifact.plan.summary.created + artifact.plan.summary.updated + artifact.plan.summary.deleted
                    process.exit(totalChanges > 0 ? 1 : 0)
                }
            }

            // 3. Apply phase
            const applyRes = await fetchJson<{ applied: Record<string, number>, failed: Array<{ error: string }> }>(
                `${destBase}/api/v1/projects/${options.destProject}/replace/apply`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${options.destToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        plan: artifact!.plan,
                        snapshot,
                        force: options.force,
                    }),
                },
            )

            if (applyRes.status === 409) {
                console.error('Error: Destination state has drifted since the plan was created. Re-run plan or pass --force.')
                process.exit(3)
            }

            if (!applyRes.ok && applyRes.status !== 207) {
                console.error(`Error: Apply failed on destination (${applyRes.status}):`, applyRes.data)
                process.exit(applyRes.status >= 500 ? 3 : 4)
            }

            if (options.json) {
                console.log(JSON.stringify(applyRes.data, null, 2))
            }
            else {
                console.log('Project replacement apply finished:')
                console.log(JSON.stringify(applyRes.data.applied, null, 2))
                if (applyRes.data.failed.length > 0) {
                    console.warn(`Warnings: ${applyRes.data.failed.length} items failed to apply.`)
                }
            }

            process.exit(applyRes.data.failed.length > 0 ? 1 : 0)
        }
        catch (err) {
            console.error('Fatal CLI Error:', (err as Error).message)
            process.exit(4)
        }
    })
