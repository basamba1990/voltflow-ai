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

export interface Material {
  id: string;
  name: string;
  category?: string;
  thermal_conductivity?: number;
  specific_heat?: number;
  density?: number;
  melting_point?: number;
  color_hex?: string;
  is_public?: boolean;
  created_at?: string;
  updated_at?: string;
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

export const VALID_MATERIAL_IDS = [
  'aluminum-6061',
  'copper',
  'stainless-steel-304',
  'titanium-grade-2',
  'silicon-carbide',
  'polycarbonate',
  'carbon-fiber-composite'
] as const;

export type MaterialId = typeof VALID_MATERIAL_IDS[number];

// -----------------------------------------------------------------------------
// FONCTIONS PRINCIPALES CORRIGÉES
// -----------------------------------------------------------------------------

// ✅ LANCER UNE SIMULATION - VERSION FINALE CORRIGÉE
export const startSimulation = async (simulationId: string): Promise<StartSimulationResponse> => {
  try {
    console.log(`[SimulationService] startSimulation: ${simulationId}`);

    // Validation
    if (!simulationId) {
      return {
        success: false,
        simulation_id: simulationId,
        status: 'failed',
        error: 'Simulation ID is required'
      };
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return {
        success: false,
        simulation_id: simulationId,
        status: 'failed',
        error: 'Authentication required. Please log in.'
      };
    }

    // Vérifier que la simulation existe
    const { data: simulation, error: fetchError } = await supabase
      .from('simulations')
      .select('id, user_id, status')
      .eq('id', simulationId)
      .single();

    if (fetchError || !simulation) {
      console.error(`[SimulationService] Simulation not found: ${fetchError?.message}`);
      return {
        success: false,
        simulation_id: simulationId,
        status: 'failed',
        error: 'Simulation not found'
      };
    }

    // Vérifier la propriété
    if (simulation.user_id !== session.user.id) {
      return {
        success: false,
        simulation_id: simulationId,
        status: 'failed',
        error: 'You do not have permission to run this simulation'
      };
    }

    // Vérifier le statut
    if (simulation.status === 'running') {
      return {
        success: false,
        simulation_id: simulationId,
        status: 'failed',
        error: 'Simulation is already running'
      };
    }

    console.log(`[SimulationService] Calling Edge Function 'simulate' for ${simulationId}`);

    // ✅ CORRECTION CRITIQUE: Appel Edge Function simplifié
    const { data, error } = await supabase.functions.invoke('simulate', {
      body: { simulationId }
      // ⚠️ NE PAS AJOUTER DE HEADERS MANUELLEMENT - Supabase les gère automatiquement
    });

    if (error) {
      console.error('[SimulationService] Edge Function error:', error);
      
      // Gestion spécifique des erreurs
      let errorMessage = error.message || 'Unknown error';
      
      if (error.message?.includes('Failed to fetch')) {
        errorMessage = 'Network error. Please check your connection.';
      } else if (error.message?.includes('404') || error.message?.includes('not found')) {
        errorMessage = 'Simulation service not available. Please try again later.';
      } else if (error.message?.includes('timeout')) {
        errorMessage = 'Simulation timeout. Please try again.';
      }

      // Mettre à jour le statut en échec
      await supabase
        .from('simulations')
        .update({
          status: 'failed',
          error_message: errorMessage.substring(0, 500),
          updated_at: new Date().toISOString()
        })
        .eq('id', simulationId)
        .eq('user_id', session.user.id);

      return {
        success: false,
        simulation_id: simulationId,
        status: 'failed',
        error: errorMessage
      };
    }

    console.log(`[SimulationService] Simulation ${simulationId} started successfully`);
    return data;

  } catch (error: any) {
    console.error('[SimulationService] Critical error in startSimulation:', error);
    
    return {
      success: false,
      simulation_id: simulationId,
      status: 'failed',
      error: error.message || 'Failed to start simulation'
    };
  }
};

// ✅ UPLOAD GÉOMÉTRIE - VERSION SIMPLIFIÉE
export const uploadGeometry = async (params: { 
  file: File; 
  simulationId?: string;
  onProgress?: (progress: number) => void;
}): Promise<UploadGeometryResponse> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    
    if (!userId) {
      return {
        success: false,
        fileUrl: '',
        fileName: params.file.name,
        error: 'You must be logged in to upload files'
      };
    }

