import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

// -----------------------------------------------------------------------------
// TYPES - Exports de types MIS À JOUR
// -----------------------------------------------------------------------------
export type Simulation = Database['public']['Tables']['simulations']['Row'] & {
  simulation_results?: Database['public']['Tables']['simulation_results']['Row'][];
  mesh_data?: MeshData[];
  visualization_data?: VisualizationData[];
  optimization_history?: OptimizationHistory[];
};

export type SimulationInsert = Database['public']['Tables']['simulations']['Insert'];
export type SimulationUpdate = Database['public']['Tables']['simulations']['Update'];
export type SimulationResult = Database['public']['Tables']['simulation_results']['Row'];

// Types pour les nouvelles tables
export interface MeshData {
  id: string;
  simulation_id: string;
  file_name: string;
  file_url: string;
  file_size?: number;
  mesh_type?: string;
  element_count?: number;
  node_count?: number;
  quality_metric?: number;
  bounds?: { x: [number, number]; y: [number, number]; z: [number, number] };
  created_at: string;
}

export interface VisualizationData {
  id: string;
  simulation_id: string;
  vtk_file_url?: string;
  png_preview_url?: string;
  animation_url?: string;
  camera_angles?: any[];
  color_map?: string;
  created_at: string;
}

export interface OptimizationHistory {
  id: string;
  simulation_id: string;
  generation: number;
  best_fitness: number;
  average_fitness: number;
  mutation_count?: number;
  hyperparameters: any;
  created_at: string;
}

export type SimulationStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type MeshDensity = 'low' | 'medium' | 'high';
export type CoolingType = 'natural_convection' | 'forced_convection' | 'radiation';
export type FluidType = 'air' | 'water' | 'oil';
export type MeshType = 'tetrahedral' | 'hexahedral' | 'polyhedral' | 'unstructured' | 'structured' | 'surface';
export type SolverType = 'fem_fortran' | 'openfoam' | 'calculix' | 'ansys';

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
  mesh_density_level?: string; // Nouveau champ
  solver_type?: SolverType; // Nouveau champ
  optimization_enabled?: boolean; // Nouveau champ
  vtk_visualization_enabled?: boolean; // Nouveau champ
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
  meshDataId?: string;
}

export interface UploadToSimulationFilesParams {
  file: File | Blob;
  simulationId: string;
  userId: string;
  meshType?: MeshType;
  meshMetadata?: {
    element_count?: number;
    node_count?: number;
    quality_metric?: number;
    bounds?: { x: [number, number]; y: [number, number]; z: [number, number] };
  };
}

export interface UploadResult {
  success: boolean;
  publicUrl?: string;
  error?: string;
  fileName?: string;
  fileSize?: number;
  meshDataId?: string;
}

// -----------------------------------------------------------------------------
// FONCTIONS UTILITAIRES (inchangées)
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
  console.log('🔍 Validation fichier:', file.name, file.size, file.type);
  
  const maxSize = 50 * 1024 * 1024;
  if (file.size > maxSize) {
    throw new Error(`Fichier trop volumineux (${(file.size / 1024 / 1024).toFixed(2)}MB). Maximum: 50MB`);
  }
  
  const validExtensions = [
    '.stl', '.step', '.stp', '.obj', 
    '.vtp', '.vti', '.ply', '.vtk',
    '.iges', '.igs', '.xml', '.vtu',
    '.msh', '.mesh', '.inp', '.cgns'
  ];
  
  const fileExt = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
  if (!validExtensions.includes(fileExt)) {
    throw new Error(`Extension non supportée: ${fileExt}. Formats acceptés: ${validExtensions.join(', ')}`);
  }
  
  console.log('✅ Fichier validé');
};

const withTimeout = <T>(promise: Promise<T>, ms: number, errorMessage: string): Promise<T> => {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(errorMessage));
    }, ms);

    promise
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
};

