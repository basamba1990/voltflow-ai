import React from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from './ui/button'

interface Props {
  children: React.ReactNode
  fallback?: React.ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    
    // Log to error reporting service
    if (import.meta.env.PROD) {
      // You would integrate with your error reporting service here
      // e.g., Sentry.captureException(error, { extra: errorInfo })
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
          <div className="max-w-md w-full p-8 rounded-xl bg-card border border-destructive/50 shadow-lg">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-destructive/20 flex items-center justify-center mb-4">
                <AlertTriangle className="w-8 h-8 text-destructive" />
              </div>
              
              <h2 className="text-2xl font-bold mb-2">Something went wrong</h2>
              
              <p className="text-muted-foreground mb-4">
                {this.state.error?.message || 'An unexpected error occurred'}
              </p>

              {import.meta.env.DEV && this.state.error && (
                <div className="w-full mb-6 p-4 rounded-lg bg-background border border-border text-left overflow-auto">
                  <pre className="text-xs text-muted-foreground">
                    {this.state.error.stack}
                  </pre>
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  onClick={this.handleReset}
                  className="bg-primary hover:bg-primary/90 gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Reload Application
                </Button>
                
                <Button
                  variant="outline"
                  onClick={() => window.location.href = '/'}
                >
                  Go Home
                </Button>
              </div>

              <p className="text-xs text-muted-foreground mt-6">
                If the problem persists, contact support.
              </p>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
