import { Component, type ErrorInfo, type ReactNode } from 'react'
import * as logger from '../../shared/logger'

interface Props {
  children: ReactNode
  fallback?: (props: { error: Error; reset: () => void }) => ReactNode
  onError?: (error: Error, info: ErrorInfo) => void
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (this.props.onError) this.props.onError(error, info)
    logger.error('[Venice Forge ErrorBoundary]', error, info)
  }

  reset = () => this.setState({ error: null })

  render() {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback({ error: this.state.error, reset: this.reset })
      }
      return <DefaultFallback error={this.state.error} reset={this.reset} />
    }
    return this.props.children
  }
}

// Default fallback for error boundary
function DefaultFallback({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center" role="alert">
      <div className="max-w-md">
        <div className="text-[20px] font-semibold text-text-primary mb-2">Something went wrong</div>
        <p className="text-[14px] text-text-secondary mb-4">
          The app hit an unexpected error and couldn&apos;t render this view. Your work is safe — refresh to recover.
        </p>
        <details className="mb-5 text-left">
          <summary className="text-[13px] text-text-muted cursor-pointer hover:text-text-secondary">Show details</summary>
          <pre className="mt-2 text-[12px] text-red-300/70 bg-surface-muted border border-border rounded-lg p-3 overflow-auto max-h-40 whitespace-pre-wrap break-words">
            {error.message}
            {error.stack ? `\n\n${error.stack}` : ''}
          </pre>
        </details>
        <div className="flex gap-2 justify-center">
          <button
            onClick={reset}
            className="px-4 py-2 text-[14px] font-medium bg-text-primary text-bg rounded-md hover:bg-text-primary/90 transition-colors"
          >
            Try again
          </button>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-[14px] font-medium border border-border text-text-secondary hover:text-text-primary hover:border-border-strong rounded-md transition-colors"
          >
            Reload page
          </button>
        </div>
      </div>
    </div>
  )
}
