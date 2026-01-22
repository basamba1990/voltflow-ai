import { supabase, handleSupabaseError } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

export type Simulation = Database['public']['Tables']['simulations']['Row'] & {
  simulation_results?: Database['public']['Tables']['simulation_results']['Row'][];
};

export type SimulationInsert = Database['public']['Tables']['simulations']['Insert'];
export type SimulationUpdate = Database['public']['Tables']['simulations']['Update'];
export type SimulationResult = Database['public']['Tables']['simulation_results']['Row'];

export type SimulationStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type MeshDensity = 'low' | 'medium' | 'high';
export type CoolingType = 'natural_convection' | 'forced_convection' | 'radiation';
export type FluidType = 'air' | 'water' | 'oil';
export type SolverType = 'fem_fortran' | 'openfoam' | 'comsol' | 'ansys';

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
  solver_type: SolverType;
}

export interface CreateSimulationParams {
  name: string;
  description?: string;
  geometryType: string;
  config: SimulationConfig;
}

export interface StartSimulationResponse {
  success: boolean;
  simulation_id: string;
  status: SimulationStatus;
  results?: any;
  message?: string;
  task_id?: string;
}

export interface UploadGeometryResponse {
  success: boolean;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  fileType: string;
}

// -----------------------------------------------------------------------------
// FONCTIONS DE RÉCUPÉRATION - OPTIMISÉES AVEC CACHE ET RETRY
// -----------------------------------------------------------------------------
export const getSimulations = async (
  options: {
    limit?: number;
    status?: SimulationStatus;
    offset?: number;
    refresh?: boolean;
  } = {}
): Promise<Simulation[]> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Utilisateur non authentifié');

    const { limit = 50, status, offset = 0, refresh = false } = options;
    
    // Gestion du cache
    const cacheKey = `simulations_${session.user.id}_${limit}_${offset}_${status || 'all'}`;
    if (!refresh) {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < 30000) { // 30 secondes de cache
          return data;
        }
      }
    }

    let query = supabase
      .from('simulations')
      .select(`
        *,
        simulation_results (*),
        materials (id, name, conductivity, density)
      `)
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error, count } = await query;

    if (error) {
      const supabaseError = handleSupabaseError(error, 'getSimulations', {
        userId: session.user.id,
        options
      });
      throw new Error(supabaseError.userMessage);
    }

    // Mise en cache
    sessionStorage.setItem(cacheKey, JSON.stringify({
      data: data || [],
      timestamp: Date.now(),
      count: count || 0
    }));

    return data || [];
  } catch (error: any) {
    console.error('❌ getSimulations error:', error);
    
    // Fallback au cache en cas d'erreur
    const cacheKey = `simulations_${options.status || 'all'}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      console.warn('⚠️ Returning cached simulations due to error');
      return JSON.parse(cached).data;
    }
    
    throw error;
  }
};

export const getSimulationById = async (
  simulationId: string, 
  options?: { refresh?: boolean }
): Promise<Simulation | null> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Utilisateur non authentifié');

    // Gestion du cache
    const cacheKey = `simulation_${simulationId}`;
    if (!options?.refresh) {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const { data, timestamp, userId } = JSON.parse(cached);
        if (userId === session.user.id && Date.now() - timestamp < 15000) { // 15 secondes
          return data;
        }
      }
    }

    const { data, error } = await supabase
      .from('simulations')
      .select(`
        *,
        simulation_results (*),
        materials (id, name, conductivity, density, specific_heat)
      `)
      .eq('id', simulationId)
      .eq('user_id', session.user.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      
      const supabaseError = handleSupabaseError(error, 'getSimulationById', { simulationId });
      throw new Error(supabaseError.userMessage);
    }

    // Mise en cache
    sessionStorage.setItem(cacheKey, JSON.stringify({
      data,
      timestamp: Date.now(),
      userId: session.user.id
    }));

    return data;
  } catch (error: any) {
    console.error('❌ getSimulationById error:', error);
    
    // Fallback au cache
    const cacheKey = `simulation_${simulationId}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      console.warn('⚠️ Returning cached simulation due to error');
      const parsed = JSON.parse(cached);
      return parsed.data;
    }
    
    throw error;
  }
};

