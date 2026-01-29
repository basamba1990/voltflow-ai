import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

// -----------------------------------------------------------------------------
// TYPES - Exports de types
// -----------------------------------------------------------------------------
export type Simulation = Database['public']['Tables']['simulations']['Row'] & {
  simulation_results?: Database['public']['Tables']['simulation_results']['Row'][];
  mesh_data?: Database['public']['Tables']['mesh_data']['Row'][]; // Ajout de mesh_data
};

export type SimulationInsert = Database['public']['Tables']['simulations']['Insert'];
export type SimulationUpdate = Database['public']['Tables']['simulations']['Update'];
export type SimulationResult = Database['public']['Tables']['simulation_results']['Row'];
export type MeshData = Database['public']['Tables']['mesh_data']['Row'];
export type SimulationStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type MeshDensity = 'low' | 'medium' | 'high';
export type CoolingType = 'natural_convection' | 'forced_convection' | 'radiation';
export type FluidType = 'air' | 'water' | 'oil';
export type MeshType = 'tetrahedral' | 'hexahedral' | 'polyhedral' | 'unstructured' | 'structured' | 'surface';

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
  meshDataId?: string; // Ajout de l'ID du mesh_data
}

export interface UploadToSimulationFilesParams {
  file: File | Blob;
  simulationId: string;
  userId: string;
  meshType?: MeshType;
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

// Validation simplifiée - uniquement extension
const validateFile = (file: File): void => {
  console.log('🔍 Validation fichier:', file.name, file.size, file.type);
  
  const maxSize = 50 * 1024 * 1024;
  if (file.size > maxSize) {
    throw new Error(`Fichier trop volumineux (${(file.size / 1024 / 1024).toFixed(2)}MB). Maximum: 50MB`);
  }
  
  // Validation uniquement par extension
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

// Fonction timeout - Réduit à 24s pour éviter conflit avec Edge Function (25s)
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

// Vérifier la session utilisateur avec réessais
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
      .select('*, simulation_results (*), mesh_data (*)')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;

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
      .select('*, simulation_results (*), mesh_data (*)')
      .eq('id', simulationId)
      .eq('user_id', session.user.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
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

    return data || [];
  } catch (error: any) {
    console.error('❌ getMeshData error:', error);
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
      solver_type: params.config?.solver_type,
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

// Fonction startSimulation corrigée selon l'audit
export const startSimulation = async (simulationId: string, config?: SimulationConfig): Promise<StartSimulationResponse> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Authentification requise');

    // Ne pas envoyer user_id dans le body - récupéré via JWT
    const payload = {
      simulation_id: simulationId,
      config: config || {}
    };

    console.log('🚀 Lancement simulation:', {
      simulationId,
      userId: session.user.id,
      config: payload.config
    });

    // Timeout réduit à 24000ms (24s) pour éviter conflit avec Edge Function (25s)
    const invokePromise = supabase.functions.invoke('simulate', {
      body: payload,
      headers: {
        'Authorization': `Bearer ${session.access_token}`
      }
    });

    // Timeout ajusté à 24s au lieu de 30s
    const { data, error } = await withTimeout(
      invokePromise,
      24000, // 24 secondes
      '❌ Edge Function timeout (24s). Vérifiez que la simulation n\'est pas déjà en cours.'
    );

    if (error) {
      console.error('❌ Erreur Edge Function:', error);
      throw error;
    }

    // Validation de la réponse
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
    
    // Tentative de mise à jour du statut en cas d'erreur
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

// 🔥 FONCTION PRINCIPALE D'UPLOAD - VERSION COMPLÈTE ET CORRIGÉE
export const uploadGeometry = async (
  params: { file: File; userId: string; simulationId?: string; geometryConfig?: any; meshType?: MeshType }
): Promise<UploadGeometryResponse> => {
  console.log('🚀 ========== DÉBUT UPLOAD GÉOMÉTRIE ==========');
  console.log('📁 Fichier:', params.file.name, `(${(params.file.size / 1024 / 1024).toFixed(2)}MB)`);
  
  try {
    // 1. Validation
    validateFile(params.file);

    // 2. Vérification session
    const session = await ensureSession();
    console.log('✅ Session vérifiée, utilisateur:', session.user.id);

    // Vérification de propriété
    if (session.user.id !== params.userId) {
      console.error('❌ Mismatch userId:', session.user.id, 'vs', params.userId);
      throw new Error('Forbidden: User ID mismatch');
    }

    // 3. Vérifier que simulationId est défini si on veut créer un mesh_data
    if (!params.simulationId) {
      console.warn('⚠️ simulationId non fourni, upload sans création de mesh_data');
      return await uploadFileOnly(params.file, params.userId, params.simulationId);
    }

    // 4. Upload avec création de mesh_data
    const result = await uploadToSimulationFilesSimple({
      file: params.file,
      simulationId: params.simulationId,
      userId: params.userId,
      meshType: params.meshType || 'unstructured'
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

// 🔥 NOUVELLE FONCTION: Upload avec création de mesh_data
export const uploadToSimulationFilesSimple = async (
  params: UploadToSimulationFilesParams
): Promise<UploadResult> => {
  try {
    const { file, simulationId, userId, meshType = 'unstructured' } = params;
    
    // Validation des paramètres requis
    if (!file || !simulationId || !userId) {
      return { 
        success: false, 
        error: 'Missing required parameters: file, simulationId, userId' 
      };
    }

    // Génération d'un nom de fichier unique
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).slice(2, 9);
    const fileExtension = (file as File).name?.split('.').pop() || 'vtk';
    
    // Format: userId/simulationId_timestamp_random.extension
    const fileName = `${userId}/${simulationId}_${timestamp}_${randomStr}.${fileExtension}`;
    
    console.log('📤 Upload simulation-files - Chemin:', fileName);
    
    // Conversion en Blob si nécessaire
    const fileData = file instanceof Blob ? file : new Blob([file]);
    
    // Upload vers Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('simulation-files')
      .upload(fileName, fileData, {
        cacheControl: '3600',
        upsert: false, // Ne pas écraser les fichiers existants
        contentType: (file as File).type || 'application/octet-stream'
      });

    if (uploadError) {
      console.error('❌ Erreur upload simulation-files:', uploadError);
      return { 
        success: false, 
        error: uploadError.message 
      };
    }

    // Récupération de l'URL publique
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

    // Création du record dans mesh_data
    let meshDataId: string | undefined;
    try {
      const { data: meshData, error: meshError } = await supabase
        .from('mesh_data')
        .insert({
          simulation_id: simulationId,
          user_id: userId,
          file_name: fileName,
          file_url: urlData.publicUrl,
          mesh_type: meshType,
          file_size: (file as File).size || fileData.size,
          original_filename: (file as File).name || 'uploaded_file',
          created_at: new Date().toISOString()
        })
        .select('id')
        .single();

      if (meshError) {
        console.error('❌ Erreur création mesh_data:', meshError);
        // On continue quand même, l'upload a réussi
      } else {
        meshDataId = meshData.id;
        console.log('✅ Record mesh_data créé avec ID:', meshDataId);
      }
    } catch (meshError: any) {
      console.warn('⚠️ Exception création mesh_data:', meshError.message);
    }

    // Mise à jour de la simulation avec l'URL du fichier
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

// Fonction d'upload simple sans création de mesh_data (pour backward compatibility)
const uploadFileOnly = async (
  file: File,
  userId: string,
  simulationId?: string
): Promise<UploadGeometryResponse> => {
  const timestamp = Date.now();
  const uniqueId = Math.random().toString(36).substring(2, 9);
  const fileExt = file.name.split('.').pop()?.toLowerCase() || 'vtp';
  
  // Format: userId/timestamp_random.extension
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

    // Récupérer les mesh_data associés pour supprimer les fichiers
    const { data: meshData } = await supabase
      .from('mesh_data')
      .select('file_name')
      .eq('simulation_id', simulationId);

    // Supprimer les fichiers de storage
    if (meshData && meshData.length > 0) {
      const filePaths = meshData.map(md => md.file_name).filter(Boolean);
      if (filePaths.length > 0) {
        await supabase.storage
          .from('simulation-files')
          .remove(filePaths);
      }
    }

    // Suppression des mesh_data
    await supabase.from('mesh_data').delete().eq('simulation_id', simulationId);
    
    // Suppression des résultats
    await supabase.from('simulation_results').delete().eq('simulation_id', simulationId);
    
    // Suppression de la simulation avec vérification de propriété
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

// Fonction utilitaire pour récupérer l'URL signée d'un fichier (pour les buckets privés)
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
  createSimulation,
  updateSimulation,
  startSimulation,
  uploadGeometry,
  uploadToSimulationFilesSimple,
  deleteSimulation,
  subscribeToSimulation,
  unsubscribeFromChannel,
  testUpload,
  getSignedUrl
};

export default SimulationService;