const ensureSession = async (maxRetries = 3): Promise<any> => {
  for (let i = 0; i <= maxRetries; i++) {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) {
        console.error(`❌ Erreur session (tentative ${i + 1}/${maxRetries + 1}):`, error);
        if (i === maxRetries) throw error;
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        continue;
      }
      
      if (!session?.user) {
        console.log(`⚠️ Session non trouvée (tentative ${i + 1}/${maxRetries + 1})`);
        if (i === maxRetries) throw new Error('Session expirée. Veuillez vous reconnecter.');
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        continue;
      }
      
      console.log('✅ Session utilisateur vérifiée:', session.user.id);
      return session;
    } catch (error) {
      if (i === maxRetries) throw error;
    }
  }
  
  throw new Error('Impossible de vérifier la session');
};

// -----------------------------------------------------------------------------
// FONCTIONS EXPORTÉES - MISES À JOUR POUR LA COMPATIBILITÉ
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
      .select(`
        *,
        simulation_results (*),
        mesh_data (*),
        visualization_data (*),
        optimization_history (*)
      `)
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;

    return data as Simulation[];
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
      .select(`
        *,
        simulation_results (*),
        mesh_data (*),
        visualization_data (*),
        optimization_history (*)
      `)
      .eq('id', simulationId)
      .eq('user_id', session.user.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return data as Simulation;
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

    if (error) throw error;

    return data;
  } catch (error: any) {
    console.error('❌ getSimulationResults error:', error);
    throw error;
  }
};

export const getMeshData = async (simulationId: string): Promise<MeshData[]> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Utilisateur non authentifié');

    const { data, error } = await supabase
      .from('mesh_data')
      .select('*')
      .eq('simulation_id', simulationId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return data as MeshData[];
  } catch (error: any) {
    console.error('❌ getMeshData error:', error);
    throw error;
  }
};

export const getVisualizationData = async (simulationId: string): Promise<VisualizationData[]> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Utilisateur non authentifié');

    const { data, error } = await supabase
      .from('visualization_data')
      .select('*')
      .eq('simulation_id', simulationId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return data as VisualizationData[];
  } catch (error: any) {
    console.error('❌ getVisualizationData error:', error);
    throw error;
  }
};

export const getOptimizationHistory = async (simulationId: string): Promise<OptimizationHistory[]> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Utilisateur non authentifié');

    const { data, error } = await supabase
      .from('optimization_history')
      .select('*')
      .eq('simulation_id', simulationId)
      .order('generation', { ascending: true });

    if (error) throw error;

    return data as OptimizationHistory[];
  } catch (error: any) {
    console.error('❌ getOptimizationHistory error:', error);
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
      mesh_density_level: params.config.mesh_density_level || 'high', // Nouveau
      solver_type: params.config.solver_type || 'fem_fortran', // Nouveau
      optimization_enabled: params.config.optimization_enabled || false, // Nouveau
      vtk_visualization_enabled: params.config.vtk_visualization_enabled !== false, // Nouveau (true par défaut)
      status: 'pending' as SimulationStatus,
      progress: 0,
    };

    const { data, error } = await supabase
      .from('simulations')
      .insert(newSimulation)
      .select()
      .single();

    if (error) throw error;

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

    const updateData: SimulationUpdate = {
      name: params.name?.trim(),
      description: params.description?.trim(),
      geometry_type: params.geometryType,
      geometry_config: params.config?.geometry_config,
      boundary_conditions: params.config?.boundary_conditions as any,
      material_id: params.config?.material_id,
      mesh_density: params.config?.mesh_density,
      mesh_density_level: params.config?.mesh_density_level, // Nouveau
      solver_type: params.config?.solver_type, // Nouveau
      optimization_enabled: params.config?.optimization_enabled, // Nouveau
      vtk_visualization_enabled: params.config?.vtk_visualization_enabled, // Nouveau
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('simulations')
      .update(updateData)
      .eq('id', simulationId)
      .eq('user_id', session.user.id)
      .select()
      .single();

    if (error) throw error;

    return data as Simulation;
  } catch (error: any) {
    console.error('❌ updateSimulation error:', error);
    throw error;
  }
};