export const getSimulationResults = async (
  simulationId: string
): Promise<SimulationResult | null> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Utilisateur non authentifié');

    const { data, error } = await supabase
      .from('simulation_results')
      .select('*')
      .eq('simulation_id', simulationId)
      .in('simulation_id', 
        supabase
          .from('simulations')
          .select('id')
          .eq('user_id', session.user.id)
      )
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      const supabaseError = handleSupabaseError(error, 'getSimulationResults', { simulationId });
      throw new Error(supabaseError.userMessage);
    }

    return data;
  } catch (error: any) {
    console.error('❌ getSimulationResults error:', error);
    throw error;
  }
};

// -----------------------------------------------------------------------------
// CRÉATION ET MISE À JOUR - VALIDATION RENFORCÉE
// -----------------------------------------------------------------------------
export const createSimulation = async (
  params: CreateSimulationParams
): Promise<Simulation> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Authentification requise');

    // Validation exhaustive
    const validationErrors: string[] = [];
    
    if (!params.name?.trim()) validationErrors.push('Le nom de la simulation est requis');
    if (params.name.length > 100) validationErrors.push('Le nom ne doit pas dépasser 100 caractères');
    if (!params.config.material_id) validationErrors.push('Le matériau est requis');
    
    const temp = params.config.boundary_conditions.initial_temp;
    if (temp < -273.15 || temp > 10000) validationErrors.push('Température initiale invalide');
    
    if (validationErrors.length > 0) {
      throw new Error(validationErrors.join('. '));
    }

    const newSimulation = {
      user_id: session.user.id,
      name: params.name.trim(),
      description: params.description?.trim() || null,
      geometry_type: params.geometryType || 'complex',
      geometry_config: params.config.geometry_config || { type: 'complex' },
      boundary_conditions: params.config.boundary_conditions,
      material_id: params.config.material_id,
      mesh_density: params.config.mesh_density || 'medium',
      solver_type: params.config.solver_type || 'fem_fortran',
      status: 'pending' as SimulationStatus,
      progress: 0,
      error_message: null,
    };

    console.log('Creating simulation with:', { 
      ...newSimulation, 
      user_id: 'hidden', 
      material_id: newSimulation.material_id 
    });

    const { data, error } = await supabase
      .from('simulations')
      .insert(newSimulation)
      .select(`
        *,
        materials (id, name)
      `)
      .single();

    if (error) {
      const supabaseError = handleSupabaseError(error, 'createSimulation', {
        userId: session.user.id,
        simulationName: params.name
      });
      throw new Error(supabaseError.userMessage);
    }

    // Nettoyer le cache
    sessionStorage.removeItem(`simulations_${session.user.id}`);

    return data;
  } catch (error: any) {
    console.error('❌ createSimulation error:', error);
    throw error;
  }
};

export const updateSimulation = async (
  simulationId: string,
  params: Partial<CreateSimulationParams>
): Promise<Simulation> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Authentification requise');

    // Vérifier la propriété
    const { data: existingSim } = await supabase
      .from('simulations')
      .select('id, user_id, status')
      .eq('id', simulationId)
      .single();

    if (!existingSim) throw new Error('Simulation non trouvée');
    if (existingSim.user_id !== session.user.id) throw new Error('Permission refusée');
    if (existingSim.status === 'running') throw new Error('Impossible de modifier une simulation en cours');

    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (params.name !== undefined) {
      if (!params.name.trim()) throw new Error('Le nom est requis');
      updateData.name = params.name.trim();
    }
    
    if (params.description !== undefined) {
      updateData.description = params.description?.trim() || null;
    }
    
    if (params.geometryType !== undefined) {
      updateData.geometry_type = params.geometryType;
    }
    
    if (params.config) {
      updateData.geometry_config = params.config.geometry_config;
      updateData.boundary_conditions = params.config.boundary_conditions;
      updateData.material_id = params.config.material_id;
      updateData.mesh_density = params.config.mesh_density;
      updateData.solver_type = params.config.solver_type;
    }

    const { data, error } = await supabase
      .from('simulations')
      .update(updateData)
      .eq('id', simulationId)
      .eq('user_id', session.user.id)
      .select(`
        *,
        materials (id, name)
      `)
      .single();

    if (error) {
      const supabaseError = handleSupabaseError(error, 'updateSimulation', { simulationId });
      throw new Error(supabaseError.userMessage);
    }

    // Nettoyer le cache
    sessionStorage.removeItem(`simulation_${simulationId}`);
    sessionStorage.removeItem(`simulations_${session.user.id}`);

    return data;
  } catch (error: any) {
    console.error('❌ updateSimulation error:', error);
    throw error;
  }
};

