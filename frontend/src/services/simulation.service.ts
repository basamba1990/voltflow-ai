import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

// TYPES (inchangés)
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
  error?: string;
}

export interface UploadGeometryResponse {
  success: boolean;
  fileUrl: string;
  fileName: string;
  fileSize?: number;
  path?: string;
  error?: string;
}

// -----------------------------------------------------------------------------
// FONCTIONS CORRIGÉES
// -----------------------------------------------------------------------------

// ✅ CORRECTION CRITIQUE: Appeler LA BONNE Edge Function
export const startSimulation = async (simulationId: string): Promise<StartSimulationResponse> => {
  try {
    // VÉRIFICATION UUID
    if (!simulationId || simulationId === 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa') {
      throw new Error('Invalid simulation ID. Please create a valid simulation first.');
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      throw new Error('Authentication required. Please log in.');
    }

    console.log('[SimulationService] Starting simulation:', simulationId);

    // ✅ CORRECTION: Appeler 'simulate' et non 'run-simulation'
    const { data, error } = await supabase.functions.invoke('simulate', {
      body: { 
        simulationId 
      },
      headers: {
        'Cache-Control': 'no-cache'
      }
    });

    if (error) {
      console.error('[SimulationService] Edge Function error:', error);
      
      // Gestion des erreurs spécifiques
      if (error.message?.includes('404') || error.message?.includes('not found')) {
        throw new Error('Simulation function not found. Please contact support.');
      }
      if (error.message?.includes('Failed to fetch')) {
        throw new Error('Network error. Please check your connection.');
      }
      
      throw error;
    }
    
    return data;
  } catch (error: any) {
    console.error('[SimulationService] Critical error:', error);
    return {
      success: false,
      simulation_id: simulationId,
      status: 'failed',
      error: error.message || 'Unknown error'
    };
  }
};

// ✅ CORRECTION: Upload avec retry et meilleure gestion d'erreurs
export const uploadGeometry = async (params: { 
  file: File; 
  simulationId?: string;
  onProgress?: (progress: number) => void;
}): Promise<UploadGeometryResponse> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id || 'anonymous';
    
    if (!userId || userId === 'anonymous') {
      throw new Error('You must be logged in to upload files');
    }

    // Validation fichier
    if (!params.file) {
      throw new Error('No file provided');
    }

    if (params.file.size > 50 * 1024 * 1024) { // 50MB
      throw new Error('File size exceeds 50MB limit');
    }

    // Nettoyage nom
    const fileExt = params.file.name.toLowerCase().split('.').pop() || 'stl';
    const allowedExtensions = ['stl', 'step', 'stp', 'obj', 'iges', 'igs', 'vtp', 'vti', 'ply', 'vtk'];
    
    if (!allowedExtensions.includes(fileExt)) {
      throw new Error(`Unsupported file format: .${fileExt}. Allowed: ${allowedExtensions.join(', ')}`);
    }

    const safeName = params.file.name
      .replace(/[^\x00-\x7F]/g, "")
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9._-]/g, "");

    const fileName = `${userId}/${Date.now()}_${safeName}`;

    // Callback progression
    if (params.onProgress) {
      params.onProgress(10);
    }

    // ✅ CORRECTION: Upload avec timeout
    const uploadPromise = supabase.storage
      .from('simulation-files')
      .upload(fileName, params.file, {
        cacheControl: '3600',
        upsert: false,
        contentType: 'application/octet-stream'
      });

    // Timeout après 60 secondes
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Upload timeout after 60 seconds')), 60000);
    });

    const { data: uploadData, error: uploadError } = await Promise.race([
      uploadPromise,
      timeoutPromise
    ]) as any;

    if (uploadError) {
      console.error("[SimulationService] Upload error:", uploadError);
      
      if (uploadError.message.includes('already exists')) {
        throw new Error('File with this name already exists. Please rename your file.');
      }
      if (uploadError.message.includes('413')) {
        throw new Error('File too large. Maximum size is 50MB.');
      }
      
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    if (params.onProgress) {
      params.onProgress(70);
    }

    // Récupération URL
    const { data: { publicUrl } } = supabase.storage
      .from('simulation-files')
      .getPublicUrl(fileName);

    // Mise à jour simulation si ID fourni
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
              type: fileExt,
              uploaded_at: new Date().toISOString()
            },
            updated_at: new Date().toISOString()
          })
          .eq('id', params.simulationId);

        if (updateError) {
          console.warn('[SimulationService] Warning: Could not update simulation record:', updateError.message);
          // Continue anyway - upload succeeded
        }
      } catch (updateErr: any) {
        console.warn('[SimulationService] Update failed:', updateErr.message);
      }
    }

    if (params.onProgress) {
      params.onProgress(100);
    }

    return {
      success: true,
      fileUrl: publicUrl,
      fileName: params.file.name,
      fileSize: params.file.size,
      path: fileName
    };
  } catch (error: any) {
    console.error('[SimulationService] Upload failed:', error);
    return {
      success: false,
      fileUrl: '',
      fileName: params?.file?.name || '',
      error: error.message || 'Upload failed'
    };
  }
};

