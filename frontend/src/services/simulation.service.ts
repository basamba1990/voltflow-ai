// frontend/src/services/simulation.service.ts

import { supabase, handleSupabaseError } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

// -----------------------------------------------------------------------------
// TYPES
// -----------------------------------------------------------------------------
export type Simulation = Database['public']['Tables']['simulations']['Row'] & {
  simulation_results?: Database['public']['Tables']['simulation_results']['Row'][];
};

export type SimulationInsert = Database['public']['Tables']['simulations']['Insert'];
export type SimulationUpdate = Database['public']['Tables']['simulations']['Update'];
export type SimulationResult = Database['public']['Tables']['simulation_results']['Row'];
export type SimulationStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type MeshDensity = 'low' | 'medium' | 'high';
export type CoolingType = 'natural_convection' | 'forced_convection' | 'radiation';
export type FluidType = 'air' | 'water' | 'oil';

export interface SimulationConfig {
  geometry_config: {
    type: string;
    file_url?: string;
    file_name?: string;
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

export interface CreateSimulationParams {
  name: string;
  description?: string;
  geometryType: string;
  config: SimulationConfig;
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
  fileType?: string;
  path?: string;
}

// -----------------------------------------------------------------------------
// FONCTIONS UTILITAIRES
// -----------------------------------------------------------------------------

const arrayBufferToBase64 = (arrayBuffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const validateFile = (file: File): void => {
  const maxSize = 50 * 1024 * 1024; // 50MB (correspond à la limite de l'Edge Function)
  if (file.size > maxSize) {
    throw new Error(`Fichier trop volumineux. Maximum: ${maxSize / (1024 * 1024)} MB`);
  }
  
  // CORRECTION : Liste complète des extensions autorisées
  const validExtensions = [
    '.stl', '.step', '.stp', '.obj', 
    '.vtp', '.vti', '.ply', '.vtk',
    '.iges', '.igs'
  ];
  
  const fileExt = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
  if (!validExtensions.includes(fileExt)) {
    throw new Error(`Format non supporté. Formats acceptés: ${validExtensions.join(', ')}`);
  }
};

// -----------------------------------------------------------------------------
// FONCTIONS EXPORTÉES
// -----------------------------------------------------------------------------

export const getSimulations = async (
  options: { limit?: number; status?: SimulationStatus; offset?: number } = {}
): Promise<Simulation[]> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Utilisateur non authentifié');

    const { limit = 10, status, offset = 0 } = options;
    let query = supabase
      .from('simulations')
      .select('*, simulation_results (*)')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw new Error(handleSupabaseError(error, 'getSimulations').userMessage);

    return data || [];
  } catch (error: any) {
    console.error('❌ getSimulations error:', error);
    throw error;
  }
};

export const getSimulationById = async (simulationId: string): Promise<Simulation | null> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Utilisateur non authentifié');

    const { data, error } = await supabase
      .from('simulations')
      .select('*, simulation_results (*)')
      .eq('id', simulationId)
      .eq('user_id', session.user.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(handleSupabaseError(error, 'getSimulationById').userMessage);
    }

    return data;
  } catch (error: any) {
    console.error('❌ getSimulationById error:', error);
    throw error;
  }
};

export const getSimulationResults = async (simulationId: string): Promise<SimulationResult | null> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Utilisateur non authentifié');

    const { data, error } = await supabase
      .from('simulation_results')
      .select('*')
      .eq('simulation_id', simulationId)
      .maybeSingle();

    if (error) throw new Error(handleSupabaseError(error, 'getSimulationResults').userMessage);

    return data;
  } catch (error: any) {
    console.error('❌ getSimulationResults error:', error);
    throw error;
  }
};

export const createSimulation = async (params: CreateSimulationParams): Promise<Simulation> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Authentification requise');

    const newSimulation: SimulationInsert = {
      user_id: session.user.id,
      name: params.name.trim(),
      description: params.description?.trim() || null,
      geometry_type: params.geometryType || 'complex',
      geometry_config: params.config.geometry_config,
      boundary_conditions: params.config.boundary_conditions as any,
      material_id: params.config.material_id,
      mesh_density: params.config.mesh_density,
      solver_type: params.config.solver_type || 'fem_fortran',
      status: 'pending' as SimulationStatus,
      progress: 0,
    };

    const { data, error } = await supabase
      .from('simulations')
      .insert(newSimulation)
      .select()
      .single();

    if (error) throw new Error(handleSupabaseError(error, 'createSimulation').userMessage);

    return data as Simulation;
  } catch (error: any) {
    console.error('❌ createSimulation error:', error);
    throw error;
  }
};

