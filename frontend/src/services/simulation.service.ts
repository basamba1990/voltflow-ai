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
// FONCTIONS EXPORTÉES - VERSIONS CORRIGÉES
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

// ✅ CORRECTION CRITIQUE: Payload Edge Function corrigé
export const startSimulation = async (simulationId: string): Promise<StartSimulationResponse> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Authentification requise');

  // ✅ CORRECTION: simulationId (pas simulation_id) - MATCH AVEC EDGE FUNCTION
  const { data, error } = await supabase.functions.invoke('simulate', {
    body: { simulationId }  // <-- CORRECT - Edge Function attend simulationId
  });

  if (error) {
    console.error('[SimulationService] Erreur Edge Function:', error);
    throw error;
  }
  
  return data;
};

// ✅ CORRECTION CRITIQUE: Bucket unifié simulation-files
export const uploadGeometry = async (params: { 
  file: File; 
  simulationId?: string;
}): Promise<UploadGeometryResponse> => {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id || 'anonymous';
  const folder = userId;

  // Nettoyage du nom de fichier
  const fileExt = params.file.name.split('.').pop()?.toLowerCase();
  const safeName = params.file.name
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "");

  const fileName = `${folder}/${Date.now()}_${safeName}`;

  // ✅ CORRECTION: Upload vers simulation-files (même bucket que l'Edge Function)
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('simulation-files')  // <-- CHANGÉ DE 'geometries' À 'simulation-files'
    .upload(fileName, params.file, {
      cacheControl: '3600',
      upsert: false,
      contentType: 'application/octet-stream'
    });

  if (uploadError) {
    console.error("[SimulationService] Erreur d'upload:", uploadError);
    throw new Error(`Échec de l'upload: ${uploadError.message}`);
  }

  // ✅ CORRECTION: Récupération URL depuis simulation-files
  const { data: { publicUrl } } = supabase.storage
    .from('simulation-files')  // <-- CHANGÉ DE 'geometries' À 'simulation-files'
    .getPublicUrl(fileName);

  // ✅ CORRECTION: Mise à jour simulation avec structure geometry_config attendue par l'Edge Function
  if (params.simulationId) {
    try {
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
        console.warn(`[SimulationService] Erreur update simulation: ${updateError.message}`);
        // Ne pas échouer l'upload pour ça
      }
    } catch (updateErr) {
      console.warn(`[SimulationService] Erreur lors de la mise à jour: ${updateErr}`);
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
// FONCTIONS UTILITAIRES AJOUTÉES
// -----------------------------------------------------------------------------

export const getSimulationProgress = async (simulationId: string) => {
  const { data, error } = await supabase
    .from('simulations')
    .select('progress, status, started_at, completed_at')
    .eq('id', simulationId)
    .single();
  
  if (error) throw error;
  return data;
};

export const cancelSimulation = async (simulationId: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Authentification requise');

  const { error } = await supabase
    .from('simulations')
    .update({
      status: 'cancelled',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', simulationId)
    .eq('user_id', session.user.id);

  if (error) throw error;
  return { success: true };
};

export const uploadGeometryViaEdgeFunction = async (params: {
  file: File;
  simulationId: string;
  geometry_config?: any;
}): Promise<UploadGeometryResponse> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Authentification requise');

  // Convertir le fichier en base64
  const arrayBuffer = await params.file.arrayBuffer();
  const base64Data = btoa(
    new Uint8Array(arrayBuffer).reduce(
      (data, byte) => data + String.fromCharCode(byte),
      ''
    )
  );

  // Appeler l'Edge Function upload-geometry
  const { data, error } = await supabase.functions.invoke('upload-geometry', {
    body: {
      fileName: params.file.name,
      fileData: base64Data,
      userId: session.user.id,
      simulationId: params.simulationId,
      geometry_config: params.geometry_config || {}
    }
  });

  if (error) {
    console.error('[SimulationService] Erreur Edge Function upload-geometry:', error);
    throw error;
  }

  return data;
};

// -----------------------------------------------------------------------------
// DEFAULT EXPORT - VERSION COMPLÈTE CORRIGÉE
// -----------------------------------------------------------------------------

export const SimulationService = {
  // Fonctions principales
  getSimulations,
  getSimulationById,
  createSimulation,
  updateSimulation,
  startSimulation,
  uploadGeometry,
  deleteSimulation,
  
  // Fonctions utilitaires
  getSimulationProgress,
  cancelSimulation,
  uploadGeometryViaEdgeFunction,
  
  // Abonnements
  subscribeToSimulation,
  unsubscribeFromChannel
};

export default SimulationService;
