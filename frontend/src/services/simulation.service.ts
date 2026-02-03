// File: src/services/simulation.service.ts - VERSION CORRIGÉE
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
  
  if (error) {
    console.error('Erreur récupération simulations:', error);
    throw error;
  }
  
  return data as Simulation[];
};

export const getSimulationById = async (id: string) => {
  const { data, error } = await supabase
    .from('simulations')
    .select('*, simulation_results (*)')
    .eq('id', id)
    .single();
  
  if (error) {
    console.error(`Erreur récupération simulation ${id}:`, error);
    throw error;
  }
  
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
  
  if (error) {
    console.error('Erreur création simulation:', error);
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
  
  if (error) {
    console.error(`Erreur mise à jour simulation ${id}:`, error);
    throw error;
  }
  
  return data;
};

export const startSimulation = async (simulationId: string): Promise<StartSimulationResponse> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Authentification requise');

  console.log(`🚀 Lancement simulation ${simulationId} pour utilisateur ${session.user.id}`);
  
  try {
    // Récupérer la simulation
    const simulation = await getSimulationById(simulationId);
    
    // Vérifier si la simulation est déjà en cours
    if (simulation.status === 'running') {
      throw new Error('La simulation est déjà en cours d\'exécution');
    }
    
    if (simulation.status === 'completed') {
      throw new Error('La simulation est déjà terminée');
    }
    
    // Préparer la configuration
    const config = {
      geometry_config: simulation.geometry_config,
      boundary_conditions: simulation.boundary_conditions,
      material_id: simulation.material_id,
      mesh_density: simulation.mesh_density,
      solver_type: simulation.solver_type || 'fem_fortran',
    };

    console.log('📤 Appel Edge Function simulate avec config:', config);

    // Mettre à jour le statut en "running"
    const { error: updateError } = await supabase
      .from('simulations')
      .update({
        status: 'running',
        progress: 10,
        started_at: new Date().toISOString()
      })
      .eq('id', simulationId);

    if (updateError) {
      console.error('❌ Erreur mise à jour statut running:', updateError);
    }

    // Appeler la fonction Edge 'simulate'
    const { data, error } = await supabase.functions.invoke('simulate', {
      body: {
        simulation_id: simulationId,
        config,
        user_id: session.user.id
      }
    });

    if (error) {
      console.error('❌ Erreur Edge Function simulate:', error);
      
      // Marquer la simulation comme échouée
      const { error: failError } = await supabase
        .from('simulations')
        .update({
          status: 'failed',
          error_message: error.message,
          completed_at: new Date().toISOString()
        })
        .eq('id', simulationId);
      
      if (failError) {
        console.error('❌ Erreur mise à jour statut failed:', failError);
      }
      
      throw new Error(`Impossible de lancer la simulation: ${error.message}`);
    }

    console.log('✅ Edge Function simulate appelée avec succès:', data);
    
    // Vérifier la réponse
    if (!data.success) {
      throw new Error(data.error || 'Erreur inconnue lors du lancement de la simulation');
    }

    return {
      success: true,
      simulation_id: simulationId,
      status: 'running',
      results: data.results,
      message: 'Simulation lancée avec succès'
    };

  } catch (error: any) {
    console.error('❌ Erreur dans startSimulation:', error);
    
    // Marquer la simulation comme échouée (sans .catch)
    try {
      const { error: updateError } = await supabase
        .from('simulations')
        .update({
          status: 'failed',
          error_message: error.message,
          completed_at: new Date().toISOString()
        })
        .eq('id', simulationId);
      
      if (updateError) {
        console.error('❌ Erreur mise à jour statut failed:', updateError);
      }
    } catch (e) {
      console.error('❌ Erreur catch mise à jour:', e);
    }
    
    throw error;
  }
};

export const uploadGeometry = async (params: { 
  file: File; 
  simulationId?: string;
}): Promise<UploadGeometryResponse> => {
  try {
    // Vérifier le type de fichier
    const allowedTypes = ['stl', 'step', 'stp', 'obj', 'iges', 'igs', 'vtp', 'vti', 'ply', 'vtk'];
    const fileExt = params.file.name.toLowerCase().split('.').pop();
    
    if (!fileExt || !allowedTypes.includes(fileExt)) {
      throw new Error(`Format non supporté: ${fileExt}. Formats acceptés: ${allowedTypes.join(', ')}`);
    }

    // Obtenir la session utilisateur
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id || 'anonymous';
    
    // Créer un nom de fichier unique
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 9);
    const safeName = params.file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileName = `${userId}/${timestamp}_${randomId}_${safeName}`;

    console.log(`📤 Upload géométrie: ${params.file.name} vers ${fileName}`);

    // Upload vers Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('geometries')
      .upload(fileName, params.file, {
        cacheControl: '3600',
        upsert: false,
        contentType: params.file.type || 'application/octet-stream'
      });

    if (uploadError) {
      console.error('❌ Erreur upload:', uploadError);
      throw new Error(`Upload échoué: ${uploadError.message}`);
    }

    // Récupérer l'URL publique
    const { data: { publicUrl } } = supabase.storage
      .from('geometries')
      .getPublicUrl(fileName);

    console.log(`✅ Upload réussi: ${publicUrl}`);

    // Mettre à jour la simulation si ID fourni
    if (params.simulationId) {
      const updateData = {
        geometry_config: {
          file_url: publicUrl,
          file_name: params.file.name,
          file_path: fileName,
          file_size: params.file.size,
          file_type: fileExt,
          uploaded_at: new Date().toISOString()
        },
        updated_at: new Date().toISOString()
      };

      const { error: updateError } = await supabase
        .from('simulations')
        .update(updateData)
        .eq('id', params.simulationId);

      if (updateError) {
        console.warn('⚠️ Simulation non mise à jour:', updateError);
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
    console.error('❌ Erreur upload géométrie:', error);
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
