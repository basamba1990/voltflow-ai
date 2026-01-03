// FICHIER UNIFIÉ ET COMPLET : frontend/src/services/simulation.service.ts

import { supabase, handleSupabaseError } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

// -----------------------------------------------------------------------------
// TYPES
// -----------------------------------------------------------------------------

export type Simulation = Database['public']['Tables']['simulations']['Row'];
export type SimulationInsert = Database['public']['Tables']['simulations']['Insert'];
export type SimulationUpdate = Database['public']['Tables']['simulations']['Update'];
export type SimulationResult = Database['public']['Tables']['simulation_results']['Row'];

export type SimulationStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type MeshDensity = 'low' | 'medium' | 'high';
export type CoolingType = 'natural_convection' | 'forced_convection' | 'radiation';
export type FluidType = 'air' | 'water' | 'oil';

export interface SimulationConfig {
  geometry_config: {
    type: string;
    file_url?: string;
    file_name?: string;
    dimensions?: Record<string, number>;
  };
  boundary_conditions: {
    initial_temp: number;
    ambient_temp: number;
    cooling_type: CoolingType;
    convection_coeff: number;
    fluid_type: FluidType;
    fluid_velocity: number;
  };
  material_id: string;
  mesh_density: MeshDensity;
}

export interface CreateSimulationParams {
  name: string;
  description?: string;
  geometryType: string;
  config: SimulationConfig;
}

export interface StartSimulationResponse {
  success: boolean;
  simulationId: string;
  status: SimulationStatus;
  results?: any;
  message?: string;
}

// -----------------------------------------------------------------------------
// 1. FONCTIONS DE RÉCUPÉRATION (GET)
// -----------------------------------------------------------------------------

/**
 * Récupère les simulations de l'utilisateur connecté
 */
export const getSimulations = async (
  options: {
    limit?: number;
    status?: SimulationStatus;
    offset?: number;
  } = {}
): Promise<Simulation[]> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Utilisateur non authentifié');
    
    const { 
      limit = 10, 
      status, 
      offset = 0 
    } = options;
    
    let query = supabase
      .from('simulations')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (status) {
      query = query.eq('status', status);
    }
    
    const { data, error } = await query;
    
    if (error) {
      throw handleSupabaseError(error, 'getSimulations', { userId: session.user.id });
    }
    
    return data || [];
  } catch (error: any) {
    console.error('❌ Erreur getSimulations:', error);
    throw error;
  }
};

/**
 * Récupère une simulation par son ID
 */
export const getSimulationById = async (simulationId: string): Promise<Simulation | null> => {
  try {
    const { data, error } = await supabase
      .from('simulations')
      .select('*')
      .eq('id', simulationId)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw handleSupabaseError(error, 'getSimulationById', { simulationId });
    }
    
    return data;
  } catch (error: any) {
    console.error('❌ Erreur getSimulationById:', error);
    throw error;
  }
};

// -----------------------------------------------------------------------------
// 2. CRÉATION ET MISE À JOUR
// -----------------------------------------------------------------------------

/**
 * Crée une nouvelle simulation
 */
export const createSimulation = async (
  params: CreateSimulationParams
): Promise<Simulation> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Authentication required');
    
    const newSimulation = {
      user_id: session.user.id,
      name: params.name,
      description: params.description,
      geometry_type: params.geometryType,
      geometry_config: params.config.geometry_config,
      boundary_conditions: params.config.boundary_conditions,
      material_id: params.config.material_id,
      mesh_density: params.config.mesh_density,
      status: 'pending' as SimulationStatus,
      progress: 0
    };
    
    const { data, error } = await supabase
      .from('simulations')
      .insert(newSimulation)
      .select()
      .single();
    
    if (error) throw new Error(`Failed to create simulation: ${error.message}`);
    return data;
  } catch (error: any) {
    console.error('❌ Erreur createSimulation:', error);
    throw error;
  }
};

/**
 * Met à jour une simulation existante
 */
export const updateSimulation = async (
  simulationId: string,
  params: Partial<CreateSimulationParams>
): Promise<Simulation> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Authentication required');
    
    const updateData: any = {
      updated_at: new Date().toISOString()
    };
    
    if (params.name) updateData.name = params.name;
    if (params.description !== undefined) updateData.description = params.description;
    if (params.geometryType) updateData.geometry_type = params.geometryType;
    if (params.config) {
      if (params.config.geometry_config) updateData.geometry_config = params.config.geometry_config;
      if (params.config.boundary_conditions) updateData.boundary_conditions = params.config.boundary_conditions;
      if (params.config.material_id) updateData.material_id = params.config.material_id;
      if (params.config.mesh_density) updateData.mesh_density = params.config.mesh_density;
    }
    
    const { data, error } = await supabase
      .from('simulations')
      .update(updateData)
      .eq('id', simulationId)
      .eq('user_id', session.user.id)
      .select()
      .single();
    
    if (error) throw new Error(`Failed to update simulation: ${error.message}`);
    return data;
  } catch (error: any) {
    console.error('❌ Erreur updateSimulation:', error);
    throw error;
  }
};

