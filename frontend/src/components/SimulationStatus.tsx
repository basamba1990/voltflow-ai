// frontend/src/components/SimulationStatus.tsx
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { 
  Clock, 
  Play, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Pause
} from "lucide-react"

interface SimulationStatusProps {
  progress: number
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  estimatedDuration?: number
  className?: string
}

export function SimulationStatus({ 
  progress, 
  status, 
  estimatedDuration,
  className 
}: SimulationStatusProps) {
  const statusConfig = {
    pending: {
      label: 'Pending',
      icon: Clock,
      color: 'bg-yellow-500',
      textColor: 'text-yellow-600 dark:text-yellow-400'
    },
    running: {
      label: 'Running',
      icon: Play,
      color: 'bg-blue-500',
      textColor: 'text-blue-600 dark:text-blue-400'
    },
    completed: {
      label: 'Completed',
      icon: CheckCircle,
      color: 'bg-green-500',
      textColor: 'text-green-600 dark:text-green-400'
    },
    failed: {
      label: 'Failed',
      icon: XCircle,
      color: 'bg-red-500',
      textColor: 'text-red-600 dark:text-red-400'
    },
    cancelled: {
      label: 'Cancelled',
      icon: Pause,
      color: 'bg-gray-500',
      textColor: 'text-gray-600 dark:text-gray-400'
    }
  }

  const config = statusConfig[status] || statusConfig.pending
  const Icon = config.icon

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge 
            className={cn(
              config.color,
              "text-white font-medium px-2 py-1"
            )}
          >
            <Icon className="w-3 h-3 mr-1" />
            {config.label}
          </Badge>
          
          {estimatedDuration && status === 'running' && (
            <span className="text-xs text-muted-foreground">
              ~{estimatedDuration}s remaining
            </span>
          )}
        </div>
        
        <span className={cn(
          "text-sm font-medium",
          config.textColor
        )}>
          {progress}%
        </span>
      </div>
      
      <Progress 
        value={progress} 
        className={cn(
          "h-2",
          status === 'failed' && "bg-red-100 dark:bg-red-900/20",
          status === 'completed' && "bg-green-100 dark:bg-green-900/20"
        )}
      />
      
      {status === 'failed' && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 dark:bg-red-950 dark:border-red-900 dark:text-red-300">
          <p className="font-medium mb-1 flex items-center gap-1">
            <AlertCircle className="w-4 h-4" />
            Suggestion de Correction (CFD-Copilot)
          </p>
          <p>La simulation a échoué ou présente une forte incertitude. Selon les principes **SNPGP & Sidecar**, veuillez essayer :</p>
          <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5">
            <li>**Maillage Adaptatif** : Augmentez la densité du maillage pour les géométries complexes.</li>
            <li>**Contraintes Physiques** : Vérifiez que vos conditions aux limites respectent les lois de conservation (masse/énergie).</li>
            <li>**Ajustement Sidecar** : Si vous utilisez un matériau personnalisé, assurez-vous que ses propriétés thermiques sont dans une plage réaliste.</li>
          </ul>
        </div>
      )}
    </div>
  )
}
