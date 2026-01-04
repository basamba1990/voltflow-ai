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
        progress: 0,
        // NOUVEAU: Ajout du score de risque initial basé sur la méthodologie SNPGP (pasted_content.txt)
        risk_analysis_score: SimulationService.calculateInitialRisk(params.config)
      })
      .select()
      .single()

    if (error) throw new Error(`Failed to create simulation: ${error.message}`)
    return simulation
  }

  // NOUVELLE MÉTHODE: Calcul du score de risque initial (basé sur SNPGP & Sidecar)
  static calculateInitialRisk(config: SimulationConfig): number {
    // Calcul de base: basé sur la différence de température (risque thermique)
    const initialTemp = parseFloat(config.boundary_conditions.initial_temp);
    const ambientTemp = parseFloat(config.boundary_conditions.ambient_temp);
    const tempDifference = Math.abs(initialTemp - ambientTemp);
    
    // Le score de risque est une valeur entre 0 et 100.
    // Si la différence de température est très élevée (e.g., > 500°C), le risque est maximal.
    const maxTempDiff = 500; 
    let riskScore = Math.min(100, (tempDifference / maxTempDiff) * 100);
    
    // Ajustement basé sur le matériau (selon l'article sur les alliages AM)
    if (config.material_id === 'al-er-zr-ni-am') {
      // Si le matériau est le nouvel alliage haute performance, réduire le risque de 20%
      // car il est conçu pour résister à de fortes contraintes thermiques.
      riskScore *= 0.8; 
    }
    
    // Ajustement basé sur la densité du maillage (une faible densité peut masquer des risques)
    // Selon le document, les géométries complexes nécessitent un maillage adaptatif.
    if (config.mesh_density === 'low') {
      riskScore += 15; // Augmenter le risque si la précision est faible
    }
    
    // Détection de conditions hors distribution (Domain Shift potentiel)
    if (tempDifference > 400 || parseFloat(config.boundary_conditions.fluid_velocity) > 10) {
      riskScore += 20; // Risque d'incertitude SNPGP élevé
    }
    
    return Math.round(Math.min(100, riskScore));
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