// -----------------------------------------------------------------------------
// 3. LANCEMENT DE SIMULATION (EDGE FUNCTION)
// -----------------------------------------------------------------------------

/**
 * Démarre une simulation via l'Edge Function
 */
export const startSimulation = async (simulationId: string): Promise<StartSimulationResponse> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Authentication required');
    
    // 1. Récupérer la configuration complète de la simulation
    const { data: simulation, error: fetchError } = await supabase
      .from('simulations')
      .select('config, status')
      .eq('id', simulationId)
      .single();
    
    if (fetchError) throw new Error(`Simulation not found: ${fetchError.message}`);
    if (simulation.status !== 'pending') {
      throw new Error(`Simulation already ${simulation.status}`);
    }
    
    // 2. Mettre à jour le statut en "running"
    await supabase
      .from('simulations')
      .update({ 
        status: 'running', 
        progress: 5,
        started_at: new Date().toISOString()
      })
      .eq('id', simulationId);
    
    // 3. Appeler l'Edge Function
    const { data, error } = await supabase.functions.invoke('simulate', {
      body: { 
        simulationId, 
        config: simulation.config 
      },
      headers: {
        Authorization: `Bearer ${session.access_token}`
      }
    });
    
    if (error) {
      // En cas d'erreur, marquer la simulation comme échouée
      await supabase
        .from('simulations')
        .update({ 
          status: 'failed', 
          progress: 0,
          error_message: error.message 
        })
        .eq('id', simulationId);
      
      throw new Error(`Simulation failed: ${error.message}`);
    }
    
    return data as StartSimulationResponse;
  } catch (error: any) {
    console.error('❌ Erreur startSimulation:', error);
    throw error;
  }
};

// -----------------------------------------------------------------------------
// 4. UPLOAD DE GÉOMÉTRIE
// -----------------------------------------------------------------------------

/**
 * Upload un fichier de géométrie (STL, STEP, etc.)
 */
export const uploadGeometry = async (
  file: File, 
  simulationId: string, 
  geometryConfig?: any
): Promise<{ success: boolean; fileUrl: string; path: string }> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Authentication required');
    
    // Convertir le fichier en base64
    const arrayBuffer = await file.arrayBuffer();
    const base64String = btoa(
      String.fromCharCode(...new Uint8Array(arrayBuffer))
    );
    
    // Appeler l'Edge Function d'upload
    const { data, error } = await supabase.functions.invoke('upload-geometry', {
      method: 'POST',
      body: {
        fileName: file.name,
        fileData: base64String,
        fileType: file.type,
        simulationId,
        userId: session.user.id,
        geometry_config: geometryConfig
      },
      headers: {
        Authorization: `Bearer ${session.access_token}`
      }
    });
    
    if (error) throw new Error(`Upload failed: ${error.message}`);
    
    // Mettre à jour la simulation avec l'URL du fichier
    if (data.success && data.fileUrl) {
      await supabase
        .from('simulations')
        .update({
          geometry_config: {
            ...geometryConfig,
            file_url: data.fileUrl,
            file_name: file.name,
            file_size: data.fileSize
          }
        })
        .eq('id', simulationId);
    }
    
    return data;
  } catch (error: any) {
    console.error('❌ Erreur uploadGeometry:', error);
    throw error;
  }
};

// -----------------------------------------------------------------------------
// 5. RÉSULTATS ET ANALYSE
// -----------------------------------------------------------------------------

/**
 * Récupère les résultats d'une simulation
 */
export const getSimulationResults = async (simulationId: string): Promise<SimulationResult | null> => {
  try {
    const { data, error } = await supabase
      .from('simulation_results')
      .select('*')
      .eq('simulation_id', simulationId)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to fetch results: ${error.message}`);
    }
    
    return data;
  } catch (error: any) {
    console.error('❌ Erreur getSimulationResults:', error);
    throw error;
  }
};

/**
 * Télécharge les résultats sous forme de fichier
 */
export const downloadSimulationResults = async (simulationId: string): Promise<void> => {
  try {
    const results = await getSimulationResults(simulationId);
    if (!results) throw new Error('No results available');
    
    const dataStr = JSON.stringify(results, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const downloadUrl = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `simulation-results-${simulationId}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(downloadUrl);
  } catch (error: any) {
    console.error('❌ Erreur downloadSimulationResults:', error);
    throw error;
  }
};

// -----------------------------------------------------------------------------
// 6. GESTION DE SIMULATION (ANNULATION, SUPPRESSION)
// -----------------------------------------------------------------------------

/**
 * Annule une simulation en cours
 */
