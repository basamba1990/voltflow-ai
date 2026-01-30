import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

// -----------------------------------------------------------------------------
// TYPES
// -----------------------------------------------------------------------------
export type Simulation = Database['public']['Tables']['simulations']['Row'] & {
  simulation_results?: Database['public']['Tables']['simulation_results']['Row'][];
};

export type SimulationStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type MeshType = 'tetrahedral' | 'hexahedral' | 'polyhedral' | 'unstructured' | 'structured' | 'surface';
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
}

// -----------------------------------------------------------------------------
// FONCTIONS EXPORTÉES (Named Exports pour compatibilité Dashboard.tsx)
// -----------------------------------------------------------------------------

export const getSimulations = async () => {
  const { data, error } = await supabase
    .from('simulations')
    .select('*, simulation_results (*)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Simulation[];
};

export const getSimulationById = async (id: string) => {
  const { data, error } = await supabase
    .from('simulations')
    .select('*, simulation_results (*)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as Simulation;
};

export const createSimulation = async (params: { name: string; description?: string; geometryType: string; config: SimulationConfig }) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Authentification requise');

  const { data, error } = await supabase
    .from('simulations')
    .insert({
      user_id: session.user.id,
      name: params.name,
      description: params.description,
      geometry_type: params.geometryType,
      geometry_config: params.config.geometry_config,
      boundary_conditions: params.config.boundary_conditions as any,
      material_id: params.config.material_id,
      mesh_density: params.config.mesh_density,
      solver_type: params.config.solver_type || 'fem_fortran',
      status: 'pending'
    })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const startSimulation = async (simulationId: string, config?: SimulationConfig): Promise<StartSimulationResponse> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Authentification requise');

  let finalConfig = config;
  if (!finalConfig) {
    const sim = await getSimulationById(simulationId);
    finalConfig = {
      geometry_config: sim.geometry_config as any,
      boundary_conditions: sim.boundary_conditions as any,
      material_id: sim.material_id!,
      mesh_density: sim.mesh_density as any,
      solver_type: sim.solver_type as any
    };
  }

  const { data, error } = await supabase.functions.invoke('simulate', {
    body: { simulation_id: simulationId, config: finalConfig }
  });

  if (error) throw error;
  return data;
};

export const uploadGeometry = async (params: { file: File; userId: string; simulationId?: string }): Promise<UploadGeometryResponse> => {
  const fileExt = params.file.name.split('.').pop();
  const fileName = `${params.userId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
  
  const { data, error } = await supabase.storage
    .from('simulation-files')
    .upload(fileName, params.file, { contentType: 'application/octet-stream' });

  if (error) throw error;

  const { data: { publicUrl } } = supabase.storage.from('simulation-files').getPublicUrl(fileName);

  if (params.simulationId) {
    await supabase.from('simulations').update({
      geometry_config: {
        file_url: publicUrl,
        file_name: params.file.name,
        file_size: params.file.size,
        file_path: fileName
      }
    }).eq('id', params.simulationId);
  }

  return {
    success: true,
    fileUrl: publicUrl,
    fileName: params.file.name,
    fileSize: params.file.size,
    path: fileName
  };
};

export const deleteSimulation = async (id: string) => {
  const { error } = await supabase.from('simulations').delete().eq('id', id);
  if (error) throw error;
};

export const subscribeToSimulation = (id: string, callback: (payload: any) => void) => {
  return supabase.channel(`sim-${id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'simulations', filter: `id=eq.${id}` }, callback)
    .subscribe();
};

export const unsubscribeFromChannel = (channel: any) => {
  if (channel) supabase.removeChannel(channel);
};

// -----------------------------------------------------------------------------
// DEFAULT EXPORT (Objet regroupant tout)
// -----------------------------------------------------------------------------

export const SimulationService = {
  getSimulations,
  getSimulationById,
  createSimulation,
  startSimulation,
  uploadGeometry,
  deleteSimulation,
  subscribeToSimulation,
  unsubscribeFromChannel
};

export default SimulationService;