export const startSimulation = async (simulationId: string, config?: SimulationConfig): Promise<StartSimulationResponse> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Authentification requise');

    const payload = {
      simulation_id: simulationId,
      config: config || {}
    };

    console.log('🚀 Lancement simulation:', {
      simulationId,
      userId: session.user.id,
      config: payload.config
    });

    const invokePromise = supabase.functions.invoke('simulate', {
      body: payload,
      headers: {
        'Authorization': `Bearer ${session.access_token}`
      }
    });

    const { data, error } = await withTimeout(
      invokePromise,
      24000,
      '❌ Edge Function timeout (24s). Vérifiez que la simulation n\'est pas déjà en cours.'
    );

    if (error) {
      console.error('❌ Erreur Edge Function:', error);
      throw error;
    }

    if (!data.success) {
      throw new Error(data.error || 'Erreur inconnue lors de la simulation');
    }

    return {
      success: true,
      simulation_id: data.simulation_id,
      status: data.status,
      results: data.results,
      message: data.message
    };
  } catch (error: any) {
    console.error('❌ startSimulation error:', error);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await supabase
          .from('simulations')
          .update({
            status: 'failed',
            error_message: error.message.substring(0, 500),
            updated_at: new Date().toISOString()
          })
          .eq('id', simulationId)
          .eq('user_id', session.user.id);
      }
    } catch (updateError) {
      console.warn('⚠️ Impossible de mettre à jour le statut après erreur:', updateError);
    }
    
    throw error;
  }
};

export const uploadGeometry = async (
  params: { file: File; userId: string; simulationId?: string; geometryConfig?: any; meshType?: MeshType }
): Promise<UploadGeometryResponse> => {
  console.log('🚀 ========== DÉBUT UPLOAD GÉOMÉTRIE ==========');
  console.log('📁 Fichier:', params.file.name, `(${(params.file.size / 1024 / 1024).toFixed(2)}MB)`);
  
  try {
    validateFile(params.file);

    const session = await ensureSession();
    console.log('✅ Session vérifiée, utilisateur:', session.user.id);

    if (session.user.id !== params.userId) {
      console.error('❌ Mismatch userId:', session.user.id, 'vs', params.userId);
      throw new Error('Forbidden: User ID mismatch');
    }

    if (!params.simulationId) {
      console.warn('⚠️ simulationId non fourni, upload sans création de mesh_data');
      return await uploadFileOnly(params.file, params.userId, params.simulationId);
    }

    const result = await uploadToSimulationFilesSimple({
      file: params.file,
      simulationId: params.simulationId,
      userId: params.userId,
      meshType: params.meshType || 'tetrahedral'
    });
    
    console.log('✅ ========== UPLOAD RÉUSSI ==========');
    
    return {
      success: true,
      fileUrl: result.publicUrl!,
      fileName: result.fileName!,
      fileSize: result.fileSize,
      fileType: (params.file as File).type || 'application/octet-stream',
      path: result.fileName,
      meshDataId: result.meshDataId
    };
    
  } catch (error: any) {
    console.error('❌ ========== UPLOAD ÉCHOUÉ ==========');
    
    let userMessage = error.message;
    if (error.message?.includes('415') || error.message?.includes('MIME')) {
      userMessage = "Type de fichier non supporté par le serveur. Contactez l'admin pour autoriser ce format.";
    } else if (error.message?.includes('403') || error.message?.includes('permission')) {
      userMessage = "Erreur de permissions Supabase. Vérifiez les politiques RLS.";
    } else if (error.message?.includes('timeout')) {
      userMessage = "Le serveur n'a pas confirmé l'upload. Vérifiez vos permissions ou réessayez.";
    } else if (error.message?.includes('Forbidden')) {
      userMessage = "Accès refusé. Vérifiez que vous êtes connecté avec le bon compte.";
    }
    
    throw new Error(userMessage);
  }
};

