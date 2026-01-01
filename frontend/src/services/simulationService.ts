// frontend/src/services/simulationService.ts
import { supabase } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'

type SimulationConfig = {
  geometry_config: Database['public']['Tables']['simulations']['Row']['geometry_config']
  boundary_conditions: Database['public']['Tables']['simulations']['Row']['boundary_conditions']
  material_id: string
  mesh_density: 'low' | 'medium' | 'high'
}

type SimulationResult = {
  success: boolean
  simulationId: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  results?: {
    max_temperature: number
    min_temperature: number
    pressure_drop: number
    thermal_efficiency: number
    temperature_data: Array<{ x: number; y: number; z: number }>
    convergence_metrics: { iterations: number; loss: number; convergence_rate: number }
  }
  message?: string
}

export class SimulationService {
  static async createSimulation(params: {
    name: string
    description?: string
    geometryType: 'tube' | 'plate' | 'coil' | 'custom'
    config: SimulationConfig
  }) {
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      throw new Error('Authentication required')
    }

    const { data: simulation, error } = await supabase
      .from('simulations')
      .insert({
        user_id: session.user.id,
        name: params.name,
        description: params.description,
        geometry_type: params.geometryType,
        geometry_config: params.config.geometry_config,
        boundary_conditions: params.config.boundary_conditions,
        material_id: params.config.material_id,
        mesh_density: params.config.mesh_density,
        status: 'pending',
        progress: 0
      })
      .select()
      .single()

    if (error) throw new Error(`Failed to create simulation: ${error.message}`)
    return simulation
  }

  static async startSimulation(simulationId: string) {
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      throw new Error('Authentication required')
    }

    // Récupérer la configuration de la simulation
    const { data: simulation, error: fetchError } = await supabase
      .from('simulations')
      .select('geometry_config, boundary_conditions')
      .eq('id', simulationId)
      .eq('user_id', session.user.id)
      .single()

    if (fetchError || !simulation) {
      throw new Error('Simulation not found or unauthorized')
    }

    // Appeler l'Edge Function
    const { data, error } = await supabase.functions.invoke('simulate', {
      method: 'POST',
      body: {
        simulationId,
        config: {
          geometry_config: simulation.geometry_config,
          boundary_conditions: simulation.boundary_conditions
        }
      },
      headers: {
        Authorization: `Bearer ${session.access_token}`
      }
    })

    if (error) {
      // Mettre à jour le statut en cas d'erreur
      await supabase
        .from('simulations')
        .update({ status: 'failed', progress: 0 })
        .eq('id', simulationId)
      
      throw new Error(`Simulation failed: ${error.message}`)
    }

    return data as SimulationResult
  }

  static async uploadGeometry(file: File, simulationId: string) {
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      throw new Error('Authentication required')
    }

    // Convertir en base64
    const arrayBuffer = await file.arrayBuffer()
    const base64String = btoa(
      String.fromCharCode(...new Uint8Array(arrayBuffer))
    )

    const { data, error } = await supabase.functions.invoke('upload-geometry', {
      method: 'POST',
      body: {
        fileName: file.name,
        fileData: base64String,
        fileType: file.type,
        simulationId,
        userId: session.user.id
      },
      headers: {
        Authorization: `Bearer ${session.access_token}`
      }
    })

    if (error) throw new Error(`Upload failed: ${error.message}`)
    return data
  }

  static async getSimulationResults(simulationId: string) {
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      throw new Error('Authentication required')
    }

    const { data, error } = await supabase
      .from('simulation_results')
      .select('*')
      .eq('simulation_id', simulationId)
      .single()

    if (error) throw new Error(`Failed to fetch results: ${error.message}`)
    return data
  }

  static async cancelSimulation(simulationId: string) {
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      throw new Error('Authentication required')
    }

    const { error } = await supabase
      .from('simulations')
      .update({ status: 'cancelled', progress: 0 })
      .eq('id', simulationId)
      .eq('user_id', session.user.id)

    if (error) throw new Error(`Failed to cancel simulation: ${error.message}`)
  }
}
