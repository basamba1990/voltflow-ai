// File: src/services/simulation.service.ts
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

export interface UploadGeometryParams {
  file: File;
  simulationId?: string;
  geometry_config?: any;
}

// -----------------------------------------------------------------------------
// FONCTIONS EXPORTÉES
// -----------------------------------------------------------------------------

export const getSimulations = async (): Promise<Simulation[]> => {
  const { data, error } = await supabase
    .from('simulations')
    .select('*, simulation_results (*)')
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Erreur récupération simulations:', error);
    throw new Error(`Impossible de récupérer les simulations: ${error.message}`);
  }
  
  return data as Simulation[];
};

export const getSimulationById = async (id: string): Promise<Simulation> => {
  const { data, error } = await supabase
    .from('simulations')
    .select('*, simulation_results (*)')
    .eq('id', id)
    .single();
  
  if (error) {
    console.error(`Erreur récupération simulation ${id}:`, error);
    throw new Error(`Impossible de récupérer la simulation: ${error.message}`);
  }
  
  return data as Simulation;
};

export const createSimulation = async (params: { 
  name: string; 
  description?: string; 
  geometryType: string; 
  config: SimulationConfig 
}): Promise<Simulation> => {
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
      status: 'pending',
      progress: 0
    })
    .select()
    .single();
  
  if (error) {
    console.error('Erreur création simulation:', error);
    throw new Error(`Impossible de créer la simulation: ${error.message}`);
  }
  
  return data as Simulation;
};

export const updateSimulation = async (id: string, params: { 
  name: string; 
  description?: string; 
  geometryType: string; 
  config: SimulationConfig 
}): Promise<Simulation> => {
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
    throw new Error(`Impossible de mettre à jour la simulation: ${error.message}`);
  }
  
  return data as Simulation;
};

export const startSimulation = async (simulationId: string): Promise<StartSimulationResponse> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Authentification requise');

  try {
    console.log(`🚀 Lancement simulation ${simulationId} pour utilisateur ${session.user.id}`);
    
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

    // Mettre à jour le statut en "running" avant d'appeler l'Edge Function
    await supabase
      .from('simulations')
      .update({
        status: 'running',
        progress: 10,
        started_at: new Date().toISOString()
      })
      .eq('id', simulationId);

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
      await supabase
        .from('simulations')
        .update({
          status: 'failed',
          error_message: error.message,
          completed_at: new Date().toISOString()
        })
        .eq('id', simulationId);
      
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
    
    // Marquer la simulation comme échouée
    await supabase
      .from('simulations')
      .update({
        status: 'failed',
        error_message: error.message,
        completed_at: new Date().toISOString()
      })
      .eq('id', simulationId)
      .catch(e => console.error('Erreur lors de la mise à jour du statut:', e));
    
    throw error;
  }
};

export const cancelSimulation = async (simulationId: string): Promise<void> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Authentification requise');

  const { error } = await supabase
    .from('simulations')
    .update({
      status: 'cancelled',
      completed_at: new Date().toISOString()
    })
    .eq('id', simulationId)
    .eq('user_id', session.user.id);

  if (error) {
    console.error(`Erreur annulation simulation ${simulationId}:`, error);
    throw new Error(`Impossible d'annuler la simulation: ${error.message}`);
  }
};

