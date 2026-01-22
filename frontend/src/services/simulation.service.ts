// services/simulation.service.ts
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
}

// -----------------------------------------------------------------------------
// FONCTIONS UTILITAIRES
// -----------------------------------------------------------------------------

/**
 * Convertit un ArrayBuffer en chaîne base64 (sans utiliser Buffer)
 */
const arrayBufferToBase64 = (arrayBuffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

/**
 * Valide un fichier avant upload
 */
const validateFile = (file: File): void => {
  // Taille maximale : 100MB
  const maxSize = 100 * 1024 * 1024;
  if (file.size > maxSize) {
    throw new Error(`Fichier trop volumineux. Maximum: ${maxSize / (1024 * 1024)} MB`);
  }

  // Extensions valides
  const validExtensions = ['.stl', '.step', '.stp', '.obj', '.vtp', '.vti', '.ply', '.vtk'];
  const fileExt = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
  
  if (!validExtensions.includes(fileExt)) {
    throw new Error(`Format non supporté. Formats acceptés: ${validExtensions.join(', ')}`);
  }
};

// -----------------------------------------------------------------------------
// FONCTIONS EXPORTÉES
// -----------------------------------------------------------------------------

/**
 * Récupère la liste des simulations de l'utilisateur.
 */
export const getSimulations = async (
  options: { limit?: number; status?: SimulationStatus; offset?: number; } = {}
): Promise<Simulation[]> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Utilisateur non authentifié');

    const { limit = 10, status, offset = 0 } = options;

    let query = supabase
      .from('simulations')
      .select(
        `
          *,
          simulation_results (*)
        `
      )
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      const supabaseError = handleSupabaseError(error, 'getSimulations', { 
        userId: session.user.id, 
        options 
      });
      throw new Error(supabaseError.userMessage);
    }

    return data || [];
  } catch (error: any) {
    console.error('❌ getSimulations error:', error);
    throw error;
  }
};

/**
 * Récupère une simulation par son ID.
 */
export const getSimulationById = async (
  simulationId: string
): Promise<Simulation | null> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Utilisateur non authentifié');

    const { data, error } = await supabase
      .from('simulations')
      .select(
        `
          *,
          simulation_results (*)
        `
      )
      .eq('id', simulationId)
      .eq('user_id', session.user.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      const supabaseError = handleSupabaseError(error, 'getSimulationById', { simulationId });
      throw new Error(supabaseError.userMessage);
    }

    return data;
  } catch (error: any) {
    console.error('❌ getSimulationById error:', error);
    throw error;
  }
};

/**
 * Récupère les résultats d'une simulation.
 */
export const getSimulationResults = async (
  simulationId: string
): Promise<SimulationResult | null> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Utilisateur non authentifié');

    const { data, error } = await supabase
      .from('simulation_results')
      .select('*')
      .eq('simulation_id', simulationId)
      .maybeSingle();

    if (error) {
      const supabaseError = handleSupabaseError(error, 'getSimulationResults', { simulationId });
      throw new Error(supabaseError.userMessage);
    }

    return data;
  } catch (error: any) {
    console.error('❌ getSimulationResults error:', error);
    throw error;
  }
};

/**
 * Crée une nouvelle simulation.
 */
export const createSimulation = async (
  params: CreateSimulationParams
): Promise<Simulation> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Authentification requise');

    // Validation des données
    if (!params.name?.trim()) throw new Error('Le nom de la simulation est requis');
    if (!params.config.material_id) throw new Error('Le matériau est requis');

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

    if (error) {
      const supabaseError = handleSupabaseError(error, 'createSimulation', { 
        userId: session.user.id, 
        simulationName: params.name 
      });
      throw new Error(supabaseError.userMessage);
    }

    return data as Simulation;
  } catch (error: any) {
    console.error('❌ createSimulation error:', error);
    throw error;
  }
};

