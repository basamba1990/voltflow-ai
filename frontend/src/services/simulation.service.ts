// src/services/simulation.service.ts
import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

// -----------------------------------------------------------------------------
// TYPES - Exports de types
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
    '.iges', '.igs', '.xml', '.vtu'
  ];
  
  const fileExt = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
  if (!validExtensions.includes(fileExt)) {
    throw new Error(`Extension non supportée: ${fileExt}. Formats acceptés: ${validExtensions.join(', ')}`);
  }
  
  console.log('✅ Fichier validé');
};

// 🔥 CORRECTION CRITIQUE: Forcer application/octet-stream pour tous les fichiers
const getSafeContentType = (fileName: string): string => {
  console.log('🔒 Forçage Type MIME universel pour:', fileName, '→ application/octet-stream');
  return 'application/octet-stream';
};

// Fonction timeout
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

export const startSimulation = async (simulationId: string): Promise<StartSimulationResponse> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Authentification requise');

    const { data, error } = await supabase.functions.invoke('start-simulation', {
      body: { simulationId },
      headers: {
        'Authorization': `Bearer ${session.access_token}`
      }
    });

    if (error) throw error;

    return data as StartSimulationResponse;
  } catch (error: any) {
    console.error('❌ startSimulation error:', error);
    throw error;
  }
};

// 🔥 FONCTION PRINCIPALE D'UPLOAD - VERSION SIMPLIFIÉE ET CORRIGÉE
export const uploadGeometry = async (
  params: { file: File; userId: string; simulationId?: string; geometryConfig?: any }
): Promise<UploadGeometryResponse> => {
  console.log('🚀 ========== DÉBUT UPLOAD GÉOMÉTRIE ==========');
  console.log('📁 Fichier:', params.file.name, `(${(params.file.size / 1024 / 1024).toFixed(2)}MB)`);
  
  try {
    // 1. Validation
    validateFile(params.file);

    // 2. Vérification session
    const session = await ensureSession();
    console.log('✅ Session vérifiée, utilisateur:', session.user.id);

    // 3. Upload DIRECT vers simulation-files (bucket public)
    // 🔥 STRATÉGIE SIMPLIFIÉE: Uniquement simulation-files public
    const result = await uploadToSimulationFilesSimple({
      file: params.file,
      userId: params.userId,
      simulationId: params.simulationId,
      session: session
    });
    
    console.log('✅ ========== UPLOAD RÉUSSI ==========');
    console.log('📎 URL:', result.fileUrl?.substring(0, 100) + '...');
    
    return result;
    
  } catch (error: any) {
    console.error('❌ ========== UPLOAD ÉCHOUÉ ==========');
    console.error('💥 Erreur détaillée:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint
    });
    
    // Messages d'erreur spécifiques
    let userMessage = error.message;
    
    if (error.message?.includes('415') || error.message?.includes('MIME')) {
      userMessage = "Type de fichier non supporté par le serveur. Contactez l'admin pour autoriser ce format.";
    } else if (error.message?.includes('403') || error.message?.includes('permission')) {
      userMessage = "Erreur de permissions Supabase. Vérifiez les politiques RLS.";
    } else if (error.message?.includes('timeout')) {
      userMessage = "Le serveur n'a pas confirmé l'upload. Vérifiez vos permissions ou réessayez.";
    } else if (error.message?.includes('storage') || error.message?.includes('bucket')) {
      userMessage = "Erreur de stockage. Le bucket 'simulation-files' n'est peut-être pas accessible.";
    }
    
    throw new Error(userMessage);
  }
};

