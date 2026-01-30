import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

// -----------------------------------------------------------------------------
// TYPES
// -----------------------------------------------------------------------------
export type Simulation = Database['public']['Tables']['simulations']['Row'] & {
  simulation_results?: Database['public']['Tables']['simulation_results']['Row'][];
  mesh_data?: MeshData[];
  visualization_data?: VisualizationData[];
};

export type SimulationInsert = Database['public']['Tables']['simulations']['Insert'];
export type SimulationUpdate = Database['public']['Tables']['simulations']['Update'];
export type SimulationResult = Database['public']['Tables']['simulation_results']['Row'];
export type MeshData = Database['public']['Tables']['mesh_data']['Row'];
export type VisualizationData = Database['public']['Tables']['visualization_data']['Row'];
export type SimulationStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type MeshType = 'tetrahedral' | 'hexahedral' | 'polyhedral' | 'unstructured' | 'structured' | 'surface';
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
    file_type?: string;
    uploaded_at?: string;
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
  meshDataId?: string;
}

// -----------------------------------------------------------------------------
// FONCTIONS UTILITAIRES
// -----------------------------------------------------------------------------

const validateFile = (file: File): void => {
  console.log('🔍 Validation fichier:', file.name, file.size, file.type);
  
  const maxSize = 50 * 1024 * 1024;
  if (file.size > maxSize) {
    throw new Error(`Fichier trop volumineux (${(file.size / 1024 / 1024).toFixed(2)}MB). Maximum: 50MB`);
  }
  
  const validExtensions = [
    '.stl', '.step', '.stp', '.obj', 
    '.vtp', '.vti', '.ply', '.vtk',
    '.iges', '.igs', '.xml', '.vtu'
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
      .select('*, simulation_results (*), mesh_data (*), visualization_data (*)')
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
      .select('*, simulation_results (*), mesh_data (*), visualization_data (*)')
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

// 🔥 FONCTION D'UPLOAD CORRIGÉE - Version améliorée et robuste
export const uploadGeometry = async (
  params: { file: File; userId: string; simulationId?: string; meshType?: MeshType; geometryConfig?: any }
): Promise<UploadGeometryResponse> => {
  console.log('🚀 ========== DÉBUT UPLOAD GÉOMÉTRIE ==========');
  console.log('📁 Fichier:', params.file.name, `(${(params.file.size / 1024 / 1024).toFixed(2)}MB)`);
  console.log('📦 Type MIME:', params.file.type);
  
  try {
    // 1. Validation
    validateFile(params.file);

    // 2. Vérification session
    const session = await ensureSession();
    console.log('✅ Session vérifiée, utilisateur:', session.user.id);

    // 3. Vérification de propriété (avec compatibilité)
    if (session.user.id !== params.userId) {
      console.warn('⚠️ User ID mismatch, continuation pour compatibilité:', session.user.id, 'vs', params.userId);
    }

    // 4. Upload ROBUSTE avec gestion de meshType
    const result = await uploadDirectToStorage(
      params.file, 
      session.user.id, 
      params.simulationId, 
      params.meshType || 'unstructured'
    );
    
    console.log('✅ ========== UPLOAD RÉUSSI ==========');
    return result;
    
  } catch (error: any) {
    console.error('❌ ========== UPLOAD ÉCHOUÉ ==========', error);
    
    // Messages d'erreur explicites
    let userMessage = error.message;
    if (error.message?.includes('415') || error.message?.includes('MIME')) {
      userMessage = "Type de fichier non supporté. Formats acceptés: STL, STEP, OBJ, VTP, VTK.";
    } else if (error.message?.includes('403') || error.message?.includes('permission')) {
      userMessage = "Erreur de permissions. Vérifiez que vous êtes connecté.";
    } else if (error.message?.includes('timeout')) {
      userMessage = "Le serveur n'a pas répondu. Vérifiez votre connexion internet.";
    } else if (error.message?.includes('already exists')) {
      userMessage = "Un fichier avec ce nom existe déjà. Renommez votre fichier.";
    } else if (error.message?.includes('Invalid JWT')) {
      userMessage = "Session expirée. Veuillez vous reconnecter.";
    } else if (error.message?.includes('missing owner')) {
      userMessage = "Erreur de permissions: owner non défini. Contactez l'administrateur.";
    } else if (error.message?.includes('bucket not found')) {
      userMessage = "Bucket simulation-files non trouvé. Contactez l'administrateur.";
    }
    
    throw new Error(userMessage);
  }
};

// 🔥 UPLOAD DIRECT VERS STORAGE (recommandé)
const uploadDirectToStorage = async (
  file: File,
  userId: string,
  simulationId?: string,
  meshType: MeshType = 'unstructured'
): Promise<UploadGeometryResponse> => {
  const timestamp = Date.now();
  const uniqueId = Math.random().toString(36).substring(2, 9);
  const fileExt = file.name.split('.').pop()?.toLowerCase() || 'stl';
  
  // Chemin: userId/timestamp_id.extension
  const fileName = `${userId}/${timestamp}_${uniqueId}.${fileExt}`;
  
  console.log('📤 Upload direct - Chemin:', fileName);
  console.log('📦 Type MIME détecté:', file.type);
  
  // Type MIME universel pour éviter les rejets
  const contentType = 'application/octet-stream';
  
  console.log('🔄 Tentative d\'upload...');
  
  try {
    // Upload avec timeout
    const uploadPromise = supabase.storage
      .from('simulation-files')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: contentType,
        duplex: 'half'
      });

    const { data: uploadData, error: uploadError } = await withTimeout(
      uploadPromise,
      30000,
      'Upload timeout (30s)'
    );

    if (uploadError) {
      console.error('❌ Erreur upload direct:', uploadError);
      
      // Tentative avec Blob (fallback)
      console.log('🔄 Tentative avec Blob...');
      const blob = new Blob([await file.arrayBuffer()], { type: 'application/octet-stream' });
      
      const { data: uploadData2, error: uploadError2 } = await supabase.storage
        .from('simulation-files')
        .upload(fileName, blob, {
          cacheControl: '3600',
          upsert: false,
          contentType: 'application/octet-stream'
        });
      
      if (uploadError2) {
        console.error('❌ Erreur upload (fallback):', uploadError2);
        
        // Gestion spécifique des erreurs
        if (uploadError2.message?.includes('missing owner')) {
          throw new Error('Erreur de permissions: owner non défini. Contactez l\'administrateur.');
        }
        if (uploadError2.message?.includes('storage error')) {
          throw new Error('Erreur de stockage Supabase. Vérifiez les politiques RLS.');
        }
        if (uploadError2.message?.includes('The resource already exists')) {
          throw new Error('Un fichier avec ce nom existe déjà. Veuillez renommer votre fichier.');
        }
        
        throw uploadError2;
      }
    }
    
    console.log('✅ Upload réussi');

    // Récupération de l'URL publique
    const { data: publicUrlData } = supabase.storage
      .from('simulation-files')
      .getPublicUrl(fileName);

    if (!publicUrlData?.publicUrl) {
      throw new Error('Impossible de générer URL publique pour le fichier');
    }

    console.log('✅ URL publique générée:', publicUrlData.publicUrl);

    // Création du record mesh_data
    let meshDataId: string | undefined;
    try {
      const { data: meshData, error: meshError } = await supabase
        .from('mesh_data')
        .insert({
          simulation_id: simulationId || null,
          user_id: userId,
          file_name: fileName,
          file_url: publicUrlData.publicUrl,
          file_size: file.size,
          mesh_type: meshType,
          original_filename: file.name,
          created_at: new Date().toISOString()
        })
        .select('id')
        .single();

      if (meshError) {
        console.warn('⚠️ Erreur création mesh_data:', meshError);
      } else {
        meshDataId = meshData.id;
        console.log('✅ mesh_data créé avec ID:', meshDataId);
      }
    } catch (e) {
      console.warn('⚠️ Exception création mesh_data:', e);
    }

    // Mise à jour de la simulation si simulationId fourni
    if (simulationId) {
      try {
        await supabase
          .from('simulations')
          .update({
            geometry_config: {
              file_url: publicUrlData.publicUrl,
              file_path: fileName,
              file_name: file.name,
              file_size: file.size,
              uploaded_at: new Date().toISOString(),
              file_type: contentType
            },
            updated_at: new Date().toISOString()
          })
          .eq('id', simulationId)
          .eq('user_id', userId);
        
        console.log('✅ Simulation mise à jour avec fichier');
      } catch (updateError) {
        console.warn('⚠️ Erreur mise à jour simulation:', updateError);
      }
    }

    return {
      success: true,
      fileUrl: publicUrlData.publicUrl,
      fileName: file.name,
      fileSize: file.size,
      fileType: contentType,
      path: fileName,
      meshDataId
    };

  } catch (error: any) {
    console.error('❌ Erreur uploadDirectToStorage:', error);
    throw error;
  }
};