/**
 * Met à jour une simulation existante.
 */
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
      if (params.config.solver_type) {
        updateData.solver_type = params.config.solver_type;
      }
    }

    const { data, error } = await supabase
      .from('simulations')
      .update(updateData)
      .eq('id', simulationId)
      .eq('user_id', session.user.id)
      .select()
      .single();

    if (error) {
      const supabaseError = handleSupabaseError(error, 'updateSimulation', { simulationId });
      throw new Error(supabaseError.userMessage);
    }

    return data as Simulation;
  } catch (error: any) {
    console.error('❌ updateSimulation error:', error);
    throw error;
  }
};

/**
 * Lance une simulation en appelant une Edge Function.
 */
export const startSimulation = async (
  simulationId: string
): Promise<StartSimulationResponse> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Authentification requise');

    // 1. Vérifier l'existence et le statut
    const { data: simulation, error: fetchError } = await supabase
      .from('simulations')
      .select('status, geometry_config, boundary_conditions, material_id, mesh_density, solver_type')
      .eq('id', simulationId)
      .eq('user_id', session.user.id)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        throw new Error('Simulation non trouvée');
      }
      throw new Error(`Erreur de récupération: ${fetchError.message}`);
    }

    // 2. Empêcher les doublons
    if (simulation.status === 'running') {
      throw new Error('Une simulation est déjà en cours');
    }

    // 3. Mettre à jour le statut immédiatement
    await supabase
      .from('simulations')
      .update({ 
        status: 'running', 
        progress: 0, 
        error_message: null,
        started_at: new Date().toISOString()
      })
      .eq('id', simulationId);

    // 4. Préparer la configuration
    const config: SimulationConfig = {
      geometry_config: simulation.geometry_config as any,
      boundary_conditions: simulation.boundary_conditions as any,
      material_id: simulation.material_id,
      mesh_density: simulation.mesh_density as MeshDensity,
      solver_type: simulation.solver_type,
    };

    // 5. Appeler l'Edge Function
    const { data, error } = await supabase.functions.invoke('simulate', {
      body: {
        simulation_id: simulationId,
        config: config,
        user_id: session.user.id,
      }
    });

    if (error) {
      console.error('Edge Function invocation error:', error);
      // Marquer comme échoué en cas d'erreur d'appel
      await supabase
        .from('simulations')
        .update({ 
          status: 'failed', 
          progress: 0, 
          error_message: error.message || 'Erreur lors de l\'appel',
          completed_at: new Date().toISOString()
        })
        .eq('id', simulationId);
      throw new Error(`Échec du lancement: ${error.message || 'Erreur inconnue'}`);
    }

    // 6. Retourner la réponse
    return {
      success: data?.success || false,
      simulation_id: simulationId,
      status: data?.status || 'running',
      results: data?.results,
      message: data?.message || 'Simulation lancée avec succès'
    };
  } catch (error: any) {
    console.error('❌ startSimulation error:', error);
    
    // Nettoyer en cas d'erreur
    try {
      await supabase
        .from('simulations')
        .update({ 
          status: 'failed', 
          error_message: error.message?.substring(0, 500),
          completed_at: new Date().toISOString()
        })
        .eq('id', simulationId);
    } catch (updateError) {
      console.error('Failed to update simulation status:', updateError);
    }
    
    throw error;
  }
};

/**
 * Upload un fichier de géométrie via Supabase Storage (solution recommandée)
 */
