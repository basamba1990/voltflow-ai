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
  
  // Préparer les données d'insertion
  const simulationData: any = {
    name: params.name,
    description: params.description,
    geometry_type: params.geometryType,
    geometry_config: params.config.geometry_config,
    boundary_conditions: params.config.boundary_conditions as any,
    material_id: params.config.material_id,
    mesh_density: params.config.mesh_density,
    solver_type: params.config.solver_type || 'fem_fortran',
    status: 'pending'
  };

  // Ajouter user_id seulement si l'utilisateur est connecté
  // (colonne nullable dans la base de données)
  if (session?.user?.id) {
    simulationData.user_id = session.user.id;
  }

  const { data, error } = await supabase
    .from('simulations')
    .insert(simulationData)
    .select()
    .single();
    
  if (error) {
    console.error('❌ Erreur création simulation:', error);
    throw error;
  }
  
  return data;
};

export const updateSimulation = async (id: string, params: { 
  name: string; 
  description?: string; 
  geometryType: string; 
  config: SimulationConfig 
}) => {
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

export const startSimulation = async (simulationId: string): Promise<StartSimulationResponse> => {
  try {
    console.log('🚀 Lancement de la simulation:', simulationId);
    
    const { data, error } = await supabase.functions.invoke('run-simulation', {
      body: { simulationId }
    });

    if (error) {
      console.error('❌ Erreur lors de l\'appel à la fonction edge:', error);
      throw error;
    }
    
    return data;
    
  } catch (error: any) {
    console.error('❌ Erreur startSimulation:', error);
    throw error;
  }
};

export const uploadGeometry = async (params: { 
  file: File; 
  simulationId?: string;
}): Promise<UploadGeometryResponse> => {
  // Détermination de l'identité (utilisateur connecté ou anonyme)
  const { data: { session } } = await supabase.auth.getSession();
  const folder = session?.user?.id || 'anonymous';

  // Nettoyage du nom de fichier
  const fileExt = params.file.name.split('.').pop()?.toLowerCase();
  const safeName = params.file.name
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "");

  const fileName = `${folder}/${Date.now()}_${safeName}`;

  console.log('📤 Tentative d\'upload vers:', fileName);

  // Upload vers le bucket 'geometries'
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('geometries')
    .upload(fileName, params.file, {
      cacheControl: '3600',
      upsert: false,
      contentType: params.file.type || 'application/octet-stream'
    });

  if (uploadError) {
    console.error("❌ Erreur d'upload détaillée:", uploadError);
    
    // Messages d'erreur spécifiques
    let errorMessage = uploadError.message;
    if (uploadError.message.includes('413')) {
      errorMessage = 'Fichier trop volumineux. Taille maximum: 50MB';
    } else if (uploadError.message.includes('403')) {
      errorMessage = 'Permission refusée. Contactez l\'administrateur.';
    } else if (uploadError.message.includes('Duplicate')) {
      errorMessage = 'Un fichier avec ce nom existe déjà.';
    }
    
    throw new Error(errorMessage);
  }

  console.log('✅ Upload réussi, récupération URL...');

  // Récupération de l'URL publique
  const { data: { publicUrl } } = supabase.storage
    .from('geometries')
    .getPublicUrl(fileName);

  // Mise à jour optionnelle de la simulation
  if (params.simulationId) {
    console.log('🔄 Mise à jour de la simulation:', params.simulationId);
    
    const { error: updateError } = await supabase
      .from('simulations')
      .update({
        geometry_config: {
          file_url: publicUrl,
          file_name: params.file.name,
          file_size: params.file.size,
          file_path: fileName,
          type: fileExt || 'stl'
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', params.simulationId);

    if (updateError) {
      console.warn('⚠️ Erreur lors de la mise à jour simulation:', updateError);
      // Ne pas échouer complètement si seulement la mise à jour échoue
    }
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
