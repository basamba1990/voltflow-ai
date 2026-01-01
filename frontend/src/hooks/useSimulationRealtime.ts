// frontend/src/hooks/useSimulationRealtime.ts
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'

type Simulation = Database['public']['Tables']['simulations']['Row']

export function useSimulationRealtime(simulationId?: string) {
  const [simulation, setSimulation] = useState<Simulation | null>(null)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState<Simulation['status']>('pending')

  useEffect(() => {
    if (!simulationId) return

    // Souscrire aux changements de la table simulations
    const channel = supabase
      .channel(`simulation-${simulationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'simulations',
          filter: `id=eq.${simulationId}`
        },
        (payload) => {
          const newSimulation = payload.new as Simulation
          setSimulation(newSimulation)
          setProgress(newSimulation.progress)
          setStatus(newSimulation.status)
        }
      )
      .subscribe()

    // Charger l'état initial
    const loadInitialState = async () => {
      const { data, error } = await supabase
        .from('simulations')
        .select('*')
        .eq('id', simulationId)
        .single()

      if (!error && data) {
        setSimulation(data)
        setProgress(data.progress)
        setStatus(data.status)
      }
    }

    loadInitialState()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [simulationId])

  return { simulation, progress, status, setSimulation }
}