export const uploadGeometry = async (
  params: { file: File, userId: string, simulationId?: string }
): Promise<UploadGeometryResponse> => {
  try {
    // 1. Validation du fichier
    validateFile(params.file);

    // 2. Préparer le chemin dans Supabase Storage
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 9);
    const fileExt = params.file.name.split('.').pop();
    const fileName = `${params.userId}/${timestamp}_${randomId}.${fileExt}`;

    // 3. Upload direct vers Supabase Storage (solution simple et efficace)
    const { data, error } = await supabase.storage
      .from('geometries')
      .upload(fileName, params.file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      console.error('Supabase storage upload error:', error);
      
      // Gérer les erreurs spécifiques
      if (error.message.includes('bucket') || error.message.includes('not found')) {
        throw new Error('Configuration de stockage manquante. Contactez l\'administrateur.');
      }
      
      throw new Error(`Échec de l'upload: ${error.message}`);
    }

    // 4. Obtenir l'URL publique
    const { data: urlData } = supabase.storage
      .from('geometries')
      .getPublicUrl(fileName);

    if (!urlData.publicUrl) {
      throw new Error('Impossible de générer l\'URL publique');
    }

    return {
      success: true,
      fileUrl: urlData.publicUrl,
      fileName: params.file.name,
      fileSize: params.file.size,
      fileType: params.file.type,
    };
  } catch (error: any) {
    console.error('❌ uploadGeometry error:', error);
    
    // Messages d'erreur plus clairs
    if (error.message.includes('trop volumineux')) {
      throw new Error(error.message);
    }
    
    if (error.message.includes('Format non supporté')) {
      throw new Error(error.message);
    }
    
    throw new Error(`Erreur upload: ${error.message || 'Erreur inconnue'}`);
  }
};

/**
 * Upload alternative via Edge Function (si nécessaire)
 */
export const uploadGeometryViaEdgeFunction = async (
  params: { file: File, userId: string, simulationId?: string }
): Promise<UploadGeometryResponse> => {
  try {
    // Validation du fichier
    validateFile(params.file);

    // Convertir en base64 sans Buffer
    const arrayBuffer = await params.file.arrayBuffer();
    const fileData = arrayBufferToBase64(arrayBuffer);

    // Appel à l'Edge Function
    const { data, error } = await supabase.functions.invoke('upload-geometry', {
      body: {
        file_name: params.file.name,
        file_data: fileData,
        file_size: params.file.size,
        file_type: params.file.type,
        user_id: params.userId,
        simulation_id: params.simulationId,
      },
      timeout: 60000,
    });

    if (error) {
      console.error('Edge Function upload error:', error);
      throw new Error(`Échec de l'upload: ${error.message || 'Erreur inconnue'}`);
    }

    if (!data?.success) {
      throw new Error(data?.message || 'Upload échoué');
    }

    return {
      success: true,
      fileUrl: data.file_url,
      fileName: data.file_name,
      fileSize: params.file.size,
      fileType: params.file.type,
    };
  } catch (error: any) {
    console.error('❌ uploadGeometryViaEdgeFunction error:', error);
    throw error;
  }
};

/**
 * Supprime une simulation et ses résultats.
 */
export const deleteSimulation = async (
  simulationId: string
): Promise<void> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Authentification requise');

    // Vérifier que l'utilisateur est propriétaire et le statut
    const { data: simulation, error: fetchError } = await supabase
      .from('simulations')
      .select('user_id, status')
      .eq('id', simulationId)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') throw new Error('Simulation non trouvée');
      throw fetchError;
    }

    if (!simulation) throw new Error('Simulation non trouvée');
    if (simulation.user_id !== session.user.id) throw new Error('Permission refusée');
    if (simulation.status === 'running') throw new Error('Impossible de supprimer une simulation en cours');

    // Supprimer d'abord les résultats
    await supabase
      .from('simulation_results')
      .delete()
      .eq('simulation_id', simulationId);

    // Supprimer la simulation
    const { error: deleteError } = await supabase
      .from('simulations')
      .delete()
      .eq('id', simulationId)
      .eq('user_id', session.user.id);

    if (deleteError) {
      const supabaseError = handleSupabaseError(deleteError, 'deleteSimulation', { simulationId });
      throw new Error(supabaseError.userMessage);
    }
  } catch (error: any) {
    console.error('❌ deleteSimulation error:', error);
    throw error;
  }
};

/**
 * S'abonne aux changements de statut de la simulation.
 */
export const subscribeToSimulation = (
  simulationId: string,
  callback: (payload: any) => void
) => {
  const channel = supabase
    .channel(`simulation-updates-${simulationId}`)
    .on(
      'postgres_changes',
      { 
        event: '*', 
        schema: 'public', 
        table: 'simulations', 
        filter: `id=eq.${simulationId}` 
      },
      callback
    )
    .on(
      'postgres_changes',
      { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'simulation_results', 
        filter: `simulation_id=eq.${simulationId}` 
      },
      callback
    )
    .subscribe((status) => {
      console.log(`Subscription status for ${simulationId}:`, status);
    });

  return channel;
};

