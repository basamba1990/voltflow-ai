import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

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

export const startSimulation = async (simulationId: string) => {
  const { data: session } = await supabase.auth.getSession();
  const userId = session?.session?.user?.id;
  
  const { data, error } = await supabase.functions.invoke('simulate', {
    body: { simulation_id: simulationId, user_id: userId },
  });

  if (error) throw error;
  return data;
};