// 🔥 FONCTION UPDATÉE POUR LA COMPATIBILITÉ COMPLÈTE
export const uploadToSimulationFilesSimple = async (
  params: UploadToSimulationFilesParams
): Promise<UploadResult> => {
  try {
    const { file, simulationId, userId, meshType = 'tetrahedral', meshMetadata = {} } = params;
    
    if (!file || !simulationId || !userId) {
      return { 
        success: false, 
        error: 'Missing required parameters: file, simulationId, userId' 
      };
    }

    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).slice(2, 9);
    const fileExtension = (file as File).name?.split('.').pop() || 'vtk';
    
    const fileName = `${userId}/${simulationId}_${timestamp}_${randomStr}.${fileExtension}`;
    
    console.log('📤 Upload simulation-files - Chemin:', fileName);
    
    const fileData = file instanceof Blob ? file : new Blob([file]);
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('simulation-files')
      .upload(fileName, fileData, {
        cacheControl: '3600',
        upsert: false,
        contentType: (file as File).type || 'application/octet-stream'
      });

    if (uploadError) {
      console.error('❌ Erreur upload simulation-files:', uploadError);
      return { 
        success: false, 
        error: uploadError.message 
      };
    }

    const { data: urlData } = supabase.storage
      .from('simulation-files')
      .getPublicUrl(fileName);

    if (!urlData?.publicUrl) {
      return { 
        success: false, 
        error: 'Impossible de générer URL publique pour le fichier' 
      };
    }

    console.log('✅ Fichier uploadé:', urlData.publicUrl);

    // 🔥 INSERTION COMPATIBLE AVEC LE NOUVEAU SCHÉMA SQL
    let meshDataId: string | undefined;
    try {
      const { data: meshData, error: meshError } = await supabase
        .from('mesh_data')
        .insert({
          simulation_id: simulationId,
          file_name: fileName,
          file_url: urlData.publicUrl,
          file_size: (file as File).size || fileData.size,
          mesh_type: meshType,
          element_count: meshMetadata.element_count,
          node_count: meshMetadata.node_count,
          quality_metric: meshMetadata.quality_metric,
          bounds: meshMetadata.bounds,
          created_at: new Date().toISOString()
        })
        .select('id')
        .single();

      if (meshError) {
        console.error('❌ Erreur création mesh_data:', meshError);
        // Fallback: utiliser l'ancien schéma si le nouveau échoue
        await createMeshDataFallback(simulationId, userId, fileName, urlData.publicUrl, fileData, meshType);
      } else {
        meshDataId = meshData.id;
        console.log('✅ Record mesh_data créé avec ID:', meshDataId);
      }
    } catch (meshError: any) {
      console.warn('⚠️ Exception création mesh_data:', meshError.message);
      await createMeshDataFallback(simulationId, userId, fileName, urlData.publicUrl, fileData, meshType);
    }

    await updateSimulationWithFileUrl(simulationId, userId, urlData.publicUrl, fileName, file);

    return {
      success: true,
      publicUrl: urlData.publicUrl,
      fileName: fileName,
      fileSize: (file as File).size || fileData.size,
      meshDataId: meshDataId
    };

  } catch (error: any) {
    console.error('❌ uploadToSimulationFilesSimple error:', error);
    return { 
      success: false, 
      error: error.message || 'Unknown error' 
    };
  }
};

