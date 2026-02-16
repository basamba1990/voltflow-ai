// src/services/simulation.service.ts
import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

// -----------------------------------------------------------------------------
// TYPES
// -----------------------------------------------------------------------------
export type Simulation = Database['public']['Tables']['simulations']['Row'] & {
  simulation_results?: Database['public']['Tables']['simulation_results']['Row'][];
  materials?: Database['public']['Tables']['materials']['Row'];
  nx?: number;
  ny?: number;
  nz?: number;
};

export type SimulationStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type MeshDensity = 'low' | 'medium' | 'high';
export type CoolingType = 'natural_convection' | 'forced_convection' | 'radiation';
export type FluidType = 'air' | 'water' | 'oil';

export interface SimulationConfig {
  geometry_config: {
    type?: string;
    file_url?: string;
    file_name?: string;
    file_path?: string;
    file_size?: number;
    dimensions?: Record<string, number>;
    geometry_type?: string;
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
  nx?: number;
  ny?: number;
  nz?: number;
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
  simulationId?: string;
}

// -----------------------------------------------------------------------------
// UTILS
// -----------------------------------------------------------------------------
const withTimeout = <T>(promise: Promise<T>, ms: number, errorMessage: string): Promise<T> => {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(errorMessage)), ms);
  });
  return Promise.race([promise, timeout]);
};

// -----------------------------------------------------------------------------
// FONCTIONS PRINCIPALES
// -----------------------------------------------------------------------------

