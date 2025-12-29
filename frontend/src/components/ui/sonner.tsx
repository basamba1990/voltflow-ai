import { Toaster as SonnerToaster } from 'sonner'

export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      toastOptions={{
        style: {
          background: 'oklch(0.18 0.04 260)',
          border: '1px solid oklch(0.25 0.08 260 / 0.3)',
          color: 'oklch(0.95 0.02 60)',
          backdropFilter: 'blur(8px)',
        },
        classNames: {
          toast: 'group toast',
          title: 'text-sm font-medium',
          description: 'text-sm text-muted-foreground',
          actionButton: 'px-3 py-1 bg-primary text-primary-foreground rounded-md text-xs',
          cancelButton: 'px-3 py-1 bg-secondary text-secondary-foreground rounded-md text-xs',
          closeButton: 'text-muted-foreground hover:text-foreground',
        },
      }}
    />
  )
}
