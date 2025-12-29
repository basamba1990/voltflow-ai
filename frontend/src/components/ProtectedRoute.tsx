import { useAuth } from '@/contexts/AuthContext'
import { Route, useLocation } from 'wouter'
import { Loader2 } from 'lucide-react'

interface ProtectedRouteProps {
  path: string
  component: React.ComponentType
}

export default function ProtectedRoute({ path, component: Component }: ProtectedRouteProps) {
  const { user, loading } = useAuth()
  const [, setLocation] = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!user) {
    setLocation('/')
    return null
  }

  return <Route path={path} component={Component} />
}