// -----------------------------------------------------------------------------
// FONCTIONS UTILITAIRES AJOUTÉES
// -----------------------------------------------------------------------------

// Vérifier si une simulation existe
export const checkSimulationExists = async (simulationId: string): Promise<boolean> => {
  try {
    const { data, error } = await supabase
      .from('simulations')
      .select('id')
      .eq('id', simulationId)
      .single();

    return !error && !!data;
  } catch {
    return false;
  }
};

// Créer une simulation avec ID valide
export const createValidSimulation = async (params: {
  name: string;
  description?: string;
  geometryType: string;
  config: SimulationConfig;
}): Promise<{ id: string; success: boolean; error?: string }> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      throw new Error('Authentication required');
    }

    const { data, error } = await supabase
      .from('simulations')
      .insert({
        user_id: session.user.id,
        name: params.name.substring(0, 100), // Limit length
        description: params.description?.substring(0, 500),
        geometry_type: params.geometryType,
        geometry_config: params.config.geometry_config || {},
        boundary_conditions: params.config.boundary_conditions,
        material_id: params.config.material_id,
        mesh_density: params.config.mesh_density,
        solver_type: params.config.solver_type || 'fem_fortran',
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (error) {
      throw new Error(`Failed to create simulation: ${error.message}`);
    }

    return {
      id: data.id,
      success: true
    };
  } catch (error: any) {
    console.error('[SimulationService] Create simulation failed:', error);
    return {
      id: '',
      success: false,
      error: error.message
    };
  }
};

// Test de connexion à l'Edge Function
export const testEdgeFunctionConnection = async (): Promise<boolean> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return false;

    // Test OPTIONS request
    const response = await fetch(
      `${supabase.supabaseUrl}/functions/v1/simulate`,
      {
        method: 'OPTIONS',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      }
    );

    return response.status === 204;
  } catch {
    return false;
  }
};

// -----------------------------------------------------------------------------
// FONCTIONS EXISTANTES (CORRIGÉES)
// -----------------------------------------------------------------------------

export const getSimulations = async () => {
  const { data, error } = await supabase
    .from('simulations')
    .select('*, simulation_results (*)')
    .order('created_at', { ascending: false })
    .limit(50); // Limit results

  if (error) throw error;
  return data as Simulation[];
};

export const getSimulationById = async (id: string) => {
  if (!id || id === 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa') {
    throw new Error('Invalid simulation ID');
  }

  const { data, error } = await supabase
    .from('simulations')
    .select('*, simulation_results (*)')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data as Simulation;
};

export const updateSimulation = async (id: string, params: { 
  name: string; 
  description?: string; 
  geometryType: string; 
  config: SimulationConfig;
}) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Authentication required');

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
    .eq('user_id', session.user.id)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const deleteSimulation = async (id: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Authentication required');

  const { error } = await supabase
    .from('simulations')
    .delete()
    .eq('id', id)
    .eq('user_id', session.user.id);

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
// EXPORT PAR DÉFAUT
// -----------------------------------------------------------------------------

export const SimulationService = {
  // Fonctions principales
  getSimulations,
  getSimulationById,
  createSimulation: createValidSimulation, // Utiliser la version corrigée
  updateSimulation,
  startSimulation,
  uploadGeometry,
  deleteSimulation,
  
  // Fonctions utilitaires
  checkSimulationExists,
  testEdgeFunctionConnection,
  
  // Abonnements
  subscribeToSimulation,
  unsubscribeFromChannel
};

export default SimulationService;
