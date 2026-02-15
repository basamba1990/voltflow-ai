import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

// -----------------------------------------------------------------------------
// TYPES
// -----------------------------------------------------------------------------
export type Simulation = Database['public']['Tables']['simulations']['Row'] & {
  simulation_results?: Database['public']['Tables']['simulation_results']['Row'][];
  materials?: Database['public']['Tables']['materials']['Row'];
};

export type SimulationStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type MeshDensity = 'low' | 'medium' | 'high';
export type CoolingType = 'natural_convection' | 'forced_convection' | 'radiation';
export type FluidType = 'air' | 'water' | 'oil';

export interface SimulationConfig {
  geometry_config: {
    type: string;
    file_url?: string;
    file_name?: string;
    file_path?: string;
    file_size?: number;
    dimensions?: Record<string, number>;
    geometry_type?: string;
    solver_suggestion?: string;
    fortran_compatible?: boolean;
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
  solver_type?: string;
  material_properties?: {
    conductivity: number;
    density: number;
    specific_heat: number;
  };
}

export interface StartSimulationResponse {
  success: boolean;
  simulation_id: string;
  status: SimulationStatus;
  results?: any;
  message?: string;
}

export interface UploadGeometryResponse {
  success: boolean;
  fileUrl: string;
  fileName: string;
  fileSize?: number;
  path?: string;
  geometry_type?: string;
  solver_suggestion?: string;
  estimated_dimensions?: { width: number; height: number; depth: number };
  message?: string;
}

// -----------------------------------------------------------------------------
// UTILS - CORRIGÉ AVEC TIMEOUTS
// -----------------------------------------------------------------------------

const withTimeout = <T>(promise: Promise<T>, ms: number, errorMessage: string): Promise<T> => {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(errorMessage)), ms);
  });
  return Promise.race([promise, timeout]);
};

// -----------------------------------------------------------------------------
// FONCTIONS EXPORTÉES
// -----------------------------------------------------------------------------

export const getSimulations = async (): Promise<Simulation[]> => {
  try {
    const { data: session, error: authError } = await supabase.auth.getSession();
    if (authError || !session?.session?.user?.id) {
      throw new Error('Utilisateur non authentifié');
    }

    const userId = session.session.user.id;

    const { data, error } = await supabase
      .from('simulations')
      .select('*, simulation_results (*), materials (*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return data as Simulation[];
  } catch (err) {
    console.error('Erreur récupération simulations:', err);
    throw err;
  }
};

export const getSimulationById = async (id: string): Promise<Simulation> => {
  try {
    const { data: session, error: authError } = await supabase.auth.getSession();
    if (authError || !session?.session?.user?.id) {
      throw new Error('Utilisateur non authentifié');
    }

    const userId = session.session.user.id;

    const { data, error } = await supabase
      .from('simulations')
      .select('*, simulation_results (*), materials (*)')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error) {
      throw error;
    }

    return data as Simulation;
  } catch (err) {
    console.error(`Erreur récupération simulation ${id}:`, err);
    throw err;
  }
};

