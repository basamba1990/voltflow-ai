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
// Cela garantit que Supabase accepte le fichier quel que soit son format CAO
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

// Vérifier la session utilisateur
const ensureSession = async (maxRetries = 2): Promise<any> => {
  for (let i = 0; i <= maxRetries; i++) {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) {
        console.error(`❌ Erreur session (tentative ${i + 1}/${maxRetries + 1}):`, error);
        if (i === maxRetries) throw error;
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }
      
      if (!session?.user) {
        console.log(`⚠️ Session non trouvée (tentative ${i + 1}/${maxRetries + 1})`);
        if (i === maxRetries) throw new Error('Session expirée. Veuillez vous reconnecter.');
        await new Promise(resolve => setTimeout(resolve, 1000));
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

// Vérifier si une URL est accessible
const waitForUrlAccessibility = async (url: string, maxRetries = 3): Promise<boolean> => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(`🔍 Vérification URL (tentative ${i + 1}/${maxRetries}):`, url.substring(0, 100));
      
      const response = await fetch(url, { method: 'HEAD' });
      if (response.ok) {
        console.log(`✅ URL accessible après ${i + 1} tentative(s)`);
        return true;
      }
    } catch (error) {
      console.warn(`⚠️ URL non accessible (tentative ${i + 1}):`, error.message);
    }
    
    // Attente exponentielle avant la prochaine tentative
    await new Promise(resolve => setTimeout(resolve, 500 * (i + 1)));
  }
  
  console.warn('❌ URL non accessible après plusieurs tentatives');
  return false;
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

// 🔥 FONCTION PRINCIPALE D'UPLOAD - VERSION CORRIGÉE
export const uploadGeometry = async (params: {
  file: File;
  userId: string;
  simulationId?: string;
  geometryConfig?: any;
}): Promise<UploadGeometryResponse> => {
  try {
    console.log('🚀 ========== DÉBUT UPLOAD GÉOMÉTRIE ==========');
    console.log('📁 Fichier:', params.file.name, `(${(params.file.size / 1024 / 1024).toFixed(2)}MB)`);
    
    validateFile(params.file);

    const uploadPromise = (async () => {
      // Stratégie d'upload: Essayer geometries d'abord, puis simulation-files
      try {
        console.log('🔄 Tentative upload geometries avec URL signée...');
        return await uploadToGeometries({
          file: params.file,
          userId: params.userId,
          simulationId: params.simulationId
        });
      } catch (error1: any) {
        console.log('❌ Upload geometries échoué:', error1.message);
        
        // Fallback vers simulation-files avec URL signée
        try {
          console.log('🔄 Tentative upload simulation-files avec URL signée...');
          return await uploadToSimulationFiles({
            file: params.file,
            userId: params.userId,
            simulationId: params.simulationId
          });
        } catch (error2: any) {
          console.log('❌ Upload simulation-files échoué:', error2.message);
          
          // Dernier recours: Edge Function
          console.log('🔄 Dernier recours: Edge Function...');
          return await uploadGeometryViaEdgeFunction(params);
        }
      }
    })();

    const result = await withTimeout(
      uploadPromise,
      60000,
      '❌ UPLOAD TIMEOUT: L\'opération a pris plus de 60 secondes.'
    );
    
    console.log('✅ ========== UPLOAD RÉUSSI ==========');
    console.log('📎 URL:', result.fileUrl?.substring(0, 100) + '...');
    
    // Vérifier que l'URL est accessible avant de retourner
    console.log('🔍 Vérification accessibilité URL...');
    await waitForUrlAccessibility(result.fileUrl);
    
    return result;
    
  } catch (error: any) {
    console.error('❌ ========== UPLOAD ÉCHOUÉ ==========');
    console.error('💥 Erreur:', error.message);
    
    // Messages d'erreur spécifiques
    let userMessage = error.message;
    if (error.message?.includes('timeout')) {
      userMessage = 'Le serveur n\'a pas confirmé l\'upload. Vérifiez vos permissions ou réessayez.';
    } else if (error.message?.includes('permission') || error.message?.includes('403')) {
      userMessage = 'Permissions insuffisantes. Vérifiez votre compte.';
    } else if (error.message?.includes('storage')) {
      userMessage = 'Erreur de stockage. Contactez le support.';
    }
    
    throw new Error(userMessage);
  }
};

