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
}

// -----------------------------------------------------------------------------
// SERVICES DE RÉCUPÉRATION ET CRÉATION
// -----------------------------------------------------------------------------

export const getSimulations = async () => {
  const { data, error } = await supabase
    .from('simulations')
    .select('*, simulation_results(*)')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as Simulation[];
};

export const getSimulationById = async (id: string) => {
  const { data, error } = await supabase
    .from('simulations')
    .select('*, simulation_results(*)')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data as Simulation;
};

export const createSimulation = async (simulation: Omit<Database['public']['Tables']['simulations']['Insert'], 'id' | 'created_at' | 'updated_at'>) => {
  const { data, error } = await supabase
    .from('simulations')
    .insert(simulation)
    .select()
    .single();

  if (error) throw error;
  return data as Simulation;
};

export const startSimulation = async (id: string): Promise<StartSimulationResponse> => {
  const { data, error } = await supabase.functions.invoke('run-simulation', {
    body: { simulationId: id }
  });

  if (error) throw error;
  return data;
};

// -----------------------------------------------------------------------------
// SERVICE D'UPLOAD CORRIGÉ (Cœur du problème)
// -----------------------------------------------------------------------------

/**
 * Télécharge un fichier de géométrie vers Supabase Storage.
 * Gère automatiquement les utilisateurs non-connectés via le dossier 'anonymous'.
 */
export const uploadGeometry = async (params: { 
  file: File, 
  simulationId?: string 
}) => {
  // 1. Détermination de l'identité (ne bloque plus si user est null)
  const { data: { session } } = await supabase.auth.getSession();
  const folder = session?.user?.id || 'anonymous';

  // 2. Nettoyage du nom de fichier (suppression espaces et caractères spéciaux)
  const fileExt = params.file.name.split('.').pop();
  const safeName = params.file.name
    .replace(/[^\x00-\x7F]/g, "") // Enlever non-ASCII
    .replace(/\s+/g, "_")          // Remplacer espaces par _
    .replace(/[^a-zA-Z0-9._-]/g, ""); // Sécurité supplémentaire

  const fileName = `${folder}/${Date.now()}_${safeName}`;

  // 3. Upload vers le bucket 'geometries'
  const { error: uploadError } = await supabase.storage
    .from('geometries')
    .upload(fileName, params.file, {
      cacheControl: '3600',
      upsert: false,
      contentType: params.file.type || 'application/octet-stream'
    });

  if (uploadError) {
    console.error("Erreur détaillée Storage:", uploadError);
    throw new Error(`Échec de l'upload: ${uploadError.message}`);
  }

  // 4. Récupération de l'URL publique
  const { data: { publicUrl } } = supabase.storage
    .from('geometries')
    .getPublicUrl(fileName);

  // 5. Mise à jour optionnelle de la table simulation
  if (params.simulationId) {
    const { error: updateError } = await supabase
      .from('simulations')
      .update({
        geometry_config: {
          file_url: publicUrl,
          file_name: params.file.name,
          file_size: params.file.size,
          file_path: fileName,
          type: fileExt?.toLowerCase() || 'stl'
        }
      })
      .eq('id', params.simulationId);
    
    if (updateError) throw updateError;
  }

  return {
    success: true,
    fileUrl: publicUrl,
    fileName: params.file.name,
    fileSize: params.file.size,
    path: fileName
  };
};

// -----------------------------------------------------------------------------
// SERVICES DE GESTION ET TEMPS RÉEL
// -----------------------------------------------------------------------------

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
  if (channel) {
    supabase.removeChannel(channel);
  }
};

// -----------------------------------------------------------------------------
// EXPORT UNIQUE
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