export const createSimulation = async (params: {
  name: string;
  description?: string;
  geometryType: string;
  config: SimulationConfig
}): Promise<Simulation> => {
  try {
    const { data: session, error: authError } = await supabase.auth.getSession();
    if (authError || !session?.session?.user?.id) {
      throw new Error('Utilisateur non authentifié');
    }

    const userId = session.session.user.id;

    const { data, error } = await supabase
      .from('simulations')
      .insert({
        user_id: userId,
        name: params.name,
        description: params.description,
        geometry_type: params.geometryType,
        geometry_config: params.config.geometry_config,
        boundary_conditions: params.config.boundary_conditions as any,
        material_id: params.config.material_id,
        mesh_density: params.config.mesh_density,
        solver_type: params.config.solver_type || 'fem_fortran',
        status: 'pending',
        progress: 0
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
  } catch (err) {
    console.error('Erreur création simulation:', err);
    throw err;
  }
};

export const updateSimulation = async (id: string, params: {
  name: string;
  description?: string;
  geometryType: string;
  config: SimulationConfig
}): Promise<Simulation> => {
  try {
    const { data: session, error: authError } = await supabase.auth.getSession();
    if (authError || !session?.session?.user?.id) {
      throw new Error('Utilisateur non authentifié');
    }

    const userId = session.session.user.id;

    const { data: existingSim, error: checkError } = await supabase
      .from('simulations')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (checkError || !existingSim) {
      throw new Error('Simulation non trouvée ou accès non autorisé');
    }

    const { data, error } = await supabase
      .from('simulations')
      .update({
        name: params.name,
        description: params.description,
        geometry_type: params.geometryType,
        geometry_config: params.config.geometry_config,
        boundary_conditions: params.config.boundary_conditions as any,
        material_id: params.config.material_id,
        mesh_density: params.config.mesh_density,
        solver_type: params.config.solver_type || 'fem_fortran',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
  } catch (err) {
    console.error(`Erreur mise à jour simulation ${id}:`, err);
    throw err;
  }
};

// CORRIGÉ AVEC TIMEOUT AUGMENTÉ
export const startSimulation = async (simulationId: string): Promise<StartSimulationResponse> => {
  try {
    const { data: session, error: authError } = await supabase.auth.getSession();
    if (authError || !session?.session?.user?.id) {
      throw new Error('Utilisateur non authentifié');
    }
    const userId = session.session.user.id;

    const { data: simulation, error: fetchError } = await supabase
      .from('simulations')
      .select('*, materials(*)')
      .eq('id', simulationId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !simulation) {
      throw new Error('Simulation non trouvée ou accès non autorisé');
    }

    const materialData = simulation.materials || { thermal_conductivity: 50.0, density: 2700.0, specific_heat: 900.0 };
    const config = {
      geometry_config: simulation.geometry_config || {},
      boundary_conditions: simulation.boundary_conditions || { initial_temp: 1000, ambient_temp: 25, cooling_type: 'natural_convection', convection_coeff: 10, fluid_type: 'air', fluid_velocity: 1 },
      material_id: simulation.material_id || 'aluminum-6061',
      mesh_density: simulation.mesh_density || 'medium',
      solver_type: simulation.solver_type || 'fem_fortran',
      material_properties: { conductivity: materialData.thermal_conductivity || 50.0, density: materialData.density || 2700.0, specific_heat: materialData.specific_heat || 900.0 }
    };

    await supabase.from('simulations').update({ progress: 10, started_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', simulationId);

    const { data: edgeFunctionData, error: edgeFunctionError } = await withTimeout(
      supabase.functions.invoke('simulate', {
        body: { simulation_id: simulationId, config, user_id: userId }
      }),
      120000, // Timeout de 120 secondes
      'Timeout: Le moteur de simulation ne répond pas (120s)'
    );

    if (edgeFunctionError) throw edgeFunctionError;
    if (!edgeFunctionData?.success) throw new Error(edgeFunctionData?.error || 'Erreur inconnue');

    return { success: true, simulation_id: simulationId, status: edgeFunctionData.status || 'running', results: edgeFunctionData.results, message: edgeFunctionData.message || 'Simulation lancée' };

  } catch (error: any) {
    console.error(`Erreur lancement simulation ${simulationId}:`, error);
    await supabase.from('simulations').update({ status: 'failed', error_message: error.message.substring(0, 500), completed_at: new Date().toISOString() }).eq('id', simulationId);
    throw error;
  }
};

// CORRIGÉ AVEC TIMEOUTS AUGMENTÉS ET CHEMIN RLS
export const uploadGeometry = async (params: { file: File; simulationId: string; }): Promise<UploadGeometryResponse> => {
  try {
    const { data: session, error: authError } = await supabase.auth.getSession();
    if (authError || !session?.session?.user?.id) {
      throw new Error('Utilisateur non authentifié');
    }
    const userId = session.session.user.id;
    const { file, simulationId } = params;

    const timestamp = Date.now();
    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'stl';
    const storagePath = `${userId}/${simulationId}/${timestamp}_${file.name}`;

    const { error: uploadError } = await withTimeout(
      supabase.storage.from('simulation-files').upload(storagePath, file, { cacheControl: '3600', upsert: true, contentType: 'application/octet-stream' }),
      60000, // Timeout de 60 secondes pour l'upload
      'Timeout: Envoi du fichier au serveur a échoué (60s)'
    );
    if (uploadError) throw uploadError;

    const { data: edgeFunctionData, error: edgeFunctionError } = await withTimeout(
      supabase.functions.invoke('upload-geometry', {
        body: { simulation_id: simulationId, path: storagePath, fileName: file.name, userId: userId }
      }),
      90000, // Timeout de 90 secondes pour l'analyse
      'Timeout: Le serveur a mis trop de temps pour analyser le fichier (90s)'
    );
    if (edgeFunctionError) throw edgeFunctionError;

    return { ...edgeFunctionData, success: true, path: storagePath };

  } catch (error: any) {
    console.error('Erreur upload géométrie:', error);
    throw error;
  }
};

export const deleteSimulation = async (id: string): Promise<void> => {
  try {
    const { data: session, error: authError } = await supabase.auth.getSession();
    if (authError || !session?.session?.user?.id) {
      throw new Error('Utilisateur non authentifié');
    }
    const userId = session.session.user.id;

    const { error } = await supabase.from('simulations').delete().eq('id', id).eq('user_id', userId);
    if (error) throw error;

  } catch (err) {
    console.error(`Erreur suppression simulation ${id}:`, err);
    throw err;
  }
};

export const subscribeToSimulation = (id: string, callback: (payload: any) => void) => {
  return supabase.channel(`sim-${id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'simulations', filter: `id=eq.${id}` }, callback)
    .subscribe();
};

export const unsubscribeFromChannel = (channel: any) => {
  if (channel) {
    supabase.removeChannel(channel);
  }
};

export async function updateSimulationStatus(simulationId: string, status: SimulationStatus, errorMessage?: string): Promise<Simulation> {
  try {
    const { data: session, error: authError } = await supabase.auth.getSession();
    if (authError || !session?.session?.user?.id) {
      throw new Error('Utilisateur non authentifié');
    }
    const userId = session.session.user.id;

    const updateData: any = { status, updated_at: new Date().toISOString() };
    if (status === 'completed' || status === 'failed') {
      updateData.completed_at = new Date().toISOString();
    }
    if (errorMessage && status === 'failed') {
      updateData.error_message = errorMessage.substring(0, 500);
    }

    const { data, error } = await supabase.from('simulations').update(updateData).eq('id', simulationId).eq('user_id', userId).select().single();
    if (error) throw error;

    return data;

  } catch (err) {
    console.error(`Erreur mise à jour statut simulation ${simulationId}:`, err);
    throw err;
  }
}

export async function getUserSimulationStats() {
  try {
    const { data: session, error: authError } = await supabase.auth.getSession();
    if (authError || !session?.session?.user?.id) {
      throw new Error('Utilisateur non authentifié');
    }
    const userId = session.session.user.id;

    const { data, error } = await supabase.from('simulations').select('status, solver_type, mesh_density').eq('user_id', userId);
    if (error) throw error;

    const stats = {
      totalSimulations: data.length,
      byStatus: { pending: 0, running: 0, completed: 0, failed: 0, cancelled: 0 },
      bySolverType: {} as Record<string, number>,
      byMeshDensity: { low: 0, medium: 0, high: 0 },
    };

    data.forEach((simulation) => {
      if (stats.byStatus[simulation.status as keyof typeof stats.byStatus] !== undefined) {
        stats.byStatus[simulation.status as keyof typeof stats.byStatus]++;
      }
      const solver = simulation.solver_type || 'unknown';
      stats.bySolverType[solver] = (stats.bySolverType[solver] || 0) + 1;
      if (simulation.mesh_density && stats.byMeshDensity[simulation.mesh_density as keyof typeof stats.byMeshDensity] !== undefined) {
        stats.byMeshDensity[simulation.mesh_density as keyof typeof stats.byMeshDensity]++;
      }
    });

    return stats;

  } catch (err) {
    console.error('Erreur lors de la récupération des statistiques:', err);
    throw err;
  }
}

export const SimulationService = {
  getSimulations,
  getSimulationById,
  createSimulation,
  updateSimulation,
  startSimulation,
  uploadGeometry,
  deleteSimulation,
  subscribeToSimulation,
  unsubscribeFromChannel,
  updateSimulationStatus,
  getUserSimulationStats
};

export default SimulationService;