// Fallback pour la compatibilité avec l'ancien schéma
const createMeshDataFallback = async (
  simulationId: string,
  userId: string,
  fileName: string,
  fileUrl: string,
  fileData: Blob,
  meshType: string
): Promise<void> => {
  try {
    // Vérifier si la table mesh_data a une colonne user_id
    const { data: tableInfo } = await supabase
      .from('information_schema.columns')
      .select('column_name')
      .eq('table_schema', 'public')
      .eq('table_name', 'mesh_data')
      .eq('column_name', 'user_id');

    const hasUserIdColumn = tableInfo && tableInfo.length > 0;

    const meshDataRecord: any = {
      simulation_id: simulationId,
      file_name: fileName,
      file_url: fileUrl,
      file_size: fileData.size,
      mesh_type: meshType,
      created_at: new Date().toISOString()
    };

    // Ajouter user_id seulement si la colonne existe
    if (hasUserIdColumn) {
      meshDataRecord.user_id = userId;
    }

    const { error } = await supabase
      .from('mesh_data')
      .insert(meshDataRecord);

    if (error) {
      console.warn('⚠️ Échec fallback création mesh_data:', error.message);
    } else {
      console.log('✅ Record mesh_data créé (fallback)');
    }
  } catch (error: any) {
    console.warn('⚠️ Exception fallback création mesh_data:', error.message);
  }
};

const uploadFileOnly = async (
  file: File,
  userId: string,
  simulationId?: string
): Promise<UploadGeometryResponse> => {
  const timestamp = Date.now();
  const uniqueId = Math.random().toString(36).substring(2, 9);
  const fileExt = file.name.split('.').pop()?.toLowerCase() || 'vtp';
  
  const fileName = `${userId}/${timestamp}_${uniqueId}.${fileExt}`;
  
  console.log('📤 Upload simple - Chemin:', fileName);
  
  const contentType = 'application/octet-stream';
  
  const { data: uploadData, error: uploadError } = await withTimeout(
    supabase.storage
      .from('simulation-files')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: contentType
      }),
    30000,
    '❌ Supabase Storage upload timeout (30s)'
  );
  
  if (uploadError) {
    console.error('❌ Erreur upload simulation-files:', uploadError);
    
    if (uploadError.message?.includes('already exists')) {
      throw new Error('Un fichier avec ce nom existe déjà. Veuillez renommer votre fichier.');
    }
    
    throw uploadError;
  }
  
  const { data: publicUrlData } = supabase.storage
    .from('simulation-files')
    .getPublicUrl(fileName);
  
  if (!publicUrlData?.publicUrl) {
    throw new Error('Impossible de générer URL publique pour le fichier');
  }
  
  if (simulationId) {
    await updateSimulationWithFileUrl(simulationId, userId, publicUrlData.publicUrl, fileName, file);
  }
  
  return {
    success: true,
    fileUrl: publicUrlData.publicUrl,
    fileName: file.name,
    fileSize: file.size,
    fileType: contentType,
    path: fileName
  };
};

const updateSimulationWithFileUrl = async (
  simulationId: string,
  userId: string,
  fileUrl: string,
  filePath: string,
  file: File | Blob
): Promise<void> => {
  if (!simulationId) return;
  
  try {
    const fileSize = (file as File).size || (file as Blob).size;
    
    const updateData = {
      geometry_config: {
        file_url: fileUrl,
        file_path: filePath,
        file_name: (file as File).name || filePath.split('/').pop(),
        file_size: fileSize,
        uploaded_at: new Date().toISOString(),
        file_type: 'application/octet-stream'
      },
      updated_at: new Date().toISOString()
    };
    
    const { error } = await supabase
      .from('simulations')
      .update(updateData)
      .eq('id', simulationId)
      .eq('user_id', userId);
    
    if (error) {
      console.warn('⚠️ Échec mise à jour simulation:', error.message);
      throw error;
    }
    
    console.log('✅ Simulation mise à jour avec fichier:', filePath);
  } catch (updateError: any) {
    console.warn('⚠️ Exception mise à jour simulation:', updateError.message);
    throw updateError;
  }
};