// -----------------------------------------------------------------------------
// LANCEMENT DE SIMULATION - ROBUSTE AVEC RETRY
// -----------------------------------------------------------------------------
export const startSimulation = async (
  simulationId: string, 
  options?: { retryCount?: number }
): Promise<StartSimulationResponse> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Authentification requise');

    // 1. Vérifier l'existence et le statut
    const { data: simulation, error: fetchError } = await supabase
      .from('simulations')
      .select('status, geometry_config, boundary_conditions, material_id, mesh_density, solver_type')
      .eq('id', simulationId)
      .eq('user_id', session.user.id)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        throw new Error('Simulation non trouvée');
      }
      throw new Error(`Erreur de récupération: ${fetchError.message}`);
    }

    // 2. Empêcher les doublons et vérifier l'état
    if (simulation.status === 'running') {
      throw new Error('Une simulation est déjà en cours pour ce modèle');
    }
    
    if (simulation.status === 'completed') {
      const overwrite = window.confirm(
        'Une simulation existe déjà pour ce modèle. Voulez-vous relancer une nouvelle simulation ?'
      );
      if (!overwrite) {
        return {
          success: false,
          simulation_id: simulationId,
          status: simulation.status,
          message: 'Simulation annulée par l\'utilisateur'
        };
      }
    }

    // 3. Validation des données
    if (!simulation.geometry_config?.file_url && !simulation.geometry_config?.dimensions) {
      throw new Error('Configuration géométrique incomplète');
    }
    
    if (!simulation.material_id) {
      throw new Error('Matériau non sélectionné');
    }

    // 4. Mettre à jour le statut immédiatement
    await supabase
      .from('simulations')
      .update({ 
        status: 'running', 
        progress: 0, 
        error_message: null,
        started_at: new Date().toISOString()
      })
      .eq('id', simulationId);

    // 5. Préparer la configuration
    const config = {
      geometry_config: simulation.geometry_config,
      boundary_conditions: simulation.boundary_conditions,
      material_id: simulation.material_id,
      mesh_density: simulation.mesh_density,
      solver_type: simulation.solver_type,
      user_id: session.user.id,
    };

    // 6. Appeler l'Edge Function avec timeout
    const timeout = 30000; // 30 secondes
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const { data, error } = await supabase.functions.invoke('simulate', {
        body: {
          simulation_id: simulationId,
          config: config,
          user_id: session.user.id,
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (error) {
        console.error('Edge Function invocation error:', error);
        
        // Marquer comme échoué
        await supabase
          .from('simulations')
          .update({ 
            status: 'failed', 
            progress: 0, 
            error_message: error.message || 'Erreur lors de l\'appel',
            completed_at: new Date().toISOString()
          })
          .eq('id', simulationId);

        // Tentative de reprise
        if (options?.retryCount === undefined || options.retryCount < 2) {
          console.log(`Tentative de reprise ${(options?.retryCount || 0) + 1}/2`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          return startSimulation(simulationId, { 
            retryCount: (options?.retryCount || 0) + 1 
          });
        }

        throw new Error(`Échec du lancement: ${error.message || 'Erreur inconnue'}`);
      }

      // 7. Retourner la réponse
      return {
        success: data?.success || false,
        simulation_id: simulationId,
        status: data?.status || 'running',
        results: data?.results,
        message: data?.message || 'Simulation lancée avec succès',
        task_id: data?.task_id,
      };
    } catch (invokeError: any) {
      clearTimeout(timeoutId);
      
      if (invokeError.name === 'AbortError') {
        throw new Error('Délai d\'attente dépassé lors du lancement de la simulation');
      }
      throw invokeError;
    }
  } catch (error: any) {
    console.error('❌ startSimulation error:', error);
    
    // Nettoyer en cas d'erreur
    try {
      await supabase
        .from('simulations')
        .update({ 
          status: 'failed', 
          error_message: error.message.substring(0, 500),
          completed_at: new Date().toISOString()
        })
        .eq('id', simulationId);
    } catch (updateError) {
      console.error('Failed to update simulation status:', updateError);
    }
    
    throw error;
  }
};

// -----------------------------------------------------------------------------
// UPLOAD DE GÉOMÉTRIE - AMÉLIORÉ
// -----------------------------------------------------------------------------
export const uploadGeometry = async (
  params: { 
    file: File, 
    userId: string, 
    simulationId?: string 
  }
): Promise<UploadGeometryResponse> => {
  try {
    // Validation du fichier
    const maxSize = 100 * 1024 * 1024; // 100 MB
    if (params.file.size > maxSize) {
      throw new Error(`Fichier trop volumineux. Maximum: ${maxSize / (1024 * 1024)} MB`);
    }

    const validExtensions = ['.stl', '.step', '.stp', '.obj', '.vtp', '.vti', '.ply'];
    const fileExt = params.file.name.toLowerCase().slice(params.file.name.lastIndexOf('.'));
    
    if (!validExtensions.includes(fileExt)) {
      throw new Error(`Format non supporté. Formats acceptés: ${validExtensions.join(', ')}`);
    }

    // Conversion en base64
    const reader = new FileReader();
    const fileData = await new Promise<string>((resolve, reject) => {
      reader.onload = () => {
        const binary = reader.result as string;
        const base64 = btoa(binary);
        resolve(base64);
      };
      reader.onerror = () => reject(new Error('Erreur de lecture du fichier'));
      reader.readAsBinaryString(params.file);
    });

    // Appel à l'Edge Function
    const { data, error } = await supabase.functions.invoke('upload-geometry', {
      body: {
        file_name: params.file.name,
        file_data: fileData,
        file_size: params.file.size,
        file_type: params.file.type,
        user_id: params.userId,
        simulation_id: params.simulationId,
      },
      timeout: 60000, // 60 secondes
    });

    if (error) {
      console.error('Upload geometry error:', error);
      throw new Error(`Échec de l'upload: ${error.message || 'Erreur inconnue'}`);
    }

    return {
      success: true,
      fileUrl: data.file_url,
      fileName: data.file_name,
      fileSize: params.file.size,
      fileType: params.file.type,
    };
  } catch (error: any) {
    console.error('❌ uploadGeometry error:', error);
    throw error;
  }
};

// -----------------------------------------------------------------------------
// SUPPRESSION - SÉCURISÉE
// -----------------------------------------------------------------------------
export const deleteSimulation = async (simulationId: string): Promise<void> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Authentification requise');

    // Vérifier la propriété et l'état
    const { data: simulation } = await supabase
      .from('simulations')
      .select('user_id, status')
      .eq('id', simulationId)
      .single();

    if (!simulation) throw new Error('Simulation non trouvée');
    if (simulation.user_id !== session.user.id) throw new Error('Permission refusée');
    if (simulation.status === 'running') throw new Error('Impossible de supprimer une simulation en cours');

    // Supprimer d'abord les résultats
    await supabase
      .from('simulation_results')
      .delete()
      .eq('simulation_id', simulationId);

    // Supprimer la simulation
    const { error } = await supabase
      .from('simulations')
      .delete()
      .eq('id', simulationId)
      .eq('user_id', session.user.id);

    if (error) {
      const supabaseError = handleSupabaseError(error, 'deleteSimulation', { simulationId });
      throw new Error(supabaseError.userMessage);
    }

    // Nettoyer le cache
    sessionStorage.removeItem(`simulation_${simulationId}`);
    sessionStorage.removeItem(`simulations_${session.user.id}`);
  } catch (error: any) {
    console.error('❌ deleteSimulation error:', error);
    throw error;
  }
};

