// File: src/services/simulation.service.ts - VERSION COMPLÈTEMENT CORRIGÉE
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
// FONCTIONS EXPORTÉES - STRUCTURE ROBUSTE INSPIRÉE DU PROJET VIDÉO
// -----------------------------------------------------------------------------

export const getSimulations = async (): Promise<Simulation[]> => {
  try {
    const { data: session, error: authError } = await supabase.auth.getSession();
    if (authError || !session?.session?.user?.id) {
      throw new Error('Utilisateur non authentifié');
    }

    const userId = session.session.user.id;

    const { data, error } = await supabase
      .from('simulations')
      .select('*, simulation_results (*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return data as Simulation[];
  } catch (err) {
    console.error('Erreur récupération simulations:', err);
    throw err;
  }
};

export const getSimulationById = async (id: string): Promise<Simulation> => {
  try {
    const { data: session, error: authError } = await supabase.auth.getSession();
    if (authError || !session?.session?.user?.id) {
      throw new Error('Utilisateur non authentifié');
    }

    const userId = session.session.user.id;

    const { data, error } = await supabase
      .from('simulations')
      .select('*, simulation_results (*)')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error) {
      throw error;
    }

    return data as Simulation;
  } catch (err) {
    console.error(`Erreur récupération simulation ${id}:`, err);
    throw err;
  }
};

export const createSimulation = async (params: { 
  name: string; 
  description?: string; 
  geometryType: string; 
  config: SimulationConfig 
}): Promise<Simulation> => {
  try {
    const { data: session, error: authError } = await supabase.auth.getSession();
    if (authError || !session?.session?.user?.id) {
      throw new Error('Utilisateur non authentifié');
    }

    const userId = session.session.user.id;

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
        status: 'pending',
        progress: 0
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
  } catch (err) {
    console.error('Erreur création simulation:', err);
    throw err;
  }
};

export const updateSimulation = async (id: string, params: { 
  name: string; 
  description?: string; 
  geometryType: string; 
  config: SimulationConfig 
}): Promise<Simulation> => {
  try {
    const { data: session, error: authError } = await supabase.auth.getSession();
    if (authError || !session?.session?.user?.id) {
      throw new Error('Utilisateur non authentifié');
    }

    const userId = session.session.user.id;

    // Vérifier que la simulation appartient à l'utilisateur
    const { data: existingSim, error: checkError } = await supabase
      .from('simulations')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (checkError || !existingSim) {
      throw new Error('Simulation non trouvée ou accès non autorisé');
    }

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
      throw error;
    }

    return data;
  } catch (err) {
    console.error(`Erreur mise à jour simulation ${id}:`, err);
    throw err;
  }
};