export const uploadGeometry = async (params: UploadGeometryParams): Promise<UploadGeometryResponse> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Authentification requise');

  try {
    // Vérifier le type de fichier
    const allowedTypes = ['stl', 'step', 'stp', 'obj', 'iges', 'igs', 'vtp', 'vti', 'ply', 'vtk'];
    const fileExt = params.file.name.toLowerCase().split('.').pop();
    
    if (!fileExt || !allowedTypes.includes(fileExt)) {
      throw new Error(`Format non supporté: ${fileExt}. Formats acceptés: ${allowedTypes.join(', ')}`);
    }

    // Créer un nom de fichier unique
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 9);
    const safeName = params.file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const uniqueFileName = `geometry_${timestamp}_${randomId}_${safeName}`;
    const filePath = `${session.user.id}/${uniqueFileName}`;

    console.log(`📤 Upload géométrie: ${params.file.name} (${params.file.size} bytes)`);

    // Upload vers Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('simulation-files')
      .upload(filePath, params.file, {
        cacheControl: '3600',
        upsert: false,
        contentType: params.file.type || 'application/octet-stream'
      });

    if (uploadError) {
      console.error('❌ Erreur upload:', uploadError);
      throw new Error(`Échec de l'upload: ${uploadError.message}`);
    }

    // Récupérer l'URL publique
    const { data: { publicUrl } } = supabase.storage
      .from('simulation-files')
      .getPublicUrl(filePath);

    console.log(`✅ Upload réussi: ${publicUrl}`);

    // Mettre à jour la simulation si ID fourni
    if (params.simulationId) {
      const updateData = {
        geometry_config: {
          ...(params.geometry_config || {}),
          file_url: publicUrl,
          file_name: params.file.name,
          file_path: filePath,
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
      } else {
        console.log(`✅ Simulation ${params.simulationId} mise à jour avec la géométrie`);
      }
    }

    return {
      success: true,
      fileUrl: publicUrl,
      fileName: params.file.name,
      fileSize: params.file.size,
      path: filePath
    };

  } catch (error: any) {
    console.error('❌ Erreur upload géométrie:', error);
    throw error;
  }
};

export const uploadGeometryViaEdgeFunction = async (params: UploadGeometryParams): Promise<UploadGeometryResponse> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Authentification requise');

  try {
    // Convertir le fichier en base64
    const reader = new FileReader();
    const base64Data = await new Promise<string>((resolve, reject) => {
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = () => reject(new Error('Erreur de lecture du fichier'));
      reader.readAsDataURL(params.file);
    });

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
      console.error('❌ Erreur Edge Function upload-geometry:', error);
      throw new Error(`Upload échoué: ${error.message}`);
    }

    return data as UploadGeometryResponse;

  } catch (error: any) {
    console.error('❌ Erreur upload via Edge Function:', error);
    throw error;
  }
};

export const deleteSimulation = async (id: string): Promise<void> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Authentification requise');

  const { error } = await supabase
    .from('simulations')
    .delete()
    .eq('id', id)
    .eq('user_id', session.user.id);

  if (error) {
    console.error(`Erreur suppression simulation ${id}:`, error);
    throw new Error(`Impossible de supprimer la simulation: ${error.message}`);
  }
};

export const subscribeToSimulation = (id: string, callback: (payload: any) => void) => {
  return supabase.channel(`simulation-${id}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'simulations',
        filter: `id=eq.${id}`
      },
      callback
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'simulation_results',
        filter: `simulation_id=eq.${id}`
      },
      callback
    )
    .subscribe();
};

export const unsubscribeFromChannel = (channel: any) => {
  if (channel) {
    supabase.removeChannel(channel);
  }
};

export const getSimulationProgress = async (simulationId: string): Promise<{ progress: number; status: SimulationStatus }> => {
  const { data, error } = await supabase
    .from('simulations')
    .select('progress, status')
    .eq('id', simulationId)
    .single();

  if (error) {
    console.error(`Erreur récupération progression ${simulationId}:`, error);
    throw error;
  }

  return {
    progress: data.progress || 0,
    status: data.status as SimulationStatus
  };
};

// -----------------------------------------------------------------------------
// SERVICE EXPORT
// -----------------------------------------------------------------------------

export const SimulationService = {
  getSimulations,
  getSimulationById,
  createSimulation,
  updateSimulation,
  startSimulation,
  cancelSimulation,
  uploadGeometry,
  uploadGeometryViaEdgeFunction,
  deleteSimulation,
  subscribeToSimulation,
  unsubscribeFromChannel,
  getSimulationProgress
};

export default SimulationService;
