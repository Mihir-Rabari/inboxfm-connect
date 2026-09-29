import { Bot, Check, ChevronDown, ChevronUp, Eye, EyeOff, Loader2, Plus, Save, Trash2, X } from 'lucide-react'
import * as React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { useAIProvidersQuery, useCreateAIProvider, useUpdateAIProvider, useDeleteAIProvider, useAIProviderModelsQuery, useValidateAIProvider } from '@/lib/query/hooks'
import { toast } from 'sonner'
import type { AIProvider, AIProviderName, CreateAIProviderRequest, UpdateAIProviderRequest, AIProviderAuthConfig, AIProviderConfig, AIProviderModel } from '@inboxfm-connect/shared'

const PROVIDER_INFO: Record<AIProviderName, { name: string; icon: string }> = {
  openai: { name: 'OpenAI', icon: '🤖' },
  openrouter: { name: 'OpenRouter', icon: '🔀' },
  anthropic: { name: 'Anthropic', icon: '🧠' },
  azure: { name: 'Azure OpenAI', icon: '☁️' },
  google: { name: 'Google AI', icon: '🌈' },
  cloudflare_gateway: { name: 'Cloudflare AI Gateway', icon: '🛡️' },
  custom: { name: 'OpenAI Compatible', icon: '🔧' },
  activepieces: { name: 'Activepieces', icon: '⚡' },
  bedrock: { name: 'AWS Bedrock', icon: '☁️' },
  mistral: { name: 'Mistral', icon: '🌬️' },
}

function maskApiKey(key: string): string {
  if (key.length <= 8) return '••••••••'
  return key.slice(0, 4) + '•'.repeat(key.length - 8) + key.slice(-4)
}

