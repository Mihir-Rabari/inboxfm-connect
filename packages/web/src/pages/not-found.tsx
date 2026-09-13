import { FileQuestion, Home } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

export default function NotFoundPage() {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center p-8">
      <EmptyState
        icon={FileQuestion}
        title="404 — Page Not Found"
        description="The developer console route you requested does not exist."
      >
        <div className="mt-4">
          <Button size="sm" asChild className="gap-2">
            <Link to="/">
              <Home className="h-4 w-4" />
              <span>Back to Overview</span>
            </Link>
          </Button>
        </div>
      </EmptyState>
    </div>
  )
}