export const updateSimulation = async (
  simulationId: string,
  params: Partial<CreateSimulationParams>
): Promise<Simulation> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Authentification requise');

    const updateData: SimulationUpdate = {};
    if (params.name !== undefined) updateData.name = params.name.trim();
    if (params.description !== undefined) updateData.description = params.description?.trim() || null;
    if (params.geometryType !== undefined) updateData.geometry_type = params.geometryType;
    
    if (params.config) {
      updateData.geometry_config = params.config.geometry_config as any;
      updateData.boundary_conditions = params.config.boundary_conditions as any;
      updateData.material_id = params.config.material_id;
      updateData.mesh_density = params.config.mesh_density;
      if (params.config.solver_type) updateData.solver_type = params.config.solver_type;
    }

    const { data, error } = await supabase
      .from('simulations')
      .update(updateData)
      .eq('id', simulationId)
      .eq('user_id', session.user.id)
      .select()
      .single();

    if (error) throw new Error(handleSupabaseError(error, 'updateSimulation').userMessage);

    return data as Simulation;
  } catch (error: any) {
    console.error('❌ updateSimulation error:', error);
    throw error;
  }
};

export const startSimulation = async (simulationId: string): Promise<StartSimulationResponse> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Authentification requise');

    const { data: simulation, error: fetchError } = await supabase
      .from('simulations')
      .select('*')
      .eq('id', simulationId)
      .eq('user_id', session.user.id)
      .single();

    if (fetchError) throw fetchError;

    if (simulation.status === 'running') {
      throw new Error('Une simulation est déjà en cours');
    }

    await supabase
      .from('simulations')
      .update({
        status: 'running',
        progress: 0,
        error_message: null,
        started_at: new Date().toISOString()
      })
      .eq('id', simulationId);

    const { data, error } = await supabase.functions.invoke('simulate', {
      body: {
        simulation_id: simulationId,
        config: simulation,
        user_id: session.user.id
      }
    });

    if (error) throw new Error(error.message);

    return {
      success: true,
      simulation_id: simulationId,
      status: 'running',
      message: 'Simulation lancée avec succès'
    };
  } catch (error: any) {
    console.error('❌ startSimulation error:', error);
    
    await supabase
      .from('simulations')
      .update({
        status: 'failed',
        error_message: error.message,
        completed_at: new Date().toISOString()
      })
      .eq('id', simulationId);
    
    throw error;
  }
};

/**
 * Upload un fichier de géométrie via l'Edge Function (Méthode recommandée)
 * Cette méthode contourne les limitations RLS en utilisant le service_role
 */
export const uploadGeometryViaEdgeFunction = async (
  params: { file: File; userId: string; simulationId?: string; geometryConfig?: any }
): Promise<UploadGeometryResponse> => {
  console.log('🚀 Upload via Edge Function:', params.file.name);
  
  try {
    validateFile(params.file);
    
    // Récupération du token d'authentification
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      throw new Error('Session expirée. Veuillez vous reconnecter.');
    }
    
    // Conversion du fichier en Base64
    const arrayBuffer = await params.file.arrayBuffer();
    const fileData = arrayBufferToBase64(arrayBuffer);
    
    // Appel de l'Edge Function avec TOUS les paramètres requis
    const { data, error } = await supabase.functions.invoke('upload-geometry', {
      body: {
        file_name: params.file.name,
        file_data: fileData,
        file_type: params.file.type,
        user_id: params.userId,
        simulation_id: params.simulationId,
        geometry_config: params.geometryConfig || {}
      },
      headers: {
        'Authorization': `Bearer ${session.access_token}`
      },
      timeout: 60000 // 60 secondes
    });
    
    if (error) {
      console.error('❌ Edge Function error:', error);
      
      // Messages d'erreur spécifiques
      if (error.message?.includes('Invalid file type')) {
        throw new Error(`Format de fichier non supporté. Formats acceptés: STL, STEP, STP, OBJ, IGES, IGS, VTP, VTI, PLY, VTK`);
      }
      
      if (error.message?.includes('RLS Policy violation')) {
        throw new Error('Erreur de permission. Contactez l\'administrateur pour vérifier les politiques RLS.');
      }
      
      throw new Error(`Échec de l'upload: ${error.message}`);
    }
    
    if (!data.success) {
      throw new Error(data.error || 'Échec inconnu de l\'upload');
    }
    
    return {
      success: true,
      fileUrl: data.fileUrl,
      fileName: data.fileName,
      fileSize: data.fileSize,
      fileType: params.file.type,
      path: data.path
    };
    
  } catch (error: any) {
    console.error('❌ uploadGeometryViaEdgeFunction error:', error);
    throw error;
  }
};