// Upload vers simulation-files avec URL signée
const uploadToSimulationFiles = async (
  params: { file: File; userId: string; simulationId?: string }
): Promise<UploadGeometryResponse> => {
  const session = await ensureSession();
  
  // Génération nom de fichier
  const timestamp = Date.now();
  const uniqueId = Math.random().toString(36).substring(2, 9);
  const fileExt = params.file.name.split('.').pop()?.toLowerCase() || 'vtp';
  const fileName = `geometries/${params.userId}/${timestamp}_${uniqueId}.${fileExt}`;
  
  console.log('📤 Upload simulation-files - Nom fichier:', fileName);
  
  // 🔥 CORRECTION: Forcer application/octet-stream
  const contentType = 'application/octet-stream';
  console.log('📄 Type MIME forcé:', contentType);
  
  // Upload vers simulation-files
  console.log('⏳ Upload vers Supabase Storage (bucket: simulation-files)...');
  const uploadPromise = supabase.storage
    .from('simulation-files')
    .upload(fileName, params.file, {
      cacheControl: '3600',
      upsert: false,
      contentType: contentType
    });
  
  const { data: uploadData, error: uploadError } = await withTimeout(
    uploadPromise,
    30000,
    '❌ Supabase Storage upload timeout (30s)'
  );
  
  if (uploadError) {
    console.error('❌ Erreur Supabase Storage simulation-files:', uploadError);
    
    if (uploadError.message?.includes('415')) {
      console.error('🎭 ERREUR 415: Type MIME non supporté dans simulation-files');
      throw new Error('Type de fichier non supporté. Essayez de convertir en STL.');
    }
    
    throw uploadError;
  }
  
  console.log('✅ Fichier uploadé, génération URL signée...');
  
  // URL signée (plus fiable que l'URL publique)
  const signedUrlPromise = supabase.storage
    .from('simulation-files')
    .createSignedUrl(fileName, 3600); // 1 heure
  
  const { data: signedData, error: signedError } = await withTimeout(
    signedUrlPromise,
    10000,
    '❌ Génération URL signée timeout'
  );
  
  if (signedError) {
    console.error('❌ Erreur génération URL signée:', signedError);
    throw new Error(`Impossible de générer URL sécurisée: ${signedError.message}`);
  }
  
  if (!signedData?.signedUrl) {
    throw new Error('Impossible de générer URL signée');
  }
  
  console.log('✅ URL signée générée');
  
  // Mise à jour simulation
  await updateSimulationWithFileUrl(params.simulationId, params.userId, signedData.signedUrl, fileName, params.file);
  
  return {
    success: true,
    fileUrl: signedData.signedUrl,
    fileName: params.file.name,
    fileSize: params.file.size,
    fileType: contentType,
    path: fileName
  };
};

