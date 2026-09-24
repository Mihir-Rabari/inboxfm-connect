import { ProjectId } from '@inboxfm-connect/core-utils'
import { hooksFactory } from '../../helper/hooks-factory'

// CE default never resolves a per-project override, so the guard always falls
// back to the flat AppSystemProp.PROJECT_EXECUTION_CONCURRENCY_LIMIT. EE/Cloud
// override this (see concurrency-pool-execution-hooks.ts, wired in app.ts) to
// honor a project's assigned `ConcurrencyPoolEntity.maxConcurrentJobs` — an
// existing admin-configurable value (`platform-project-service.ts#update`,
// `managed-authn-service.ts`) that was persisted and cached but never actually
// enforced anywhere before this guard read it back.
export const projectExecutionConcurrencyHooks = hooksFactory.create<ProjectExecutionConcurrencyHooks>(_log => ({
    resolveLimit: async (_projectId: ProjectId): Promise<number | null> => null,
}))

export type ProjectExecutionConcurrencyHooks = {
    resolveLimit(projectId: ProjectId): Promise<number | null>
}