// 🔥 UPLOAD SIMPLIFIÉ vers simulation-files (public)
const uploadToSimulationFilesSimple = async (
  params: { file: File; userId: string; simulationId?: string; session: any }
): Promise<UploadGeometryResponse> => {
  const { file, userId, simulationId, session } = params;
  
  // Vérifier que l'ID utilisateur correspond
  if (session.user.id !== userId) {
    console.warn('⚠️ ID utilisateur mismatch:', session.user.id, 'vs', userId);
  }
  
  // 🔥 GÉNÉRATION NOM DE FICHIER SIMPLE
  const timestamp = Date.now();
  const uniqueId = Math.random().toString(36).substring(2, 9);
  const fileExt = file.name.split('.').pop()?.toLowerCase() || 'vtp';
  const fileName = `${userId}/${timestamp}_${uniqueId}.${fileExt}`;
  
  console.log('📤 Upload simulation-files - Nom fichier:', fileName);
  
  // 🔥 FORCER application/octet-stream
  const contentType = 'application/octet-stream';
  console.log('📄 Content-Type:', contentType);
  
  // 🔥 UPLOAD DIRECT (30s timeout)
  console.log('⏳ Upload vers Supabase Storage (bucket: simulation-files)...');
  
  const uploadPromise = supabase.storage
    .from('simulation-files')
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: contentType
    });
  
  const { data: uploadData, error: uploadError } = await withTimeout(
    uploadPromise,
    30000, // 30 secondes
    '❌ Supabase Storage upload timeout (30s)'
  );
  
  if (uploadError) {
    console.error('❌ Erreur upload simulation-files:', {
      message: uploadError.message,
      code: uploadError.code,
      statusCode: uploadError.statusCode
    });
    
    // 🔥 ERREUR 415: Type MIME non supporté
    if (uploadError.message?.includes('415') || uploadError.statusCode === 415) {
      throw new Error('Type de fichier non supporté. Essayez de convertir en STL ou VTK.');
    }
    
    // 🔥 ERREUR 403: Permissions
    if (uploadError.message?.includes('403') || uploadError.statusCode === 403) {
      throw new Error('Permissions insuffisantes. Vérifiez les politiques du bucket simulation-files.');
    }
    
    throw uploadError;
  }
  
  console.log('✅ Fichier uploadé, génération URL publique...');
  
  // 🔥 URL PUBLIQUE (bucket simulation-files est public)
  const { data: publicUrlData } = supabase.storage
    .from('simulation-files')
    .getPublicUrl(fileName);
  
  if (!publicUrlData?.publicUrl) {
    throw new Error('Impossible de générer URL publique pour le fichier');
  }
  
  console.log('✅ URL publique générée:', publicUrlData.publicUrl.substring(0, 100) + '...');
  
  // 🔥 MISE À JOUR SIMULATION
  await updateSimulationWithFileUrl(simulationId, userId, publicUrlData.publicUrl, fileName, file);
  
  return {
    success: true,
    fileUrl: publicUrlData.publicUrl,
    fileName: file.name,
    fileSize: file.size,
    fileType: contentType,
    path: fileName
  };
};

// Mettre à jour la simulation avec l'URL du fichier
const updateSimulationWithFileUrl = async (
  simulationId: string | undefined,
  userId: string,
  fileUrl: string,
  filePath: string,
  file: File
): Promise<void> => {
  if (!simulationId) {
    console.log('ℹ️ Pas de simulation ID, skip mise à jour');
    return;
  }
  
  try {
    console.log('🔄 Mise à jour simulation:', simulationId);
    
    const updateData = {
      geometry_config: {
        file_url: fileUrl,
        file_path: filePath,
        file_name: file.name,
        file_size: file.size,
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
      return;
    }
    
    console.log('✅ Simulation mise à jour');
  } catch (updateError: any) {
    console.warn('⚠️ Exception mise à jour simulation:', updateError.message);
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
    .subscribe();

  return channel;
};

export const unsubscribeFromChannel = (channel: any) => {
  if (channel) supabase.removeChannel(channel);
};

export const testUpload = async (file: File, userId: string): Promise<UploadGeometryResponse> => {
  console.log('🧪 Test upload...');
  return uploadGeometry({ file, userId });
};

// Export du service
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