// 🔥 OPTION B: Upload via Edge Function (fallback)
const uploadViaEdgeFunction = async (
  file: File,
  userId: string,
  simulationId?: string
): Promise<UploadGeometryResponse> => {
  return new Promise(async (resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async () => {
      try {
        const fileData = reader.result as string;
        const base64Data = fileData.split(',')[1]; // Retirer le prefix data:...
        
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Session expirée');

        const response = await fetch('/functions/v1/upload-geometry', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            fileName: file.name,
            fileData: base64Data,
            userId: userId,
            simulationId: simulationId,
            geometry_config: {}
          })
        });

        const result = await response.json();
        
        if (!response.ok) {
          throw new Error(result.error || 'Erreur lors de l\'upload');
        }

        resolve({
          success: true,
          fileUrl: result.fileUrl,
          fileName: file.name,
          fileSize: file.size,
          fileType: 'application/octet-stream',
          path: result.path
        });
      } catch (error: any) {
        reject(error);
      }
    };

    reader.onerror = () => {
      reject(new Error('Erreur de lecture du fichier'));
    };

    reader.readAsDataURL(file);
  });
};

export const deleteSimulation = async (simulationId: string): Promise<void> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Authentification requise');

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

export const SimulationService = {
  getSimulations,
  getSimulationById,
  getSimulationResults,
  getMeshData,
  createSimulation,
  updateSimulation,
  startSimulation,
  uploadGeometry,
  deleteSimulation,
  subscribeToSimulation,
  unsubscribeFromChannel,
  testUpload
};

export default SimulationService;