    // Validation
    if (!params.file) {
      return {
        success: false,
        fileUrl: '',
        fileName: '',
        error: 'No file provided'
      };
    }

    if (params.file.size > 50 * 1024 * 1024) {
      return {
        success: false,
        fileUrl: '',
        fileName: params.file.name,
        error: 'File size exceeds 50MB limit'
      };
    }

    const fileExt = params.file.name.toLowerCase().split('.').pop() || 'stl';
    const allowedExtensions = ['stl', 'step', 'stp', 'obj', 'iges', 'igs', 'vtp', 'vti', 'ply', 'vtk'];
    
    if (!allowedExtensions.includes(fileExt)) {
      return {
        success: false,
        fileUrl: '',
        fileName: params.file.name,
        error: `Unsupported file format: .${fileExt}`
      };
    }

    // Nom de fichier sécurisé
    const safeName = params.file.name
      .replace(/[^\x00-\x7F]/g, "")
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9._-]/g, "");

    const fileName = `${userId}/${Date.now()}_${safeName}`;

    if (params.onProgress) params.onProgress(10);

    // Upload
    const { error: uploadError } = await supabase.storage
      .from('simulation-files')
      .upload(fileName, params.file, {
        cacheControl: '3600',
        upsert: false,
        contentType: 'application/octet-stream'
      });

    if (uploadError) {
      console.error('[SimulationService] Upload error:', uploadError);
      return {
        success: false,
        fileUrl: '',
        fileName: params.file.name,
        error: `Upload failed: ${uploadError.message}`
      };
    }

    if (params.onProgress) params.onProgress(70);

    // URL publique
    const { data: { publicUrl } } = supabase.storage
      .from('simulation-files')
      .getPublicUrl(fileName);

    // Mise à jour simulation
    if (params.simulationId) {
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
// FONCTIONS UTILITAIRES (MANTENUES)
// -----------------------------------------------------------------------------

export const getMaterials = async (): Promise<Material[]> => {
  const { data, error } = await supabase
    .from('materials')
    .select('*')
    .order('name');
  
  if (error) throw error;
  return data as Material[];
};

export const getMaterialById = async (id: string): Promise<Material | null> => {
  const { data, error } = await supabase
    .from('materials')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error) return null;
  return data as Material;
};

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

export const getSimulationById = async (id: string) => {
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

export const createSimulation = async (params: { 
  name: string; 
  description?: string; 
  geometryType: string; 
  config: SimulationConfig 
}) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Authentication required');

  const { data, error } = await supabase
    .from('simulations')
    .insert({
      user_id: session.user.id,
      name: params.name,
      description: params.description,
      geometry_type: params.geometryType,
      geometry_config: params.config.geometry_config || {},
      boundary_conditions: params.config.boundary_conditions,
      material_id: params.config.material_id,
      mesh_density: params.config.mesh_density,
      solver_type: params.config.solver_type || 'fem_fortran',
      status: 'pending',
      progress: 0
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

export const validateMaterialId = (materialId: string): boolean => {
  return VALID_MATERIAL_IDS.includes(materialId as MaterialId);
};

export const getDefaultMaterial = (): MaterialId => {
  return 'aluminum-6061';
};

export const checkSimulationExists = async (simulationId: string): Promise<boolean> => {
  const { data, error } = await supabase
    .from('simulations')
    .select('id')
    .eq('id', simulationId)
    .single();

  return !error && !!data;
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
  validateMaterialId,
  getDefaultMaterial,
  VALID_MATERIAL_IDS,
  
  // Fonctions utilitaires
  checkSimulationExists,
  
  // Abonnements
  subscribeToSimulation,
  unsubscribeFromChannel
};

export default SimulationService;
