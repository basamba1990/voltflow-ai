// simulation.service.ts - VERSION ULTRA-ROBUSTE (ZÉRO BLOCAGE)
import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

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
    type?: string;
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

const withTimeout = <T>(promise: Promise<T>, ms: number, errorMessage: string): Promise<T> => {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(errorMessage)), ms);
  });
  return Promise.race([promise, timeout]);
};

export const getSimulations = async (): Promise<Simulation[]> => {
  const { data: session } = await supabase.auth.getSession();
  if (!session?.session?.user?.id) throw new Error('Non authentifié');
  const { data, error } = await supabase
    .from('simulations')
    .select('*, simulation_results (*), materials (*)')
    .eq('user_id', session.session.user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Simulation[];
};

export const getSimulationById = async (id: string): Promise<Simulation> => {
  const { data, error } = await supabase
    .from('simulations')
    .select('*, simulation_results (*), materials (*)')
    .eq('id', id)
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
  const { data, error } = await supabase
    .from('simulations')
    .insert({
      user_id: session?.session?.user?.id,
      name: params.name,
      description: params.description,
      geometry_type: params.geometryType,
      geometry_config: params.config.geometry_config,
      boundary_conditions: params.config.boundary_conditions as any,
      material_id: params.config.material_id,
      mesh_density: params.config.mesh_density,
      solver_type: params.config.solver_type || 'fem_fortran',
      status: 'pending',
      progress: 0,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const updateSimulation = async (id: string, params: {
  name: string;
  description?: string;
  geometryType: string;
  config: SimulationConfig;
}): Promise<Simulation> => {
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
  const { data: simulation } = await supabase
    .from('simulations')
    .select('*, materials(*)')
    .eq('id', simulationId)
    .single();

  if (!simulation) throw new Error('Simulation non trouvée');

  const config = {
    geometry_config: simulation.geometry_config || {},
    boundary_conditions: simulation.boundary_conditions || {},
    material_id: simulation.material_id,
    mesh_density: simulation.mesh_density,
    solver_type: simulation.solver_type,
    material_properties: {
      conductivity: simulation.materials?.thermal_conductivity || 50.0,
      density: simulation.materials?.density || 2700.0,
      specific_heat: simulation.materials?.specific_heat || 900.0,
    },
  };

  await supabase.from('simulations').update({ progress: 10, status: 'running' }).eq('id', simulationId);

  const { data, error } = await withTimeout(
    supabase.functions.invoke('simulate', {
      body: { simulation_id: simulationId, config, user_id: session?.session?.user?.id },
    }),
    120000,
    'Timeout simulation'
  );

  if (error) throw error;
  return { success: true, simulation_id: simulationId, status: 'running', ...data };
};

export const uploadGeometry = async (params: {
  file: File;
  simulationId?: string;
  simulationName?: string;
  materialId?: string;
}): Promise<UploadGeometryResponse & { simulationId?: string }> => {
  const { data: session } = await supabase.auth.getSession();
  const userId = session?.session?.user?.id;
  const { file, simulationId: providedSimId, simulationName, materialId } = params;

  let effectiveSimId = providedSimId;
  if (!effectiveSimId) {
    const { data: newSim, error: createError } = await supabase
      .from('simulations')
      .insert({
        user_id: userId,
        name: simulationName || file.name,
        geometry_type: 'complex',
        material_id: materialId || null,
        status: 'pending',
      })
      .select()
      .single();
    if (createError) throw createError;
    effectiveSimId = newSim.id;
  }

  const storagePath = `${userId}/${effectiveSimId}/${Date.now()}_${file.name}`;
  const { error: uploadError } = await withTimeout(
    supabase.storage.from('simulation-files').upload(storagePath, file),
    60000,
    'Timeout upload'
  );
  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage.from('simulation-files').getPublicUrl(storagePath);
  const fileUrl = urlData.publicUrl;

  // MISE À JOUR IMMÉDIATE (AVANT ANALYSE)
  await supabase.from('simulations').update({
    geometry_config: {
      file_url: fileUrl,
      file_name: file.name,
      file_size: file.size,
      file_path: storagePath,
    }
  }).eq('id', effectiveSimId);

  // ANALYSE EN ARRIÈRE-PLAN (NON-BLOQUANTE)
  supabase.functions.invoke('upload-geometry', {
    body: { fileName: file.name, userId, simulation_id: effectiveSimId, path: storagePath, fileUrl },
  }).catch(e => console.warn('Analyse background failed', e));

  return {
    success: true,
    fileUrl,
    fileName: file.name,
    fileSize: file.size,
    path: storagePath,
    simulationId: effectiveSimId,
  };
};

export const deleteSimulation = async (id: string) => {
  await supabase.from('simulations').delete().eq('id', id);
};

export const subscribeToSimulation = (id: string, callback: (payload: any) => void) => {
  return supabase.channel(`sim-${id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'simulations', filter: `id=eq.${id}` }, callback).subscribe();
};

export const SimulationService = {
  getSimulations,
  getSimulationById,
  createSimulation,
  updateSimulation,
  startSimulation,
  uploadGeometry,
  deleteSimulation,
  subscribeToSimulation,
};

export default SimulationService;