export function AIProviderManagement() {
  const providersQuery = useAIProvidersQuery()
  const createMutation = useCreateAIProvider()
  const updateMutation = useUpdateAIProvider()
  const deleteMutation = useDeleteAIProvider()
  const validateMutation = useValidateAIProvider()

  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [showCreate, setShowCreate] = React.useState(false)
  const [newProvider, setNewProvider] = React.useState<AIProviderName>('openai')
  const [newDisplayName, setNewDisplayName] = React.useState('')
  const [newApiKey, setNewApiKey] = React.useState('')
  const [newConfig, setNewConfig] = React.useState<Partial<AIProviderConfig>>({})
  const [newEnabledForChat, setNewEnabledForChat] = React.useState(true)
  const [showApiKey, setShowApiKey] = React.useState<string | null>(null)
  const [expandedProvider, setExpandedProvider] = React.useState<string | null>(null)

  const providers = providersQuery.data || []

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createMutation.mutateAsync({
        provider: newProvider,
        displayName: newDisplayName || PROVIDER_INFO[newProvider].name,
        auth: { apiKey: newApiKey },
        config: newConfig,
        enabledForChat: newEnabledForChat,
      })
      toast.success('Provider created successfully')
      setShowCreate(false)
      setNewDisplayName('')
      setNewApiKey('')
      setNewConfig({})
      setNewEnabledForChat(true)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to create provider'
      toast.error(message)
    }
  }

  const handleUpdate = async (id: string, updates: Partial<UpdateAIProviderRequest>) => {
    try {
      await updateMutation.mutateAsync({ id, request: updates })
      toast.success('Provider updated successfully')
      setEditingId(null)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to update provider'
      toast.error(message)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this provider?')) return
    try {
      await deleteMutation.mutateAsync({ id })
      toast.success('Provider deleted successfully')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to delete provider'
      toast.error(message)
    }
  }

  const handleValidate = async (providerData: CreateAIProviderRequest) => {
    try {
      await validateMutation.mutateAsync(providerData)
      toast.success('Provider credentials are valid!')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Validation failed'
      toast.error(message)
    }
  }

  if (providersQuery.isLoading) {
    return (
      <Card className="border-border shadow-xs">
        <CardHeader>
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            <span>AI Providers</span>
          </CardTitle>
          <CardDescription className="text-xs">Manage AI model providers for chat and tool execution</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Loading providers...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (providersQuery.isError) {
    return (
      <Card className="border-border shadow-xs">
        <CardHeader>
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            <span>AI Providers</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-xs text-destructive">Failed to load providers. Please refresh.</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-border shadow-xs col-span-1 lg:col-span-2">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            <span>AI Providers</span>
          </CardTitle>
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setShowCreate(true)}>
            <Plus className="h-3.5 w-3.5" />
            <span>Add Provider</span>
          </Button>
        </div>
        <CardDescription className="text-xs">Configure AI model providers for chat agents and tool execution</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {showCreate && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3 animate-slide-down">
            <form onSubmit={handleCreate}>
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Provider</Label>
                    <Select value={newProvider} onValueChange={setNewProvider}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select provider" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(PROVIDER_INFO).map(([key, info]) => (
                          <SelectItem key={key} value={key as AIProviderName}>
                            {info.icon} {info.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Display Name</Label>
                    <Input
                      value={newDisplayName}
                      onChange={(e) => setNewDisplayName(e.target.value)}
                      placeholder={PROVIDER_INFO[newProvider].name}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">API Key</Label>
                  <div className="relative">
                    <Input
                      type={showApiKey === 'new' ? 'text' : 'password'}
                      value={newApiKey}
                      onChange={(e) => setNewApiKey(e.target.value)}
                      placeholder="Enter API key"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                      onClick={() => setShowApiKey(showApiKey === 'new' ? null : 'new')}
                    >
                      {showApiKey === 'new' ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="enabledForChat"
                    checked={newEnabledForChat}
                    onCheckedChange={setNewEnabledForChat}
                  />
                  <Label htmlFor="enabledForChat" className="text-xs font-medium cursor-pointer">
                    Enable for chat agents
                  </Label>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowCreate(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={createMutation.isPending} className="gap-1.5">
                    {createMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    <span>Create Provider</span>
                  </Button>
                </div>
              </div>
            </form>
          </div>
        )}

        {providers.length === 0 && !showCreate && (
          <div className="text-center py-8">
            <Bot className="mx-auto h-12 w-12 text-muted-foreground/30" />
            <p className="mt-2 text-sm text-muted-foreground">No AI providers configured yet.</p>
            <Button size="sm" variant="outline" className="mt-2 gap-1.5" onClick={() => setShowCreate(true)}>
              <Plus className="h-3.5 w-3.5" />
              <span>Add Your First Provider</span>
            </Button>
          </div>
        )}

        <div className="space-y-3">
          {providers.map((provider: AIProvider & { auth?: AIProviderAuthConfig }) => {
            const isEditing = editingId === provider.id
            const providerInfo = PROVIDER_INFO[provider.provider]
            const modelsQuery = useAIProviderModelsQuery(provider.provider)

            return (
              <div key={provider.id} className="rounded-lg border border-border bg-card p-4 space-y-3">
                {!isEditing ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{providerInfo?.icon || '🤖'}</span>
                        <div>
                          <p className="font-semibold text-foreground">{provider.displayName}</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                            <span className="px-1.5 py-0.5 text-[10px] rounded bg-muted text-muted-foreground">
                              {provider.provider}
                            </span>
                            <Switch
                              checked={provider.enabledForChat}
                              onCheckedChange={(checked) => handleUpdate(provider.id, { enabledForChat: checked })}
                              disabled={updateMutation.isPending}
                              aria-label="Enable for chat"
                            />
                            <span className="text-[10px] text-muted-foreground">Chat</span>
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 p-0"
                          onClick={() => setExpandedProvider(expandedProvider === provider.id ? null : provider.id)}
                          aria-label={expandedProvider === provider.id ? 'Collapse' : 'Expand'}
                        >
                          {expandedProvider === provider.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 p-0"
                          onClick={() => setEditingId(provider.id)}
                          disabled={updateMutation.isPending}
                        >
                          <Save className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDelete(provider.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {expandedProvider === provider.id && (
                      <div className="rounded-lg bg-muted/30 p-3 space-y-2 text-xs">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-0.5">
                            <span className="text-muted-foreground">Provider</span>
                            <span className="font-mono">{provider.provider}</span>
                          </div>
                          <div className="space-y-0.5">
                            <span className="text-muted-foreground">Status</span>
                            <span className={provider.enabledForChat ? 'text-emerald-600' : 'text-muted-foreground'}>
                              {provider.enabledForChat ? 'Enabled for chat' : 'Disabled for chat'}
                            </span>
                          </div>
                        </div>
                        {modelsQuery.data && modelsQuery.data.length > 0 && (
                          <div className="space-y-1 pt-2 border-t border-border/50">
                            <span className="font-medium text-xs text-muted-foreground">Available Models ({modelsQuery.data.length})</span>
                            <div className="flex flex-wrap gap-1">
                              {modelsQuery.data.slice(0, 8).map((model: AIProviderModel) => (
                                <span key={model.id} className="px-1.5 py-0.5 text-[10px] rounded bg-muted text-muted-foreground hover:bg-muted/80 cursor-default">
                                  {model.name} ({model.type})
                                </span>
                              ))}
                              {modelsQuery.data.length > 8 && (
                                <span className="px-1.5 py-0.5 text-[10px] rounded bg-muted text-muted-foreground">
                                  +{modelsQuery.data.length - 8} more
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                        {provider.auth?.apiKey && (
                          <div className="flex items-center justify-between pt-2 border-t border-border/50">
                            <span className="text-xs text-muted-foreground">API Key</span>
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-xs text-muted-foreground">
                                {maskApiKey(provider.auth.apiKey)}
                              </span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 p-0"
                                onClick={() => setShowApiKey(showApiKey === provider.id ? null : provider.id)}
                              >
                                {showApiKey === provider.id ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                              </Button>
                            </div>
                          </div>
                        )}
                        {(showApiKey === provider.id && provider.auth?.apiKey) && (
                          <div className="rounded bg-muted p-2 font-mono text-xs text-foreground break-all">
                            {provider.auth.apiKey}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <form onSubmit={(e) => { e.preventDefault(); handleUpdate(provider.id, { displayName: newDisplayName || PROVIDER_INFO[provider.provider].name, auth: newApiKey ? { apiKey: newApiKey } : undefined, config: newConfig, enabledForChat: newEnabledForChat }) }}>
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold">Display Name</Label>
                        <Input
                          value={newDisplayName || provider.displayName}
                          onChange={(e) => setNewDisplayName(e.target.value)}
                          defaultValue={provider.displayName}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold">API Key</Label>
                        <div className="relative">
                          <Input
                            type={showApiKey === provider.id ? 'text' : 'password'}
                            value={newApiKey}
                            onChange={(e) => setNewApiKey(e.target.value)}
                            placeholder="Leave blank to keep current"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                            onClick={() => setShowApiKey(showApiKey === provider.id ? null : provider.id)}
                          >
                            {showApiKey === provider.id ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                        <p className="text-[10px] text-muted-foreground">Leave blank to keep current key</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          id={`enabledForChat-${provider.id}`}
                          checked={newEnabledForChat}
                          onCheckedChange={setNewEnabledForChat}
                        />
                        <Label htmlFor={`enabledForChat-${provider.id}`} className="text-xs font-medium cursor-pointer">
                          Enable for chat agents
                        </Label>
                      </div>
                      <div className="flex justify-end gap-2 pt-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => { setEditingId(null); setNewDisplayName(''); setNewApiKey(''); setNewConfig({}); setNewEnabledForChat(true); setShowApiKey(null) }}>
                          Cancel
                        </Button>
                        <Button type="submit" size="sm" disabled={updateMutation.isPending} className="gap-1.5">
                          {updateMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                          <span>Save</span>
                        </Button>
                      </div>
                    </div>
                  </form>
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