export const getSimulations = async (): Promise<Simulation[]> => {
  const { data: session } = await supabase.auth.getSession();
  const userId = session?.session?.user?.id;
  if (!userId) throw new Error('Utilisateur non authentifié');

  const { data, error } = await supabase
    .from('simulations')
    .select('*, simulation_results (*), materials (*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as Simulation[];
};

export const getSimulationById = async (id: string): Promise<Simulation> => {
  const { data: session } = await supabase.auth.getSession();
  const userId = session?.session?.user?.id;
  if (!userId) throw new Error('Utilisateur non authentifié');

  const { data, error } = await supabase
    .from('simulations')
    .select('*, simulation_results (*), materials (*)')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (error) throw error;
  return data as Simulation;
};

export const createSimulation = async (params: {
  name: string;
  description?: string;
  geometryType: string;
  config: SimulationConfig;
}): Promise<Simulation> => {
  const { data: session } = await supabase.auth.getSession();
  const userId = session?.session?.user?.id;
  if (!userId) throw new Error('Non authentifié');

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
      nx: params.config.nx || 50,
      ny: params.config.ny || 50,
      nz: params.config.nz || 50,
      status: 'pending',
      progress: 0,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const updateSimulation = async (
  id: string,
  params: {
    name: string;
    description?: string;
    geometryType: string;
    config: SimulationConfig;
  }
): Promise<Simulation> => {
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
      nx: params.config.nx || 50,
      ny: params.config.ny || 50,
      nz: params.config.nz || 50,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const startSimulation = async (simulationId: string): Promise<StartSimulationResponse> => {
  const { data: session } = await supabase.auth.getSession();
  const userId = session?.session?.user?.id;

  const { data, error } = await supabase.functions.invoke('simulate', {
    body: { simulation_id: simulationId, user_id: userId },
  });

  if (error) throw error;
  return data;
};

export const uploadGeometry = async (params: {
  file: File;
  simulationId?: string;
  simulationName?: string;
  materialId?: string;
}): Promise<UploadGeometryResponse & { simulationId?: string }> => {
  const { data: session } = await supabase.auth.getSession();
  const userId = session?.session?.user?.id;
  if (!userId) throw new Error('Non authentifié');

  const { file, simulationId: providedSimId, simulationName, materialId } = params;

  let effectiveSimId = providedSimId;
  if (!effectiveSimId) {
    const name = simulationName || file.name.replace(/\.[^/.]+$/, '');
    const { data: newSim, error: createError } = await supabase
      .from('simulations')
      .insert({
        user_id: userId,
        name,
        description: `Simulation créée depuis le fichier ${file.name}`,
        geometry_type: 'complex',
        geometry_config: { file_name: file.name },
        material_id: materialId || null,
        mesh_density: 'medium',
        solver_type: 'fem_fortran',
        status: 'pending',
        progress: 0,
      })
      .select()
      .single();

    if (createError) throw createError;
    effectiveSimId = newSim.id;
  }

  const timestamp = Date.now();
  const uniqueId = Math.random().toString(36).substring(2, 9);
  const fileExt = file.name.split('.').pop()?.toLowerCase() || 'vtp';
  const storagePath = `${userId}/${effectiveSimId}/${timestamp}_${uniqueId}.${fileExt}`;

  const { error: uploadError } = await withTimeout(
    supabase.storage.from('simulation-files').upload(storagePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: 'application/octet-stream',
    }),
    60000,
    '❌ Supabase Storage upload timeout (60s)'
  );

  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage.from('simulation-files').getPublicUrl(storagePath);
  const fileUrl = urlData.publicUrl;

  // Mise à jour immédiate de la base de données
  await supabase
    .from('simulations')
    .update({
      geometry_config: {
        file_url: fileUrl,
        file_name: file.name,
        file_size: file.size,
        file_path: storagePath,
      },
    })
    .eq('id', effectiveSimId);

  // Analyse en arrière-plan (non-bloquante)
  supabase.functions
    .invoke('upload-geometry', {
      body: {
        fileName: file.name,
        userId,
        simulation_id: effectiveSimId,
        path: storagePath,
        fileUrl,
      },
    })
    .catch((e) => console.warn('⚠️ Analyse background failed:', e));

  return {
    success: true,
    fileUrl,
    fileName: file.name,
    fileSize: file.size,
    path: storagePath,
    simulationId: effectiveSimId,
  };
};

export const deleteSimulation = async (id: string): Promise<void> => {
  const { data: session } = await supabase.auth.getSession();
  const userId = session?.session?.user?.id;
  if (!userId) throw new Error('Non authentifié');

  const { error } = await supabase.from('simulations').delete().eq('id', id).eq('user_id', userId);
  if (error) throw error;
};

export const subscribeToSimulation = (id: string, callback: (payload: any) => void) => {
  return supabase
    .channel(`sim-${id}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'simulations',
        filter: `id=eq.${id}`,
      },
      callback
    )
    .subscribe();
};

export const unsubscribeFromChannel = (channel: any) => {
  if (channel) supabase.removeChannel(channel);
};

export const updateSimulationStatus = async (
  simulationId: string,
  status: SimulationStatus,
  errorMessage?: string
): Promise<Simulation> => {
  const { data: session } = await supabase.auth.getSession();
  const userId = session?.session?.user?.id;
  if (!userId) throw new Error('Non authentifié');

  const updateData: any = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === 'completed' || status === 'failed') {
    updateData.completed_at = new Date().toISOString();
  }
  if (errorMessage && status === 'failed') {
    updateData.error_message = errorMessage.substring(0, 500);
  }

  const { data, error } = await supabase
    .from('simulations')
    .update(updateData)
    .eq('id', simulationId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const getUserSimulationStats = async () => {
  const { data: session } = await supabase.auth.getSession();
  const userId = session?.session?.user?.id;
  if (!userId) throw new Error('Non authentifié');

  const { data, error } = await supabase
    .from('simulations')
    .select('status, solver_type, mesh_density')
    .eq('user_id', userId);

  if (error) throw error;

  const stats = {
    totalSimulations: data.length,
    byStatus: {
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    },
    bySolverType: {} as Record<string, number>,
    byMeshDensity: {
      low: 0,
      medium: 0,
      high: 0,
    },
  };

  data.forEach((sim) => {
    if (stats.byStatus[sim.status as keyof typeof stats.byStatus] !== undefined) {
      stats.byStatus[sim.status as keyof typeof stats.byStatus]++;
    }
    const solver = sim.solver_type || 'unknown';
    stats.bySolverType[solver] = (stats.bySolverType[solver] || 0) + 1;
    if (sim.mesh_density && stats.byMeshDensity[sim.mesh_density as keyof typeof stats.byMeshDensity] !== undefined) {
      stats.byMeshDensity[sim.mesh_density as keyof typeof stats.byMeshDensity]++;
    }
  });

  return stats;
};

// Export par défaut pour utilisation via SimulationService.xxx
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
  getUserSimulationStats,
};

export default SimulationService;
