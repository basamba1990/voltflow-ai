import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

// -----------------------------------------------------------------------------
// TYPES
// -----------------------------------------------------------------------------
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
  solver_type?: string;
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
}

export interface UploadGeometryResponse {
  success: boolean;
  fileUrl: string;
  fileName: string;
  fileSize?: number;
  fileType?: string;
  path?: string;
}

// -----------------------------------------------------------------------------
// UTILS
// -----------------------------------------------------------------------------
export const getContentTypeForFile = (fileName: string): string => {
  const ext = fileName.toLowerCase().split('.').pop();
  const mimeMap: Record<string, string> = {
    'stl': 'application/sla',
    'step': 'application/octet-stream',
    'stp': 'application/octet-stream',
    'iges': 'application/octet-stream',
    'igs': 'application/octet-stream',
    'vtk': 'text/plain',
    'vtp': 'application/octet-stream',
    'obj': 'model/obj',
    'ply': 'text/plain'
  };
  return mimeMap[ext || ''] || 'application/octet-stream';
};

const arrayBufferToBase64 = (arrayBuffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
};

// -----------------------------------------------------------------------------
// CORE FUNCTIONS
// -----------------------------------------------------------------------------

export const getSimulations = async (
  options: { limit?: number; status?: SimulationStatus; offset?: number } = {}
): Promise<Simulation[]> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Utilisateur non authentifié');

    const { limit = 10, status, offset = 0 } = options;
    let query = supabase
      .from('simulations')
      .select('*, simulation_results (*)')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (error: any) {
    console.error('❌ getSimulations error:', error);
    throw error;
  }
};

export const getSimulationById = async (simulationId: string): Promise<Simulation | null> => {
  const { data, error } = await supabase
    .from('simulations')
    .select('*, simulation_results (*)')
    .eq('id', simulationId)
    .single();
  if (error) return null;
  return data;
};

export const createSimulation = async (params: CreateSimulationParams): Promise<Simulation> => {
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

export const updateSimulation = async (simulationId: string, params: any): Promise<Simulation> => {
  const { data, error } = await supabase
    .from('simulations')
    .update(params)
    .eq('id', simulationId)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const uploadGeometry = async (params: { file: File; userId: string; simulationId?: string; geometryConfig?: any }): Promise<UploadGeometryResponse> => {
  const { file, userId, simulationId, geometryConfig } = params;
  try {
    const contentType = getContentTypeForFile(file.name);
    const fileName = `${userId}/${Date.now()}_${file.name}`;

    // Tentative Directe
    const { data, error: uploadError } = await supabase.storage
      .from('geometries')
      .upload(fileName, file, { contentType, upsert: false });

    if (uploadError) {
      // Fallback Edge Function
      const arrayBuffer = await file.arrayBuffer();
      const { data: edgeData, error: edgeError } = await supabase.functions.invoke('upload-geometry', {
        body: { fileName: file.name, fileData: arrayBufferToBase64(arrayBuffer), userId, simulationId, geometry_config: geometryConfig }
      });
      if (edgeError) throw edgeError;
      return edgeData;
    }

    const { data: { publicUrl } } = supabase.storage.from('geometries').getPublicUrl(fileName);

    if (simulationId) {
      await supabase.from('simulations').update({
        geometry_config: { ...geometryConfig, file_url: publicUrl, file_name: file.name, file_size: file.size, uploaded_at: new Date().toISOString() }
      }).eq('id', simulationId);
    }

    return { success: true, fileUrl: publicUrl, fileName: file.name, path: fileName };
  } catch (error: any) {
    console.error('❌ Upload error:', error);
    throw error;
  }
};

export const startSimulation = async (simulationId: string): Promise<StartSimulationResponse> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Authentification requise');

    const { data: simulation } = await supabase.from('simulations').select('*').eq('id', simulationId).single();

    await supabase.from('simulations').update({ 
      status: 'running', 
      progress: 0, 
      started_at: new Date().toISOString(),
      error_message: null 
    }).eq('id', simulationId);

    const { data, error } = await supabase.functions.invoke('simulate', {
      body: { simulation_id: simulationId, config: simulation, user_id: session.user.id }
    });

    if (error) throw error;
    return { success: true, simulation_id: simulationId, status: 'running' };
  } catch (error: any) {
    await supabase.from('simulations').update({ status: 'failed', error_message: error.message }).eq('id', simulationId);
    throw error;
  }
};

export const deleteSimulation = async (simulationId: string): Promise<void> => {
  const { error } = await supabase.from('simulations').delete().eq('id', simulationId);
  if (error) throw error;
};

// -----------------------------------------------------------------------------
// REALTIME FUNCTIONS (REQUIRED FOR DASHBOARD)
// -----------------------------------------------------------------------------
export const subscribeToSimulation = (simulationId: string, callback: (payload: any) => void) => {
  return supabase
    .channel(`simulation-updates-${simulationId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'simulations',
      filter: `id=eq.${simulationId}`
    }, callback)
    .subscribe();
};

export const unsubscribeFromChannel = (channel: any) => {
  if (channel) supabase.removeChannel(channel);
};

// -----------------------------------------------------------------------------
// EXPORT DEFAULT SERVICE
// -----------------------------------------------------------------------------
export const SimulationService = {
  getSimulations,
  getSimulationById,
  createSimulation,
  updateSimulation,
  uploadGeometry,
  startSimulation,
  deleteSimulation,
  subscribeToSimulation,
  unsubscribeFromChannel
};

export default SimulationService;
