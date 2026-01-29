import { supabase } from '@/lib/supabase';
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
      .select('*, simulation_results (*)')
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
      .select('*, simulation_results (*)')
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

// 🔥 FONCTION D'UPLOAD CORRIGÉE - Version simplifiée et robuste
export const uploadGeometry = async (
  params: { file: File; userId: string; simulationId?: string; geometryConfig?: any }
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

    // 3. Vérification de propriété
    if (session.user.id !== params.userId) {
      console.error('❌ Mismatch userId:', session.user.id, 'vs', params.userId);
      throw new Error('Forbidden: User ID mismatch');
    }

    // 4. Upload SIMPLIFIÉ et ROBUSTE
    const result = await uploadFileRobust(params.file, session.user.id, params.simulationId);
    
    console.log('✅ ========== UPLOAD RÉUSSI ==========');
    return result;
    
  } catch (error: any) {
    console.error('❌ ========== UPLOAD ÉCHOUÉ ==========', error);
    
    // Log détaillé pour débogage
    if (error.message?.includes('Invalid JWT')) {
      console.error('🔴 Erreur JWT - Session probablement expirée');
    }
    if (error.message?.includes('403')) {
      console.error('🔴 Erreur 403 - Problème de permissions RLS');
    }
    if (error.message?.includes('415')) {
      console.error('🔴 Erreur 415 - Type MIME non supporté:', params.file?.type);
    }
    
    let userMessage = error.message;
    if (error.message?.includes('415') || error.message?.includes('MIME')) {
      userMessage = "Type de fichier non supporté. Essayez de renommer le fichier avec l'extension correcte.";
    } else if (error.message?.includes('403') || error.message?.includes('permission')) {
      userMessage = "Problème de permissions. Veuillez vous reconnecter.";
    } else if (error.message?.includes('timeout')) {
      userMessage = "Upload trop long. Essayez avec un fichier plus petit (< 20MB).";
    } else if (error.message?.includes('Forbidden')) {
      userMessage = "Accès refusé. Vérifiez votre connexion.";
    } else if (error.message?.includes('JWT')) {
      userMessage = "Session expirée. Veuillez vous reconnecter.";
    }
    
    throw new Error(userMessage);
  }
};

// 🔥 FONCTION D'UPLOAD ROBUSTE - Corrigée
const uploadFileRobust = async (
  file: File,
  userId: string,
  simulationId?: string
): Promise<UploadGeometryResponse> => {
  const timestamp = Date.now();
  const uniqueId = Math.random().toString(36).substring(2, 9);
  const fileExt = file.name.split('.').pop()?.toLowerCase() || 'stl';
  
  // CHEMIN SÉCURISÉ : "userId/timestamp_random.extension"
  const fileName = `${userId}/${timestamp}_${uniqueId}.${fileExt}`;
  
  console.log('📤 Upload robuste - Chemin:', fileName);
  console.log('📦 Type MIME détecté:', file.type);
  
  // 🔥 CORRECTION: Utiliser le type MIME du fichier OU application/octet-stream
  const contentType = file.type || 'application/octet-stream';
  console.log('📦 Type MIME utilisé pour upload:', contentType);
  
  try {
    // 1. Tentative d'upload avec le vrai type MIME
    console.log('🔄 Tentative d\'upload...');
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('simulation-files')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: contentType,
        duplex: 'half' // Important pour les gros fichiers
      });

    if (uploadError) {
      console.error('❌ Erreur upload (première tentative):', uploadError);
      
      // 2. Tentative avec application/octet-stream si échec
      console.log('🔄 Tentative avec application/octet-stream...');
      
      const { data: uploadData2, error: uploadError2 } = await supabase.storage
        .from('simulation-files')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: 'application/octet-stream',
          duplex: 'half'
        });
      
      if (uploadError2) {
        console.error('❌ Erreur upload (seconde tentative):', uploadError2);
        
        // 3. Tentative avec un Blob (dernier recours)
        console.log('🔄 Tentative avec Blob...');
        const blob = new Blob([await file.arrayBuffer()], { type: 'application/octet-stream' });
        
        const { data: uploadData3, error: uploadError3 } = await supabase.storage
          .from('simulation-files')
          .upload(fileName, blob, {
            cacheControl: '3600',
            upsert: false,
            contentType: 'application/octet-stream'
          });
        
        if (uploadError3) {
          console.error('❌ Erreur upload (troisième tentative):', uploadError3);
          throw uploadError3;
        }
      }
    }
    
    console.log('✅ Upload réussi');

    // 4. Récupération de l'URL publique
    const { data: publicUrlData } = supabase.storage
      .from('simulation-files')
      .getPublicUrl(fileName);
    
    if (!publicUrlData?.publicUrl) {
      throw new Error('Impossible de générer URL publique pour le fichier');
    }
    
    console.log('✅ URL publique générée:', publicUrlData.publicUrl);

    // 5. Mise à jour de la simulation si simulationId fourni
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
    
  } catch (error: any) {
    console.error('❌ Erreur uploadFileRobust:', error);
    
    // Analyse spécifique des erreurs Supabase
    if (error.message?.includes('bucket not found')) {
      throw new Error('Bucket simulation-files non trouvé. Contactez l\'administrateur.');
    }
    if (error.message?.includes('The resource already exists')) {
      throw new Error('Un fichier avec ce nom existe déjà. Veuillez renommer votre fichier.');
    }
    if (error.message?.includes('Invalid JWT')) {
      throw new Error('Session expirée. Veuillez vous reconnecter.');
    }
    if (error.message?.includes('new row violates row-level security policy')) {
      throw new Error('Erreur de permissions. Vérifiez que vous êtes connecté.');
    }
    
    throw error;
  }
};

const updateSimulationWithFileUrl = async (
  simulationId: string | undefined,
  userId: string,
  fileUrl: string,
  filePath: string,
  file: File
): Promise<void> => {
  if (!simulationId) return;
  
  try {
    const updateData = {
      geometry_config: {
        file_url: fileUrl,
        file_path: filePath,
        file_name: file.name,
        file_size: file.size,
        uploaded_at: new Date().toISOString(),
        file_type: file.type || 'application/octet-stream'
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
      // On ne throw pas pour ne pas gâcher l'upload réussi
    } else {
      console.log('✅ Simulation mise à jour avec fichier:', filePath);
    }
  } catch (updateError: any) {
    console.warn('⚠️ Exception mise à jour simulation:', updateError.message);
    // On ne throw pas pour ne pas gâcher l'upload réussi
  }
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