/**
 * Se désabonne d'un canal de simulation.
 */
export const unsubscribeFromChannel = (channel: any) => {
  if (channel) {
    supabase.removeChannel(channel);
  }
};

/**
 * Vérifie les permissions RLS pour l'utilisateur actuel.
 */
export const checkRLSPermissions = async (): Promise<boolean> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return false;

    // Test de lecture sur simulations
    const { error: simError } = await supabase
      .from('simulations')
      .select('id')
      .eq('user_id', session.user.id)
      .limit(1);

    if (simError) {
      console.error('RLS error on simulations:', simError);
      return false;
    }

    return true;
  } catch (error) {
    console.error('RLS check error:', error);
    return false;
  }
};

/**
 * Récupère les dernières simulations terminées.
 */
export const getCompletedSimulations = async (
  limit: number = 5
): Promise<Simulation[]> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Utilisateur non authentifié');

    const { data, error } = await supabase
      .from('simulations')
      .select(
        `
          *,
          simulation_results (*)
        `
      )
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

/**
 * Annule une simulation en cours.
 */
export const cancelSimulation = async (
  simulationId: string
): Promise<void> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Authentification requise');

    // Vérifier la propriété
    const { data: simulation, error: fetchError } = await supabase
      .from('simulations')
      .select('user_id, status')
      .eq('id', simulationId)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') throw new Error('Simulation non trouvée');
      throw fetchError;
    }

    if (!simulation) throw new Error('Simulation non trouvée');
    if (simulation.user_id !== session.user.id) throw new Error('Permission refusée');
    if (simulation.status !== 'running') throw new Error('Seules les simulations en cours peuvent être annulées');

    // Mettre à jour le statut
    const { error: updateError } = await supabase
      .from('simulations')
      .update({
        status: 'cancelled',
        progress: 0,
        error_message: 'Annulé par l\'utilisateur',
        completed_at: new Date().toISOString(),
      })
      .eq('id', simulationId);

    if (updateError) throw updateError;
  } catch (error: any) {
    console.error('❌ cancelSimulation error:', error);
    throw error;
  }
};

/**
 * Clone une simulation existante.
 */
export const cloneSimulation = async (
  simulationId: string
): Promise<Simulation> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Authentification requise');

    // Récupérer la simulation originale
    const original = await getSimulationById(simulationId);
    if (!original) throw new Error('Simulation originale non trouvée');

    // Créer une nouvelle simulation basée sur l'originale
    const clonedSimulation: SimulationInsert = {
      user_id: session.user.id,
      name: `${original.name} (Copie)`,
      description: original.description,
      geometry_type: original.geometry_type,
      geometry_config: original.geometry_config as any,
      boundary_conditions: original.boundary_conditions as any,
      material_id: original.material_id,
      mesh_density: original.mesh_density,
      solver_type: original.solver_type,
      status: 'pending' as SimulationStatus,
      progress: 0,
    };

    const { data, error } = await supabase
      .from('simulations')
      .insert(clonedSimulation)
      .select()
      .single();

    if (error) throw error;
    return data as Simulation;
  } catch (error: any) {
    console.error('❌ cloneSimulation error:', error);
    throw error;
  }
};

// -----------------------------------------------------------------------------
// EXPORT PAR DÉFAUT (Service)
// -----------------------------------------------------------------------------
const SimulationService = {
  getSimulations,
  getSimulationById,
  getSimulationResults,
  createSimulation,
  updateSimulation,
  startSimulation,
  uploadGeometry, // Version Supabase Storage (recommandée)
  uploadGeometryViaEdgeFunction, // Version alternative
  deleteSimulation,
  subscribeToSimulation,
  unsubscribeFromChannel,
  checkRLSPermissions,
  getCompletedSimulations,
  cancelSimulation,
  cloneSimulation,
};

export default SimulationService;
