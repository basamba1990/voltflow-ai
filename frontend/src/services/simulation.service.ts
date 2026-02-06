import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

// -----------------------------------------------------------------------------
// TYPES
// -----------------------------------------------------------------------------
export type Simulation = Database['public']['Tables']['simulations']['Row'] & {
  simulation_results?: Database['public']['Tables']['simulation_results']['Row'][];
  materials?: Database['public']['Tables']['materials']['Row'];
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
    geometry_type?: string;
    solver_suggestion?: string;
    fortran_compatible?: boolean;
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
  material_properties?: {
    conductivity: number;
    density: number;
    specific_heat: number;
  };
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
  geometry_type?: string;
  solver_suggestion?: string;
  estimated_dimensions?: { width: number; height: number; depth: number };
  message?: string;
}

// -----------------------------------------------------------------------------
// FONCTIONS EXPORTÉES
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
      .select('*, simulation_results (*), materials (*)')
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
      .select('*, simulation_results (*), materials (*)')
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

// ✅ VERSION CORRIGÉE DE startSimulation
export const startSimulation = async (simulationId: string): Promise<StartSimulationResponse> => {
  try {
    console.log(`🚀 [startSimulation] Démarrage simulation ${simulationId}`);
    
    const { data: session, error: authError } = await supabase.auth.getSession();
    if (authError || !session?.session?.user?.id) {
      throw new Error('Utilisateur non authentifié');
    }

    const userId = session.session.user.id;

    // 1. RÉCUPÉRER SIMULATION AVEC MATÉRIAU
    const { data: simulation, error: fetchError } = await supabase
      .from('simulations')
      .select('*, materials(*)')
      .eq('id', simulationId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !simulation) {
      console.error('❌ Simulation non trouvée:', fetchError);
      throw new Error('Simulation non trouvée ou accès non autorisé');
    }

    console.log('📋 Simulation chargée:', {
      id: simulation.id,
      name: simulation.name,
      status: simulation.status,
      hasMaterial: !!simulation.materials
    });

    // 2. VÉRIFIER STATUT
    if (simulation.status === 'running') {
      throw new Error('La simulation est déjà en cours');
    }
    if (simulation.status === 'completed') {
      throw new Error('La simulation est déjà terminée');
    }
    if (simulation.status === 'failed') {
      console.log('⚠️ Relance simulation précédemment échouée');
    }

    // 3. PRÉPARER CONFIGURATION FORTRAN-COMPATIBLE
    const materialData = simulation.materials || {
      conductivity: 50.0,
      density: 2700.0,
      specific_heat: 900.0
    };

    const config = {
      geometry_config: simulation.geometry_config || {},
      boundary_conditions: simulation.boundary_conditions || {
        initial_temp: 1000,
        ambient_temp: 25,
        cooling_type: 'natural_convection',
        convection_coeff: 10,
        fluid_type: 'air',
        fluid_velocity: 1
      },
      material_id: simulation.material_id || 'aluminum-6061',
      mesh_density: simulation.mesh_density || 'medium',
      solver_type: simulation.solver_type || 'fem_fortran',
      material_properties: {
        conductivity: materialData.conductivity || 50.0,
        density: materialData.density || 2700.0,
        specific_heat: materialData.specific_heat || 900.0
      }
    };

    console.log('📤 Configuration prête pour Edge Function:', {
      mesh_density: config.mesh_density,
      solver_type: config.solver_type,
      has_material_props: !!config.material_properties
    });

    // 4. METTRE À JOUR STATUT
    const updateResult = await supabase
      .from('simulations')
      .update({
        status: 'running',
        progress: 10,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', simulationId);

    if (updateResult.error) {
      console.error('❌ Erreur mise à jour statut:', updateResult.error);
      throw new Error(`Échec mise à jour statut: ${updateResult.error.message}`);
    }

    console.log('✅ Statut mis à jour à "running"');

    // 5. APPEL EDGE FUNCTION (TIMEOUT 60s)
    console.log('📡 Appel Edge Function simulate...');
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

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

      console.log('✅ Réponse Edge Function reçue:', {
        success: edgeFunctionData?.success,
        status: edgeFunctionData?.status,
        has_results: !!edgeFunctionData?.results
      });

      if (!edgeFunctionData?.success) {
        const errorMsg = edgeFunctionData?.error || 'Erreur inconnue lors de l\'exécution de la simulation';
        console.error('❌ Edge Function a échoué:', errorMsg);
        
        await supabase
          .from('simulations')
          .update({
            status: 'failed',
            error_message: errorMsg.substring(0, 500),
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', simulationId);
        
        throw new Error(errorMsg);
      }

      // 6. METTRE À JOUR SI TERMINÉ
      if (edgeFunctionData.status === 'completed') {
        console.log('✅ Simulation terminée avec succès, mise à jour base de données');
        
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
      console.error('❌ Erreur lors de l\'appel Edge Function:', invokeError);
      
      if (invokeError.name === 'AbortError') {
        const errorMsg = 'La requête de simulation a expiré (60 secondes).';
        console.error('⏱️ Timeout:', errorMsg);
        
        await supabase
          .from('simulations')
          .update({
            status: 'failed',
            error_message: errorMsg,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', simulationId);
        
        throw new Error(errorMsg);
      }
      
      await supabase
        .from('simulations')
        .update({
          status: 'failed',
          error_message: invokeError.message.substring(0, 500),
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', simulationId);
      
      throw invokeError;
    }

  } catch (error: any) {
    console.error('💥 Erreur critique dans startSimulation:', error);
    
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
      console.error('❌ Impossible de mettre à jour le statut à "failed":', updateError);
    }
    
    throw error;
  }
};

export const uploadGeometry = async (params: {
  file: File;
  simulationId: string;
}): Promise<UploadGeometryResponse> => {
  try {
    const { data: session, error: authError } = await supabase.auth.getSession();
    if (authError || !session?.session?.user?.id) {
      throw new Error('Utilisateur non authentifié');
    }

    const userId = session.session.user.id;

    const allowedTypes = ['stl', 'step', 'stp', 'obj', 'iges', 'igs', 'vtp', 'vti', 'ply', 'vtk', 'vtu'];
    const fileExt = params.file.name.toLowerCase().split('.').pop();
    
    if (!fileExt || !allowedTypes.includes(fileExt)) {
      throw new Error(`Format non supporté: ${fileExt}. Formats acceptés: ${allowedTypes.join(', ')}`);
    }

    // Lire le fichier en Base64
    const arrayBuffer = await params.file.arrayBuffer();
    const base64String = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

    console.log(`📤 Appel Edge Function upload-geometry pour ${params.file.name}`);

    const { data: edgeFunctionData, error: edgeFunctionError } = await supabase.functions.invoke('upload-geometry', {
      body: {
        fileName: params.file.name,
        fileData: base64String,
        userId: userId,
        simulation_id: params.simulationId,
      },
    });

    if (edgeFunctionError) {
      console.error('❌ Erreur Edge Function upload-geometry:', edgeFunctionError);
      throw new Error(`Échec de l'upload via Edge Function: ${edgeFunctionError.message}`);
    }

    if (!edgeFunctionData?.success) {
      throw new Error(edgeFunctionData?.error || 'Erreur inconnue lors de l\'upload de géométrie');
    }

    return {
      success: true,
      fileUrl: edgeFunctionData.fileUrl,
      fileName: edgeFunctionData.fileName,
      fileSize: edgeFunctionData.fileSize,
      path: edgeFunctionData.path,
      geometry_type: edgeFunctionData.geometry_type,
      solver_suggestion: edgeFunctionData.solver_suggestion,
      estimated_dimensions: edgeFunctionData.estimated_dimensions,
      message: edgeFunctionData.message
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

// Fonctions utilitaires
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
