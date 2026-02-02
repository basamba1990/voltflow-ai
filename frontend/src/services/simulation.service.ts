import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

// -----------------------------------------------------------------------------
// TYPES MIS À JOUR
// -----------------------------------------------------------------------------
export type Simulation = Database['public']['Tables']['simulations']['Row'] & {
  simulation_results?: Database['public']['Tables']['simulation_results']['Row'][];
  materials?: Database['public']['Tables']['materials']['Row'];
};

export type SimulationStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type MeshDensity = 'low' | 'medium' | 'high';
export type CoolingType = 'natural_convection' | 'forced_convection' | 'radiation';
export type FluidType = 'air' | 'water' | 'oil';

// Interface pour les matériaux
export interface Material {
  id: string;  // TEXT - comme 'aluminum-6061', 'copper', etc.
  name: string;
  category?: string;
  thermal_conductivity?: number;
  specific_heat?: number;
  density?: number;
  melting_point?: number;
  color_hex?: string;
  is_public?: boolean;
  properties?: any;
}

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
  material_id: string;  // TEXT ID comme 'aluminum-6061'
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
// FONCTIONS POUR MATERIALS
// -----------------------------------------------------------------------------

// Récupérer tous les matériaux disponibles
export const getMaterials = async (): Promise<Material[]> => {
  const { data, error } = await supabase
    .from('materials')
    .select('*')
    .order('name');
  
  if (error) {
    console.error('[SimulationService] Erreur récupération matériaux:', error);
    throw error;
  }
  
  return data as Material[];
};

// Récupérer un matériau par son ID
export const getMaterialById = async (id: string): Promise<Material | null> => {
  const { data, error } = await supabase
    .from('materials')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error) {
    console.warn(`[SimulationService] Matériau ${id} non trouvé:`, error);
    return null;
  }
  
  return data as Material;
};

// Rechercher des matériaux par catégorie
export const getMaterialsByCategory = async (category: string): Promise<Material[]> => {
  const { data, error } = await supabase
    .from('materials')
    .select('*')
    .eq('category', category)
    .order('name');
  
  if (error) {
    console.error(`[SimulationService] Erreur matériaux catégorie ${category}:`, error);
    throw error;
  }
  
  return data as Material[];
};

// -----------------------------------------------------------------------------
// FONCTIONS PRINCIPALES CORRIGÉES
// -----------------------------------------------------------------------------

// ✅ Récupérer les simulations avec les matériaux
export const getSimulations = async () => {
  const { data, error } = await supabase
    .from('simulations')
    .select(`
      *,
      simulation_results (*),
      materials (*)
    `)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  return data as Simulation[];
};

// ✅ Récupérer une simulation par ID avec son matériau
export const getSimulationById = async (id: string) => {
  if (!id || id === 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa') {
    throw new Error('Invalid simulation ID');
  }

  const { data, error } = await supabase
    .from('simulations')
    .select(`
      *,
      simulation_results (*),
      materials (*)
    `)
    .eq('id', id)
    .single();

  if (error) throw error;
  return data as Simulation;
};

// ✅ Créer une simulation avec vérification du matériau
export const createSimulation = async (params: { 
  name: string; 
  description?: string; 
  geometryType: string; 
  config: SimulationConfig 
}) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Authentication required');

  // Vérifier que le matériau existe
  const material = await getMaterialById(params.config.material_id);
  if (!material) {
    throw new Error(`Material '${params.config.material_id}' does not exist. Use valid material ID like 'aluminum-6061'.`);
  }

  const { data, error } = await supabase
    .from('simulations')
    .insert({
      user_id: session.user.id,
      name: params.name.substring(0, 100),
      description: params.description?.substring(0, 500),
      geometry_type: params.geometryType,
      geometry_config: params.config.geometry_config || {},
      boundary_conditions: params.config.boundary_conditions,
      material_id: params.config.material_id,  // TEXT ID
      mesh_density: params.config.mesh_density,
      solver_type: params.config.solver_type || 'fem_fortran',
      status: 'pending'
    })
    .select()
    .single();

  if (error) throw error;
  return data;
};

// ✅ Mettre à jour une simulation
export const updateSimulation = async (id: string, params: { 
  name: string; 
  description?: string; 
  geometryType: string; 
  config: SimulationConfig;
}) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Authentication required');

  // Vérifier le matériau si fourni
  if (params.config.material_id) {
    const material = await getMaterialById(params.config.material_id);
    if (!material) {
      throw new Error(`Material '${params.config.material_id}' does not exist.`);
    }
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
    .eq('user_id', session.user.id)
    .select()
    .single();

  if (error) throw error;
  return data;
};

// ✅ Lancer une simulation
export const startSimulation = async (simulationId: string): Promise<StartSimulationResponse> => {
  try {
    if (!simulationId || simulationId === 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa') {
      throw new Error('Invalid simulation ID. Please create a valid simulation first.');
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      throw new Error('Authentication required. Please log in.');
    }

    console.log('[SimulationService] Starting simulation:', simulationId);

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

// ✅ Upload de géométrie
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

    if (!params.file) {
      throw new Error('No file provided');
    }

    if (params.file.size > 50 * 1024 * 1024) {
      throw new Error('File size exceeds 50MB limit');
    }

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

    if (params.onProgress) params.onProgress(10);

    const uploadPromise = supabase.storage
      .from('simulation-files')
      .upload(fileName, params.file, {
        cacheControl: '3600',
        upsert: false,
        contentType: 'application/octet-stream'
      });

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

    if (params.onProgress) params.onProgress(70);

    const { data: { publicUrl } } = supabase.storage
      .from('simulation-files')
      .getPublicUrl(fileName);

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
        }
      } catch (updateErr: any) {
        console.warn('[SimulationService] Update failed:', updateErr.message);
      }
    }

    if (params.onProgress) params.onProgress(100);

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
// FONCTIONS UTILITAIRES
// -----------------------------------------------------------------------------

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

export const testEdgeFunctionConnection = async (): Promise<boolean> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return false;

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
  createSimulation,
  updateSimulation,
  startSimulation,
  uploadGeometry,
  deleteSimulation,
  
  // Fonctions matériaux
  getMaterials,
  getMaterialById,
  getMaterialsByCategory,
  
  // Fonctions utilitaires
  checkSimulationExists,
  testEdgeFunctionConnection,
  
  // Abonnements
  subscribeToSimulation,
  unsubscribeFromChannel
};

export default SimulationService;