// -----------------------------------------------------------------------------
// TEMPS RÉEL - OPTIMISÉ
// -----------------------------------------------------------------------------
export const subscribeToSimulation = (
  simulationId: string,
  callback: (payload: any) => void
) => {
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
        console.log('Simulation update:', payload);
        callback(payload);
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'simulation_results',
        filter: `simulation_id=eq.${simulationId}`
      },
      (payload) => {
        console.log('Simulation result added:', payload);
        callback(payload);
      }
    )
    .subscribe((status) => {
      console.log(`Subscription status for ${simulationId}:`, status);
    });

  return channel;
};

export const unsubscribeFromChannel = (channel: any) => {
  if (channel) {
    supabase.removeChannel(channel);
  }
};

// -----------------------------------------------------------------------------
// FONCTIONS UTILITAIRES
// -----------------------------------------------------------------------------
export const checkSimulationPermissions = async (simulationId: string): Promise<boolean> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return false;

    const { data } = await supabase
      .from('simulations')
      .select('id')
      .eq('id', simulationId)
      .eq('user_id', session.user.id)
      .single();

    return !!data;
  } catch (error) {
    console.error('Permission check error:', error);
    return false;
  }
};

export const getSimulationStatistics = async (userId: string) => {
  try {
    const { data, error } = await supabase
      .from('simulations')
      .select('status, created_at')
      .eq('user_id', userId);

    if (error) throw error;

    const stats = {
      total: data.length,
      completed: data.filter(s => s.status === 'completed').length,
      running: data.filter(s => s.status === 'running').length,
      failed: data.filter(s => s.status === 'failed').length,
      pending: data.filter(s => s.status === 'pending').length,
      last30Days: data.filter(s => {
        const created = new Date(s.created_at);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        return created >= thirtyDaysAgo;
      }).length,
    };

    return stats;
  } catch (error) {
    console.error('Statistics error:', error);
    throw error;
  }
};

