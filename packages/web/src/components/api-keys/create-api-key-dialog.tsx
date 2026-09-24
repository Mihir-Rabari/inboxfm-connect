import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Project } from '@/lib/api/types'

type KeyScope = 'project' | 'platform'

function resolveProjectId({ selectedProjectId, defaultProjectId, projects }: {
  selectedProjectId: string
  defaultProjectId?: string
  projects: Project[]
}): string {
  return selectedProjectId || defaultProjectId || projects[0]?.id || ''
}

export interface CreateApiKeyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projects: Project[]
  defaultProjectId?: string
  canCreatePlatformKey: boolean
  creatingProjectKey: boolean
  creatingPlatformKey: boolean
  onCreateProjectKey: (args: { displayName: string, projectId: string }) => void
  onCreatePlatformKey: (args: { displayName: string }) => void
}

export function CreateApiKeyDialog({
  open,
  onOpenChange,
  projects,
  defaultProjectId,
  canCreatePlatformKey,
  creatingProjectKey,
  creatingPlatformKey,
  onCreateProjectKey,
  onCreatePlatformKey,
}: CreateApiKeyDialogProps) {
  const [scope, setScope] = useState<KeyScope>('project')
  const [displayName, setDisplayName] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState('')

  const effectiveProjectId = resolveProjectId({ selectedProjectId, defaultProjectId, projects })
  const isCreating = scope === 'project' ? creatingProjectKey : creatingPlatformKey
  const canSubmit = displayName.trim().length > 0 && (scope === 'platform' || !!effectiveProjectId)

  const handleCreate = () => {
    if (!canSubmit) return
    if (scope === 'project') {
      onCreateProjectKey({ displayName: displayName.trim(), projectId: effectiveProjectId })
      return
    }
    onCreatePlatformKey({ displayName: displayName.trim() })
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setScope('project')
      setDisplayName('')
      setSelectedProjectId('')
    }
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Create API key</DialogTitle>
          <DialogDescription>
            Name the key and choose its scope. The raw value is shown once, right after creation.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={scope} onValueChange={(value) => setScope(value === 'platform' ? 'platform' : 'project')}>
          <TabsList variant="pills">
            <TabsTrigger value="project">Project key (cak-)</TabsTrigger>
            {canCreatePlatformKey && <TabsTrigger value="platform">Platform key (sk-)</TabsTrigger>}
          </TabsList>
        </Tabs>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground" htmlFor="api-key-name">
              Name
            </label>
            <Input
              id="api-key-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="e.g. Production backend"
              autoFocus
            />
          </div>

          {scope === 'project' ? (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground" htmlFor="api-key-project">
                Project
              </label>
              {projects.length > 1 ? (
                <select
                  id="api-key-project"
                  value={effectiveProjectId}
                  onChange={(event) => setSelectedProjectId(event.target.value)}
                  className="flex h-9 w-full cursor-pointer rounded-md border border-input bg-card px-3 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.displayName}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  {projects[0]?.displayName ?? 'Current project'}
                </p>
              )}
              <p className="text-[11px] text-muted-foreground">
                This key can only authenticate Connect API calls for the selected project.
              </p>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              This key authenticates as the whole platform and can reach every project. Treat it like a root
              credential.
            </p>
          )}
        </div>

        <DialogFooter className="mt-4 gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={() => handleOpenChange(false)} disabled={isCreating}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleCreate} loading={isCreating} disabled={!canSubmit}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