/**
 * Upload direct vers le bucket (Alternative - nécessite RLS correctement configuré)
 */
export const uploadGeometryDirect = async (
  params: { file: File; userId: string; simulationId?: string }
): Promise<UploadGeometryResponse> => {
  console.log('🚀 Upload direct vers Storage:', params.file.name);
  
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      throw new Error('Session expirée. Veuillez vous reconnecter.');
    }
    
    validateFile(params.file);
    
    // Génération du nom de fichier avec structure userId/timestamp_filename
    const timestamp = Date.now();
    const uniqueId = Math.random().toString(36).substring(2, 9);
    const fileExt = params.file.name.split('.').pop();
    const fileName = `${params.userId}/${timestamp}_${uniqueId}.${fileExt}`;
    
    // Upload direct
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('geometries')
      .upload(fileName, params.file, {
        cacheControl: '3600',
        upsert: false,
        contentType: 'application/octet-stream'
      });
    
    if (uploadError) {
      console.error('❌ Storage upload error:', uploadError);
      
      // Détection d'erreur RLS
      if (uploadError.message?.includes('row-level security')) {
        throw new Error('Erreur de permission RLS. Utilisez plutôt uploadGeometryViaEdgeFunction.');
      }
      
      throw new Error(`Échec de l'upload: ${uploadError.message}`);
    }
    
    // Génération d'URL signée
    const { data: signedData, error: signedError } = await supabase.storage
      .from('geometries')
      .createSignedUrl(fileName, 31536000); // 1 an
    
    if (signedError || !signedData?.signedUrl) {
      throw new Error('Impossible de générer l\'URL sécurisée');
    }
    
    return {
      success: true,
      fileUrl: signedData.signedUrl,
      fileName: params.file.name,
      fileSize: params.file.size,
      fileType: params.file.type,
      path: fileName
    };
    
  } catch (error: any) {
    console.error('❌ uploadGeometryDirect error:', error);
    throw error;
  }
};

export const deleteSimulation = async (simulationId: string): Promise<void> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Authentification requise');

    await supabase
      .from('simulation_results')
      .delete()
      .eq('simulation_id', simulationId);

    await supabase
      .from('simulations')
      .delete()
      .eq('id', simulationId)
      .eq('user_id', session.user.id);
  } catch (error: any) {
    console.error('❌ deleteSimulation error:', error);
    throw error;
  }
};

export const subscribeToSimulation = (simulationId: string, callback: (payload: any) => void) => {
  const channel = supabase.channel(`simulation-updates-${simulationId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'simulations',
      filter: `id=eq.${simulationId}`
    }, callback)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'simulation_results',
      filter: `simulation_id=eq.${simulationId}`
    }, callback)
    .subscribe();

  return channel;
};

export const unsubscribeFromChannel = (channel: any) => {
  if (channel) supabase.removeChannel(channel);
};

export const checkRLSPermissions = async (): Promise<boolean> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return false;

    const { error } = await supabase
      .from('simulations')
      .select('id')
      .limit(1);

    return !error;
  } catch {
    return false;
  }
};

export const getCompletedSimulations = async (limit: number = 5): Promise<Simulation[]> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Utilisateur non authentifié');

    const { data, error } = await supabase
      .from('simulations')
      .select('*, simulation_results (*)')
      .eq('user_id', session.user.id)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return data || [];
  } catch (error: any) {
    console.error('❌ getCompletedSimulations error:', error);
    throw error;
  }
};

export const cancelSimulation = async (simulationId: string): Promise<void> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Authentification requise');

    await supabase
      .from('simulations')
      .update({ status: 'cancelled' })
      .eq('id', simulationId)
      .eq('user_id', session.user.id);
  } catch (error: any) {
    console.error('❌ cancelSimulation error:', error);
    throw error;
  }
};

// Export du service
export const SimulationService = {
  getSimulations,
  getSimulationById,
  getSimulationResults,
  createSimulation,
  updateSimulation,
  startSimulation,
  uploadGeometry: uploadGeometryDirect, // Utilise l'upload direct par défaut (corrigé)
  uploadGeometryDirect,
  uploadGeometryViaEdgeFunction,
  deleteSimulation,
  subscribeToSimulation,
  unsubscribeFromChannel,
  checkRLSPermissions,
  getCompletedSimulations,
  cancelSimulation
};

export default SimulationService;
