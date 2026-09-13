import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { CodeLanguage, generateCode } from '@/lib/utils/code-generation'

const LANGUAGES: Array<{ value: CodeLanguage; label: string }> = [
  { value: 'curl', label: 'cURL' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'json', label: 'JSON' },
]

export interface CodeSnippetsProps {
  request: {
    integration: string
    tool: string
    connectionId: string
    input: Record<string, unknown>
  }
}

export function CodeSnippets({ request }: CodeSnippetsProps) {
  const [copiedLanguage, setCopiedLanguage] = useState<CodeLanguage | null>(null)

  const copy = async (language: CodeLanguage) => {
    await navigator.clipboard.writeText(generateCode(language, request))
    setCopiedLanguage(language)
    toast.success(`Copied ${language} snippet`)
    window.setTimeout(() => setCopiedLanguage(null), 1500)
  }

  return (
    <Tabs defaultValue="curl" className="w-full" data-testid="code-snippets">
      <div className="flex items-center justify-between">
        <TabsList variant="pills">
          {LANGUAGES.map((language) => (
            <TabsTrigger key={language.value} value={language.value} variant="pills">
              {language.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <Button
          size="xs"
          variant="outline"
          onClick={() => void copy('curl')}
          className="gap-1"
          aria-label="Copy cURL to clipboard"
        >
          {copiedLanguage === 'curl' ? (
            <Check className="h-3 w-3 text-emerald-500" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
          <span>Copy</span>
        </Button>
      </div>

      {LANGUAGES.map((language) => (
        <TabsContent key={language.value} value={language.value}>
          <div className="relative mt-2">
            <pre className="overflow-auto rounded-md border border-border bg-muted/50 p-3 font-mono text-[11px] leading-relaxed max-h-72">
              {generateCode(language.value, request)}
            </pre>
            <Button
              size="icon-xs"
              variant="outline"
              onClick={() => void copy(language.value)}
              aria-label={`Copy ${language.label} code`}
              className="absolute right-2 top-2 bg-card/90"
            >
              {copiedLanguage === language.value ? (
                <Check className="h-3 w-3 text-emerald-500" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </Button>
          </div>
        </TabsContent>
      ))}
    </Tabs>
  )
}