export const cancelSimulation = async (simulationId: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('simulations')
      .update({ 
        status: 'cancelled', 
        progress: 0,
        cancelled_at: new Date().toISOString()
      })
      .eq('id', simulationId);
    
    if (error) throw new Error(`Failed to cancel simulation: ${error.message}`);
  } catch (error: any) {
    console.error('❌ Erreur cancelSimulation:', error);
    throw error;
  }
};

/**
 * Supprime une simulation
 */
export const deleteSimulation = async (simulationId: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('simulations')
      .delete()
      .eq('id', simulationId);
    
    if (error) throw new Error(`Failed to delete simulation: ${error.message}`);
  } catch (error: any) {
    console.error('❌ Erreur deleteSimulation:', error);
    throw error;
  }
};

// -----------------------------------------------------------------------------
// 7. ABONNEMENTS TEMPS RÉEL
// -----------------------------------------------------------------------------

export type SimulationChannel = ReturnType<typeof supabase.channel>;

/**
 * S'abonne aux mises à jour temps réel d'une simulation
 */
export const subscribeToSimulation = (
  simulationId: string,
  callback: (payload: {
    new: Simulation;
    old: Simulation;
    eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  }) => void
): SimulationChannel => {
  if (!simulationId) {
    throw new Error('Simulation ID requis pour l\'abonnement');
  }
  
  const channel = supabase
    .channel(`simulation-updates-${simulationId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'simulations',
        filter: `id=eq.${simulationId}`
      },
      (payload) => {
        callback(payload as any);
      }
    )
    .subscribe((status) => {
      console.log(`📡 Statut abonnement ${simulationId}:`, status);
    });
  
  return channel;
};

/**
 * Se désabonne d'un canal
 */
export const unsubscribeFromChannel = (channel: SimulationChannel): void => {
  if (channel) {
    supabase.removeChannel(channel);
  }
};

// -----------------------------------------------------------------------------
// 8. UTILITAIRES ET STATISTIQUES
// -----------------------------------------------------------------------------

/**
 * Compte les simulations par statut
 */
export const getSimulationStats = async (): Promise<{
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
}> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Authentication required');
    
    const { data, error } = await supabase
      .from('simulations')
      .select('status')
      .eq('user_id', session.user.id);
    
    if (error) throw error;
    
    return {
      total: data.length,
      pending: data.filter(s => s.status === 'pending').length,
      running: data.filter(s => s.status === 'running').length,
      completed: data.filter(s => s.status === 'completed').length,
      failed: data.filter(s => s.status === 'failed').length
    };
  } catch (error: any) {
    console.error('❌ Erreur getSimulationStats:', error);
    throw error;
  }
};

/**
 * Vérifie si l'utilisateur a atteint sa limite de simulations
 */
export const checkSimulationLimit = async (): Promise<{
  canRun: boolean;
  used: number;
  limit: number;
  remaining: number;
}> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Authentication required');
    
    // Récupérer le profil utilisateur
    const { data: profile, error } = await supabase
      .from('users')
      .select('simulations_used, simulations_limit')
      .eq('id', session.user.id)
      .single();
    
    if (error) throw error;
    
    const used = profile.simulations_used || 0;
    const limit = profile.simulations_limit || 10;
    
    return {
      canRun: used < limit,
      used,
      limit,
      remaining: limit - used
    };
  } catch (error: any) {
    console.error('❌ Erreur checkSimulationLimit:', error);
    throw error;
  }
};

// -----------------------------------------------------------------------------
// 9. EXPORT DE LA CLASSE POUR LA COMPATIBILITÉ (OPTIONNEL)
// -----------------------------------------------------------------------------

/**
 * Classe wrapper pour la compatibilité avec le code existant
 * @deprecated Utilisez les fonctions exportées directement
 */
export class SimulationService {
  static async createSimulation(params: CreateSimulationParams) {
    return createSimulation(params);
  }
  
  static async updateSimulation(id: string, params: Partial<CreateSimulationParams>) {
    return updateSimulation(id, params);
  }
  
  static async startSimulation(simulationId: string) {
    return startSimulation(simulationId);
  }
  
  static async uploadGeometry(file: File, simulationId: string) {
    return uploadGeometry(file, simulationId);
  }
  
  static async getSimulationResults(simulationId: string) {
    return getSimulationResults(simulationId);
  }
  
  static async cancelSimulation(simulationId: string) {
    return cancelSimulation(simulationId);
  }
  
  static async deleteSimulation(simulationId: string) {
    return deleteSimulation(simulationId);
  }
}

// Export par défaut pour la compatibilité
export default {
  getSimulations,
  getSimulationById,
  createSimulation,
  updateSimulation,
  startSimulation,
  uploadGeometry,
  getSimulationResults,
  downloadSimulationResults,
  cancelSimulation,
  deleteSimulation,
  subscribeToSimulation,
  unsubscribeFromChannel,
  getSimulationStats,
  checkSimulationLimit,
  SimulationService
};
