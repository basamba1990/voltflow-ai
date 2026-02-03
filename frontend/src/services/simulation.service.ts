import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

// -----------------------------------------------------------------------------
// TYPES
// -----------------------------------------------------------------------------
export type Simulation = Database['public']['Tables']['simulations']['Row'] & {
  simulation_results?: Database['public']['Tables']['simulation_results']['Row'][];
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
// FONCTIONS EXPORTÉES
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

export const createSimulation = async (params: { 
  name: string; 
  description?: string; 
  geometryType: string; 
  config: SimulationConfig 
}) => {
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

export const updateSimulation = async (id: string, params: { 
  name: string; 
  description?: string; 
  geometryType: string; 
  config: SimulationConfig 
}) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Authentification requise');

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
  if (error) throw error;
  return data;
};

// 🔥 CORRECTION CRITIQUE : Appeler la bonne Edge Function
export const startSimulation = async (simulationId: string): Promise<StartSimulationResponse> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Authentification requise');

  // 1. Récupérer d'abord la simulation complète
  const simulation = await getSimulationById(simulationId);
  
  // 2. Préparer la configuration complète
  const config = {
    geometry_config: simulation.geometry_config,
    boundary_conditions: simulation.boundary_conditions,
    material_id: simulation.material_id,
    mesh_density: simulation.mesh_density,
    solver_type: simulation.solver_type || 'fem_fortran',
  };

  // 🔥 CORRECTION : Appeler 'simulate' et non 'run-simulation'
  const { data, error } = await supabase.functions.invoke('simulate', {
    body: { 
      simulation_id: simulationId,
      config,
      user_id: session.user.id
    }
  });

  if (error) {
    console.error('❌ Erreur Edge Function:', error);
    throw new Error(`Impossible de lancer la simulation: ${error.message}`);
  }
  
  return data;
};

// 🔥 CORRECTION UPLOAD : Version simplifiée et robuste
export const uploadGeometry = async (params: { 
  file: File; 
  simulationId?: string;
}): Promise<UploadGeometryResponse> => {
  try {
    // 1. Créer un nom de fichier simple et unique
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 9);
    const fileExt = params.file.name.split('.').pop()?.toLowerCase() || 'stl';
    const safeName = `geometry_${timestamp}_${randomId}.${fileExt}`;
    
    // 2. Déterminer le dossier (utilisateur ou anonyme)
    const { data: { session } } = await supabase.auth.getSession();
    const folder = session?.user?.id || 'anonymous';
    const fileName = `${folder}/${safeName}`;

    console.log('📤 Début upload vers bucket geometries:', fileName);

    // 3. Upload vers Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('geometries')
      .upload(fileName, params.file, {
        cacheControl: '3600',
        upsert: false,
        contentType: params.file.type || 'application/octet-stream'
      });

    if (uploadError) {
      console.error('❌ Erreur upload Supabase:', uploadError);
      throw new Error(`Upload échoué: ${uploadError.message}`);
    }

    // 4. Récupérer l'URL publique
    const { data: { publicUrl } } = supabase.storage
      .from('geometries')
      .getPublicUrl(fileName);

    console.log('✅ Upload réussi:', publicUrl);

    // 5. Mettre à jour la simulation si ID fourni
    if (params.simulationId) {
      try {
        await supabase
          .from('simulations')
          .update({
            geometry_config: {
              file_url: publicUrl,
              file_name: params.file.name,
              file_size: params.file.size,
              file_path: fileName,
              type: fileExt,
              uploaded_at: new Date().toISOString()
            },
            updated_at: new Date().toISOString()
          })
          .eq('id', params.simulationId);
        
        console.log('✅ Simulation mise à jour:', params.simulationId);
      } catch (updateError) {
        console.warn('⚠️ Simulation non mise à jour:', updateError);
        // Ne pas bloquer l'upload si la mise à jour échoue
      }
    }

    return {
      success: true,
      fileUrl: publicUrl,
      fileName: params.file.name,
      fileSize: params.file.size,
      path: fileName
    };

  } catch (error: any) {
    console.error('❌ Erreur complète upload:', error);
    throw error;
  }
};

export const deleteSimulation = async (id: string) => {
  const { error } = await supabase.from('simulations').delete().eq('id', id);
  if (error) throw error;
};

export const subscribeToSimulation = (id: string, callback: (payload: any) => void) => {
  return supabase.channel(`sim-${id}`)
    .on('postgres_changes', { 
      event: '*', 
      schema: 'public', 
      table: 'simulations', 
      filter: `id=eq.${id}` 
    }, callback)
    .subscribe();
};

export const unsubscribeFromChannel = (channel: any) => {
  if (channel) supabase.removeChannel(channel);
};

// -----------------------------------------------------------------------------
// DEFAULT EXPORT
// -----------------------------------------------------------------------------

export const SimulationService = {
  getSimulations,
  getSimulationById,
  createSimulation,
  updateSimulation,
  startSimulation,
  uploadGeometry,
  deleteSimulation,
  subscribeToSimulation,
  unsubscribeFromChannel
};

export default SimulationService;
