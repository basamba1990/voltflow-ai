import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import SimulationService from '@/services/simulation.service'
import type { Database } from '@/lib/database.types'

type Simulation = Database['public']['Tables']['simulations']['Row'] & {
  simulation_results?: Database['public']['Tables']['simulation_results']['Row'][]
}

export function useSimulationRealtime(simulationId?: string) {
  const [simulation, setSimulation] = useState<Simulation | null>(null)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState<Simulation['status']>('pending')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  
  const currentStatusRef = useRef<string>('pending')
  const MAX_RETRIES = 5

  const refresh = useCallback(async (force = false) => {
    if (!simulationId) return
    
    try {
      // Utiliser le service pour forcer la récupération
      console.log(`[REALTIME] Refreshing simulation ${simulationId}${force ? ' (FORCE)' : ''}`)
      
      // Tentative 1: Récupération complète avec jointure
      let data = await SimulationService.getSimulationById(simulationId)
      
      if (!data && force) {
        // Tentative 2: Récupération simple sans jointure
        const { data: simData } = await supabase
          .from('simulations')
          .select('*')
          .eq('id', simulationId)
          .single()
          
        if (simData) {
          // Récupérer les résultats séparément
          const results = await SimulationService.getSimulationResults(simulationId)
          data = { ...simData, simulation_results: results ? [results] : [] } as Simulation
        }
      }
      
      if (data) {
        setSimulation(data)
        setProgress(data.progress)
        setStatus(data.status)
        currentStatusRef.current = data.status
        
        // DEBUG: Log des résultats
        console.log(`[REALTIME] Refresh successful. Status: ${data.status}, Progress: ${data.progress}%`)
        console.log(`[REALTIME] Has results: ${data.simulation_results?.length || 0}`)
        if (data.simulation_results?.[0]) {
          console.log('[REALTIME] Results data:', {
            id: data.simulation_results[0].id,
            max_temp: data.simulation_results[0].max_temperature,
            efficiency: data.simulation_results[0].thermal_efficiency
          })
        }
      }
    } catch (err: any) {
      console.error('[REALTIME] Error refreshing simulation:', err)
      
      // Retry logic pour les simulations terminées sans résultats
      if (simulation?.status === 'completed' && !simulation?.simulation_results?.[0] && retryCount < MAX_RETRIES) {
        setTimeout(() => {
          setRetryCount(prev => prev + 1)
          refresh(true)
        }, 2000 * (retryCount + 1))
      }
    }
  }, [simulationId, simulation?.status, retryCount])

  useEffect(() => {
    if (!simulationId) return

    // Initial load
    const loadInitial = async () => {
      setLoading(true)
      setError(null)
      try {
        await refresh(true)
      } catch (err: any) {
        setError(err.message || 'Erreur lors du chargement')
      } finally {
        setLoading(false)
      }
    }

    loadInitial()

    // 1. Abonnement aux changements de simulation
    const simChannel = supabase
      .channel(`sim-changes-${simulationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'simulations',
          filter: `id=eq.${simulationId}`
        },
        async (payload) => {
          console.log('[REALTIME] Simulation change:', payload.eventType, payload.new)
          const newSim = payload.new as Simulation
          
          // Forcer un refresh complet si le statut change
          if (newSim.status !== currentStatusRef.current) {
            console.log(`[REALTIME] Status changed from ${currentStatusRef.current} to ${newSim.status}`)
            await refresh(true)
          } else {
            // Mise à jour incrémentale
            setSimulation(prev => prev ? { ...prev, ...newSim } : newSim)
            setProgress(newSim.progress)
            setStatus(newSim.status)
            currentStatusRef.current = newSim.status
          }
        }
      )
      .subscribe(status => {
        console.log(`[REALTIME] Simulation subscription:`, status)
      })

    // 2. Abonnement direct aux résultats
    const resultsChannel = supabase
      .channel(`results-changes-${simulationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'simulation_results',
          filter: `simulation_id=eq.${simulationId}`
        },
        async (payload) => {
          console.log('[REALTIME] Results change detected:', payload.eventType)
          await refresh(true)
        }
      )
      .subscribe(status => {
        console.log(`[REALTIME] Results subscription:`, status)
      })

    return () => {
      supabase.removeChannel(simChannel)
      supabase.removeChannel(resultsChannel)
    }
  }, [simulationId, refresh])

  return { 
    simulation, 
    progress, 
    status, 
    loading, 
    error, 
    refresh: () => refresh(true),
    retryCount
  }
}
