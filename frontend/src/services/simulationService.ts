// frontend/src/services/simulationService.ts
import { supabase } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'

type SimulationConfig = {
  geometry_config: any
  boundary_conditions: any
  material_id: string
  mesh_density: 'low' | 'medium' | 'high'
}

type SimulationResult = {
  success: boolean
  simulationId: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  results?: any
  message?: string
}

export class SimulationService {
  static async createSimulation(params: {
    name: string
    description?: string
    geometryType: string
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

  static async updateSimulation(id: string, params: {
    name: string
    description?: string
    geometryType: string
    config: SimulationConfig
  }) {
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      throw new Error('Authentication required')
    }

    const { data: simulation, error } = await supabase
      .from('simulations')
      .update({
        name: params.name,
        description: params.description,
        geometry_type: params.geometryType,
        geometry_config: params.config.geometry_config,
        boundary_conditions: params.config.boundary_conditions,
        material_id: params.config.material_id,
        mesh_density: params.config.mesh_density,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw new Error(`Failed to update simulation: ${error.message}`)
    return simulation
  }

  static async startSimulation(simulationId: string) {
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      throw new Error('Authentication required')
    }

    // Mettre à jour le statut en 'running' avant d'appeler la fonction
    await supabase
      .from('simulations')
      .update({ status: 'running', progress: 5 })
      .eq('id', simulationId)

    // Appeler l'Edge Function
    try {
      const { data, error } = await supabase.functions.invoke('simulate', {
        method: 'POST',
        body: { simulationId },
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      })

      if (error) throw error
      return data as SimulationResult
    } catch (error: any) {
      await supabase
        .from('simulations')
        .update({ status: 'failed', progress: 0 })
        .eq('id', simulationId)
      
      throw new Error(`Simulation failed: ${error.message}`)
    }
  }

  static async uploadGeometry(file: File, simulationId: string) {
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      throw new Error('Authentication required')
    }

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
    const { data, error } = await supabase
      .from('simulation_results')
      .select('*')
      .eq('simulation_id', simulationId)
      .single()

    if (error) throw new Error(`Failed to fetch results: ${error.message}`)
    return data
  }

  static async cancelSimulation(simulationId: string) {
    const { error } = await supabase
      .from('simulations')
      .update({ status: 'cancelled', progress: 0 })
      .eq('id', simulationId)

    if (error) throw new Error(`Failed to cancel simulation: ${error.message}`)
  }

  static async deleteSimulation(simulationId: string) {
    const { error } = await supabase
      .from('simulations')
      .delete()
      .eq('id', simulationId)

    if (error) throw new Error(`Failed to delete simulation: ${error.message}`)
  }
}