export const cancelSimulation = async (simulationId: string): Promise<void> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Authentification requise');

    // Vérifier la propriété
    const { data: simulation } = await supabase
      .from('simulations')
      .select('user_id, status')
      .eq('id', simulationId)
      .single();

    if (!simulation) throw new Error('Simulation non trouvée');
    if (simulation.user_id !== session.user.id) throw new Error('Permission refusée');
    if (simulation.status !== 'running') throw new Error('Seules les simulations en cours peuvent être annulées');

    // Mettre à jour le statut
    const { error } = await supabase
      .from('simulations')
      .update({
        status: 'cancelled',
        progress: 0,
        error_message: 'Annulé par l\'utilisateur',
        completed_at: new Date().toISOString(),
      })
      .eq('id', simulationId);

    if (error) throw error;

    // Nettoyer le cache
    sessionStorage.removeItem(`simulation_${simulationId}`);
  } catch (error: any) {
    console.error('❌ cancelSimulation error:', error);
    throw error;
  }
};

export const cloneSimulation = async (simulationId: string): Promise<Simulation> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Authentification requise');

    // Récupérer la simulation originale
    const original = await getSimulationById(simulationId);
    if (!original) throw new Error('Simulation originale non trouvée');

    // Créer une nouvelle simulation basée sur l'originale
    const clonedSimulation = {
      user_id: session.user.id,
      name: `${original.name} (Copie)`,
      description: original.description,
      geometry_type: original.geometry_type,
      geometry_config: original.geometry_config,
      boundary_conditions: original.boundary_conditions,
      material_id: original.material_id,
      mesh_density: original.mesh_density,
      solver_type: original.solver_type,
      status: 'pending' as SimulationStatus,
      progress: 0,
    };

    const { data, error } = await supabase
      .from('simulations')
      .insert(clonedSimulation)
      .select()
      .single();

    if (error) throw error;

    return data;
  } catch (error: any) {
    console.error('❌ cloneSimulation error:', error);
    throw error;
  }
};

// -----------------------------------------------------------------------------
// EXPORT PAR DÉFAUT
// -----------------------------------------------------------------------------
const SimulationService = {
  getSimulations,
  getSimulationById,
  getSimulationResults,
  createSimulation,
  updateSimulation,
  startSimulation,
  uploadGeometry,
  deleteSimulation,
  subscribeToSimulation,
  unsubscribeFromChannel,
  checkSimulationPermissions,
  getSimulationStatistics,
  cancelSimulation,
  cloneSimulation,
};

export default SimulationService;