export const startSimulation = async (simulationId: string): Promise<StartSimulationResponse> => {
  try {
    const { data: session, error: authError } = await supabase.auth.getSession();
    if (authError || !session?.session?.user?.id) {
      throw new Error('Utilisateur non authentifié');
    }

    const userId = session.session.user.id;

    console.log(`🚀 Lancement simulation ${simulationId} pour utilisateur ${userId}`);

    // Récupérer et vérifier la simulation
    const { data: simulation, error: fetchError } = await supabase
      .from('simulations')
      .select('*')
      .eq('id', simulationId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !simulation) {
      throw new Error('Simulation non trouvée ou accès non autorisé');
    }

    // Vérifier le statut de la simulation
    if (simulation.status === 'running') {
      throw new Error('La simulation est déjà en cours d\'exécution');
    }

    if (simulation.status === 'completed') {
      throw new Error('La simulation est déjà terminée');
    }

    // Préparer la configuration pour l'Edge Function
    const config = {
      geometry_config: simulation.geometry_config || {},
      boundary_conditions: simulation.boundary_conditions || {},
      material_id: simulation.material_id || 'aluminum-6061',
      mesh_density: simulation.mesh_density || 'medium',
      solver_type: simulation.solver_type || 'fem_fortran',
    };

    console.log('📤 Appel Edge Function simulate avec config:', config);

    // Mettre à jour le statut en "running" immédiatement
    await supabase
      .from('simulations')
      .update({
        status: 'running',
        progress: 10,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', simulationId);

    // Appeler l'Edge Function simulate avec timeout
    console.log('📡 Appel Edge Function simulate...');
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000); // 45 secondes timeout

    try {
      const { data: edgeFunctionData, error: edgeFunctionError } = await supabase.functions.invoke('simulate', {
        body: {
          simulation_id: simulationId,
          config,
          user_id: userId
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (edgeFunctionError) {
        console.error('❌ Erreur Edge Function:', edgeFunctionError);
        
        // Marquer la simulation comme échouée
        await supabase
          .from('simulations')
          .update({
            status: 'failed',
            error_message: edgeFunctionError.message.substring(0, 500),
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', simulationId);
        
        throw new Error(`Impossible de lancer la simulation: ${edgeFunctionError.message}`);
      }

      console.log('✅ Réponse Edge Function reçue:', edgeFunctionData);

      // Vérifier la réponse de l'Edge Function
      if (!edgeFunctionData?.success) {
        throw new Error(edgeFunctionData?.error || 'Erreur inconnue lors de l\'exécution de la simulation');
      }

      // Si l'Edge Function a déjà terminé, mettre à jour le statut
      if (edgeFunctionData.status === 'completed') {
        await supabase
          .from('simulations')
          .update({
            status: 'completed',
            progress: 100,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', simulationId);
      }

      return {
        success: true,
        simulation_id: simulationId,
        status: edgeFunctionData.status || 'running',
        results: edgeFunctionData.results,
        message: edgeFunctionData.message || 'Simulation lancée avec succès'
      };

    } catch (invokeError: any) {
      clearTimeout(timeoutId);
      
      if (invokeError.name === 'AbortError') {
        throw new Error('Timeout: L\'Edge Function n\'a pas répondu dans les délais (45 secondes)');
      }
      throw invokeError;
    }

  } catch (error: any) {
    console.error('❌ Erreur dans startSimulation:', error);
    
    // Essayer de marquer la simulation comme échouée
    try {
      await supabase
        .from('simulations')
        .update({
          status: 'failed',
          error_message: error.message.substring(0, 500),
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', simulationId);
    } catch (updateError) {
      console.error('❌ Erreur lors de la mise à jour du statut failed:', updateError);
    }
    
    throw error;
  }
};

export const uploadGeometry = async (params: { 
  file: File; 
  simulationId?: string;
}): Promise<UploadGeometryResponse> => {
  try {
    const { data: session, error: authError } = await supabase.auth.getSession();
    if (authError || !session?.session?.user?.id) {
      throw new Error('Utilisateur non authentifié');
    }

    const userId = session.session.user.id;

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
    const fileName = `${userId}/${timestamp}_${randomId}_${safeName}`;

    console.log(`📤 Upload géométrie: ${params.file.name} vers ${fileName}`);

    // Upload vers Supabase Storage
    const { error: uploadError } = await supabase.storage
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
      // Vérifier que la simulation appartient à l'utilisateur
      const { data: existingSim, error: checkError } = await supabase
        .from('simulations')
        .select('id')
        .eq('id', params.simulationId)
        .eq('user_id', userId)
        .single();

      if (!checkError && existingSim) {
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
        } else {
          console.log(`✅ Simulation ${params.simulationId} mise à jour avec la géométrie`);
        }
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

export const deleteSimulation = async (id: string): Promise<void> => {
  try {
    const { data: session, error: authError } = await supabase.auth.getSession();
    if (authError || !session?.session?.user?.id) {
      throw new Error('Utilisateur non authentifié');
    }

    const userId = session.session.user.id;

    const { error } = await supabase
      .from('simulations')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      throw error;
    }
  } catch (err) {
    console.error(`Erreur suppression simulation ${id}:`, err);
    throw err;
  }
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
// FONCTIONS ADDITIONNELLES INSPIRÉES DU PROJET VIDÉO
// -----------------------------------------------------------------------------

/**
 * Met à jour le statut d'une simulation
 * Inspiré de updateVideoStatus du projet vidéo
 */
export async function updateSimulationStatus(
  simulationId: string, 
  status: SimulationStatus,
  errorMessage?: string
): Promise<Simulation> {
  try {
    const { data: session, error: authError } = await supabase.auth.getSession();
    if (authError || !session?.session?.user?.id) {
      throw new Error('Utilisateur non authentifié');
    }

    const userId = session.session.user.id;

    const updateData: any = {
      status,
      updated_at: new Date().toISOString()
    };

    if (status === 'completed' || status === 'failed') {
      updateData.completed_at = new Date().toISOString();
    }

    if (errorMessage && status === 'failed') {
      updateData.error_message = errorMessage.substring(0, 500);
    }

    const { data, error } = await supabase
      .from('simulations')
      .update(updateData)
      .eq('id', simulationId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
  } catch (err) {
    console.error(`Erreur mise à jour statut simulation ${simulationId}:`, err);
    throw err;
  }
}

/**
 * Récupère les statistiques des simulations d'un utilisateur
 * Inspiré de getSessionStats du projet vidéo
 */
export async function getUserSimulationStats() {
  try {
    const { data: session, error: authError } = await supabase.auth.getSession();
    if (authError || !session?.session?.user?.id) {
      throw new Error('Utilisateur non authentifié');
    }

    const userId = session.session.user.id;

    const { data, error } = await supabase
      .from('simulations')
      .select('status, solver_type, mesh_density')
      .eq('user_id', userId);

    if (error) {
      throw error;
    }

    const stats = {
      totalSimulations: data.length,
      byStatus: {
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
      },
      bySolverType: {} as Record<string, number>,
      byMeshDensity: {
        low: 0,
        medium: 0,
        high: 0,
      },
    };

    data.forEach((simulation) => {
      // Statistiques par statut
      if (stats.byStatus[simulation.status as keyof typeof stats.byStatus] !== undefined) {
        stats.byStatus[simulation.status as keyof typeof stats.byStatus]++;
      }
      
      // Statistiques par solveur
      const solver = simulation.solver_type || 'unknown';
      stats.bySolverType[solver] = (stats.bySolverType[solver] || 0) + 1;
      
      // Statistiques par densité de maillage
      if (simulation.mesh_density && stats.byMeshDensity[simulation.mesh_density as keyof typeof stats.byMeshDensity] !== undefined) {
        stats.byMeshDensity[simulation.mesh_density as keyof typeof stats.byMeshDensity]++;
      }
    });

    return stats;
  } catch (err) {
    console.error('Erreur lors de la récupération des statistiques:', err);
    throw err;
  }
}

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
  unsubscribeFromChannel,
  updateSimulationStatus,
  getUserSimulationStats
};

export default SimulationService;
