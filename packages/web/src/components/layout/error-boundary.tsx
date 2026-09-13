import { Component, ErrorInfo, ReactNode } from 'react'
import { ErrorState } from '@/components/ui/error-state'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in UI boundary:', error, errorInfo)
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: undefined })
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }
      return (
        <div className="flex h-full min-h-[300px] w-full items-center justify-center p-6">
          <ErrorState
            title="Application Error"
            description={
              this.state.error?.message || 'An unexpected rendering error occurred in this view.'
            }
            onRetry={this.handleRetry}
          />
        </div>
      )
    }

    return this.props.children
  }
}