export const deleteSimulation = async (simulationId: string): Promise<void> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Authentification requise');

    const { data: meshData } = await supabase
      .from('mesh_data')
      .select('file_name')
      .eq('simulation_id', simulationId);

    if (meshData && meshData.length > 0) {
      const filePaths = meshData.map(md => md.file_name).filter(Boolean);
      if (filePaths.length > 0) {
        await supabase.storage
          .from('simulation-files')
          .remove(filePaths);
      }
    }

    await supabase.from('visualization_data').delete().eq('simulation_id', simulationId);
    await supabase.from('optimization_history').delete().eq('simulation_id', simulationId);
    await supabase.from('mesh_data').delete().eq('simulation_id', simulationId);
    await supabase.from('simulation_results').delete().eq('simulation_id', simulationId);
    
    const { error } = await supabase
      .from('simulations')
      .delete()
      .eq('id', simulationId)
      .eq('user_id', session.user.id);
    
    if (error) throw error;
    
  } catch (error: any) {
    console.error('❌ deleteSimulation error:', error);
    throw error;
  }
};

export const createVisualizationData = async (
  simulationId: string,
  data: {
    vtk_file_url?: string;
    png_preview_url?: string;
    animation_url?: string;
    camera_angles?: any[];
    color_map?: string;
  }
): Promise<VisualizationData> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Authentification requise');

    const visualizationData = {
      simulation_id: simulationId,
      vtk_file_url: data.vtk_file_url,
      png_preview_url: data.png_preview_url,
      animation_url: data.animation_url,
      camera_angles: data.camera_angles || [],
      color_map: data.color_map || 'thermal',
      created_at: new Date().toISOString()
    };

    const { data: result, error } = await supabase
      .from('visualization_data')
      .insert(visualizationData)
      .select()
      .single();

    if (error) throw error;

    return result as VisualizationData;
  } catch (error: any) {
    console.error('❌ createVisualizationData error:', error);
    throw error;
  }
};

export const createOptimizationHistory = async (
  simulationId: string,
  data: {
    generation: number;
    best_fitness: number;
    average_fitness: number;
    mutation_count?: number;
    hyperparameters: any;
  }
): Promise<OptimizationHistory> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Authentification requise');

    const optimizationData = {
      simulation_id: simulationId,
      generation: data.generation,
      best_fitness: data.best_fitness,
      average_fitness: data.average_fitness,
      mutation_count: data.mutation_count || 0,
      hyperparameters: data.hyperparameters,
      created_at: new Date().toISOString()
    };

    const { data: result, error } = await supabase
      .from('optimization_history')
      .insert(optimizationData)
      .select()
      .single();

    if (error) throw error;

    return result as OptimizationHistory;
  } catch (error: any) {
    console.error('❌ createOptimizationHistory error:', error);
    throw error;
  }
};

export const subscribeToSimulation = (simulationId: string, callback: (payload: any) => void) => {
  return supabase.channel(`simulation-updates-${simulationId}`)
    .on('postgres_changes', { 
      event: '*', 
      schema: 'public', 
      table: 'simulations', 
      filter: `id=eq.${simulationId}` 
    }, callback)
    .subscribe();
};

export const unsubscribeFromChannel = (channel: any) => {
  if (channel) supabase.removeChannel(channel);
};

export const testUpload = async (file: File, userId: string): Promise<UploadGeometryResponse> => {
  return uploadGeometry({ file, userId });
};

export const getSignedUrl = async (filePath: string, expiresIn = 3600): Promise<string | null> => {
  try {
    const { data, error } = await supabase.storage
      .from('simulation-files')
      .createSignedUrl(filePath, expiresIn);
    
    if (error) {
      console.error('❌ Erreur génération URL signée:', error);
      return null;
    }
    
    return data.signedUrl;
  } catch (error) {
    console.error('❌ Exception génération URL signée:', error);
    return null;
  }
};

export const SimulationService = {
  getSimulations,
  getSimulationById,
  getSimulationResults,
  getMeshData,
  getVisualizationData,
  getOptimizationHistory,
  createSimulation,
  updateSimulation,
  startSimulation,
  uploadGeometry,
  uploadToSimulationFilesSimple,
  deleteSimulation,
  createVisualizationData,
  createOptimizationHistory,
  subscribeToSimulation,
  unsubscribeFromChannel,
  testUpload,
  getSignedUrl
};

export default SimulationService;