// Upload vers geometries avec URL signée
const uploadToGeometries = async (
  params: { file: File; userId: string; simulationId?: string }
): Promise<UploadGeometryResponse> => {
  const session = await ensureSession();
  
  const timestamp = Date.now();
  const uniqueId = Math.random().toString(36).substring(2, 9);
  const fileExt = params.file.name.split('.').pop()?.toLowerCase() || 'vtp';
  const fileName = `${params.userId}/${timestamp}_${uniqueId}.${fileExt}`;
  
  console.log('📤 Upload geometries - Nom fichier:', fileName);
  
  // 🔥 CORRECTION: Forcer application/octet-stream
  const contentType = 'application/octet-stream';
  
  // Upload vers geometries (bucket avec RLS)
  console.log('⏳ Upload vers Supabase Storage (bucket: geometries)...');
  const uploadPromise = supabase.storage
    .from('geometries')
    .upload(fileName, params.file, {
      cacheControl: '3600',
      upsert: false,
      contentType: contentType
    });
  
  const { data: uploadData, error: uploadError } = await withTimeout(
    uploadPromise,
    30000,
    '❌ Supabase Storage upload timeout (30s)'
  );
  
  if (uploadError) {
    console.error('❌ Erreur Supabase Storage geometries:', uploadError);
    
    // Messages d'erreur spécifiques
    if (uploadError.message?.includes('row-level security') || uploadError.message?.includes('403')) {
      console.error('🔒 ERREUR RLS: Vérifiez vos politiques RLS dans Supabase Dashboard');
      throw new Error('Permissions insuffisantes. Contactez l\'administrateur.');
    }
    
    if (uploadError.message?.includes('415')) {
      console.error('🎭 ERREUR 415: Type MIME non supporté dans geometries');
      throw new Error('Type de fichier non supporté. Essayez un format différent.');
    }
    
    throw uploadError;
  }
  
  console.log('✅ Fichier uploadé, génération URL signée...');
  
  // URL signée (pour bucket avec RLS)
  const signedUrlPromise = supabase.storage
    .from('geometries')
    .createSignedUrl(fileName, 31536000); // 1 an en secondes
  
  const { data: signedData, error: signedError } = await withTimeout(
    signedUrlPromise,
    10000,
    '❌ Génération URL signée timeout'
  );
  
  if (signedError) {
    throw new Error(`Erreur génération URL signée: ${signedError.message}`);
  }
  
  if (!signedData?.signedUrl) {
    throw new Error('Impossible de générer URL signée');
  }
  
  console.log('✅ URL signée générée');
  
  // Mise à jour simulation
  await updateSimulationWithFileUrl(params.simulationId, params.userId, signedData.signedUrl, fileName, params.file);
  
  return {
    success: true,
    fileUrl: signedData.signedUrl,
    fileName: params.file.name,
    fileSize: params.file.size,
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
    
    await supabase
      .from('simulations')
      .update({
        geometry_config: {
          file_url: fileUrl,
          file_path: filePath,
          file_name: file.name,
          file_size: file.size,
          uploaded_at: new Date().toISOString()
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', simulationId)
      .eq('user_id', userId);
    
    console.log('✅ Simulation mise à jour');
  } catch (updateError: any) {
    console.warn('⚠️ Échec mise à jour simulation (non critique):', updateError.message);
    // Ne pas échouer l'upload à cause de cette erreur
  }
};

// Edge Function fallback
const uploadGeometryViaEdgeFunction = async (
  params: { file: File; userId: string; simulationId?: string; geometryConfig?: any }
): Promise<UploadGeometryResponse> => {
  console.log('🔄 Utilisation Edge Function fallback...');
  
  const session = await ensureSession();
  
  console.log('🔄 Conversion en base64...');
  const arrayBuffer = await params.file.arrayBuffer();
  const fileData = arrayBufferToBase64(arrayBuffer);
  
  console.log('🔄 Appel Edge Function upload-geometry...');
  
  const edgeFunctionPromise = supabase.functions.invoke('upload-geometry', {
    body: {
      fileName: params.file.name,
      fileData: fileData,
      file_type: 'application/octet-stream', // Type générique
      userId: params.userId,
      simulationId: params.simulationId,
      geometry_config: params.geometryConfig || {}
    },
    headers: {
      'Authorization': `Bearer ${session.access_token}`
    }
  });
  
  const { data, error } = await withTimeout(
    edgeFunctionPromise,
    45000,
    '❌ Edge Function timeout'
  );
  
  if (error) {
    console.error('❌ Edge Function error:', error);
    throw error;
  }
  
  if (!data?.success) {
    console.error('❌ Edge Function returned error:', data?.error);
    throw new Error(data?.error || 'Échec Edge Function');
  }
  
  console.log('✅ Edge Function réussie');
  
  return {
    success: true,
    fileUrl: data.fileUrl,
    fileName: params.file.name,
    fileSize: params.file.size,
    fileType: 'application/octet-stream',
    path: data.path
  };
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
