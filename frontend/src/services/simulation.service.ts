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

// Content-Type permissif
const getContentTypeForFile = (fileName: string, detectedType: string): string => {
  const ext = fileName.toLowerCase().split('.').pop();
  console.log('📄 Détection Content-Type:', fileName, 'ext:', ext, 'detected:', detectedType);
  
  // Priorité aux types génériques pour éviter les erreurs 415
  const typeMap: Record<string, string> = {
    'stl': 'application/sla',
    'step': 'application/octet-stream',
    'stp': 'application/octet-stream',
    'obj': 'text/plain',
    'vtp': 'application/xml',
    'vti': 'application/xml',
    'xml': 'application/xml',
    'vtu': 'application/xml',
    'iges': 'application/octet-stream',
    'igs': 'application/octet-stream',
    'ply': 'text/plain',
    'vtk': 'text/plain'
  };
  
  const contentType = typeMap[ext || ''] || 'application/octet-stream';
  console.log('📄 Content-Type choisi:', contentType);
  return contentType;
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

// Fonction pour vérifier la session utilisateur avec retry
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

// -----------------------------------------------------------------------------
// FONCTIONS EXPORTÉES (EXPORTS NOMÉS)
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

    // Mapping Mesh Density (Front) -> Elements (Fortran) pour Artemis
    const meshMap: Record<string, number> = { low: 500, medium: 1000, high: 5000 };
    const mesh_elements = meshMap[simulation.mesh_density] || 1000;

    console.log('🚀 Démarrage simulation via Edge Function...');
    
    // 🔥 TIMEOUT de 65 secondes pour l'Edge Function (compatible avec le backend 55s)
    const simulationPromise = supabase.functions.invoke('simulate', {
      body: {
        simulation_id: simulationId,
        config: {
          ...simulation,
          mesh_elements
        },
        user_id: session.user.id,
        timestamp: new Date().toISOString()
      }
    });

    const { data, error } = await withTimeout(
      simulationPromise,
      65000,
      'La simulation a dépassé le temps d\'attente maximum (65 secondes)'
    );

    if (error) throw error;

    return {
      success: true,
      simulation_id: simulationId,
      status: 'running',
      message: 'Simulation lancée avec succès'
    };
  } catch (error: any) {
    console.error('❌ startSimulation error:', error);
    
    // Mettre à jour le statut d'erreur
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

// -----------------------------------------------------------------------------
// UPLOAD GÉOMÉTRIE – STRATÉGIE DOUBLE AVEC TIMEOUTS
// -----------------------------------------------------------------------------
export const uploadGeometry = async (
  params: { file: File; userId: string; simulationId?: string; geometryConfig?: any }
): Promise<UploadGeometryResponse> => {
  console.log('🚀 ========== DÉBUT UPLOAD ==========');
  console.log('📁 Fichier:', params.file.name, params.file.size, 'bytes');
  console.log('👤 User ID:', params.userId);
  console.log('🎮 Simulation ID:', params.simulationId);
  
  try {
    // 1. Validation
    validateFile(params.file);
    
    // 2. Vérification session avec diagnostics
    console.log('🔐 Vérification session...');
    const session = await ensureSession();
    
    if (session.user.id !== params.userId) {
      console.warn('⚠️ ID utilisateur mismatch:', session.user.id, 'vs', params.userId);
    }
    
    // 3. Upload avec fallback
    console.log('🔄 Début upload...');
    
    const uploadPromise = (async () => {
      try {
        console.log('🔄 Tentative upload direct...');
        return await uploadGeometryDirect({
          file: params.file,
          userId: params.userId,
          simulationId: params.simulationId
        });
      } catch (directError: any) {
        console.log('❌ Upload direct échoué:', directError.message);
        
        // Si c'est une erreur 415 (MIME type), on utilise un type générique
        if (directError.message?.includes('415') || directError.message?.includes('Unsupported Media Type')) {
          console.log('🔄 Retry avec type générique...');
          try {
            return await uploadGeometryDirectWithGenericType({
              file: params.file,
              userId: params.userId,
              simulationId: params.simulationId
            });
          } catch (retryError) {
            console.log('❌ Retry échoué, tentative Edge Function...');
            return await uploadGeometryViaEdgeFunction(params);
          }
        }
        
        console.log('🔄 Tentative Edge Function...');
        return await uploadGeometryViaEdgeFunction(params);
      }
    })();

    const result = await withTimeout(
      uploadPromise,
      60000,
      '❌ UPLOAD TIMEOUT: L\'opération a pris plus de 60 secondes. Vérifiez votre connexion.'
    );
    
    console.log('✅ ========== UPLOAD RÉUSSI ==========');
    console.log('📎 URL:', result.fileUrl?.substring(0, 100) + '...');
    console.log('📊 Taille:', result.fileSize, 'bytes');
    
    return result;
    
  } catch (error: any) {
    console.error('❌ ========== UPLOAD ÉCHOUÉ ==========');
    console.error('💥 Erreur:', error.message);
    console.error('🔧 Stack:', error.stack);
    throw error;
  }
};

// Upload direct avec diagnostics
const uploadGeometryDirect = async (
  params: { file: File; userId: string; simulationId?: string }
): Promise<UploadGeometryResponse> => {
  const session = await ensureSession();
  
  // Génération nom de fichier
  const timestamp = Date.now();
  const uniqueId = Math.random().toString(36).substring(2, 9);
  const fileExt = params.file.name.split('.').pop()?.toLowerCase() || 'vtp';
  const fileName = `${params.userId}/${timestamp}_${uniqueId}.${fileExt}`;
  
  console.log('📤 Upload direct - Nom fichier:', fileName);
  
  // Content-Type
  const contentType = getContentTypeForFile(params.file.name, params.file.type);
  
  // Upload
  console.log('⏳ Upload vers Supabase Storage...');
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
    console.error('❌ Erreur Supabase Storage:', uploadError);
    
    // Messages d'erreur explicites
    if (uploadError.message?.includes('row-level security') || uploadError.message?.includes('403')) {
      console.error('🔒 ERREUR RLS: Vérifiez vos politiques dans Supabase Dashboard → Storage → geometries');
      console.error('🔒 Créez cette politique SQL:');
      console.error(`
        CREATE POLICY "Users can upload geometries"
        ON storage.objects FOR INSERT
        TO authenticated
        WITH CHECK (
          bucket_id = 'geometries' 
          AND (storage.foldername(name))[1] = auth.uid()::text
        );
      `);
      throw new Error('Permissions insuffisantes. Contactez l\'administrateur pour configurer les politiques RLS.');
    }
    
    if (uploadError.message?.includes('415')) {
      console.error('🎭 ERREUR 415: Type MIME non supporté');
      console.error('🎭 Type envoyé:', contentType);
      throw new Error('Type de fichier non supporté par le serveur.');
    }
    
    throw uploadError;
  }
  
  console.log('✅ Fichier uploadé, génération URL...');
  
  // URL signée
  const signedUrlPromise = supabase.storage
    .from('geometries')
    .createSignedUrl(fileName, 31536000);
  
  const { data: signedData } = await withTimeout(
    signedUrlPromise,
    10000,
    '❌ Génération URL timeout'
  );
  
  if (!signedData?.signedUrl) {
    throw new Error('Impossible de générer URL signée');
  }
  
  // Mise à jour simulation
  if (params.simulationId) {
    try {
      console.log('🔄 Mise à jour simulation...');
      await supabase
        .from('simulations')
        .update({
          geometry_config: {
            file_url: signedData.signedUrl,
            file_path: fileName,
            file_name: params.file.name,
            file_size: params.file.size,
            uploaded_at: new Date().toISOString()
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', params.simulationId)
        .eq('user_id', params.userId);
      console.log('✅ Simulation mise à jour');
    } catch (updateError: any) {
      console.warn('⚠️ Échec mise à jour simulation:', updateError.message);
    }
  }
  
  return {
    success: true,
    fileUrl: signedData.signedUrl,
    fileName: params.file.name,
    fileSize: params.file.size,
    fileType: params.file.type,
    path: fileName
  };
};

// Upload avec type générique (fallback pour erreur 415)
const uploadGeometryDirectWithGenericType = async (
  params: { file: File; userId: string; simulationId?: string }
): Promise<UploadGeometryResponse> => {
  const session = await ensureSession();
  
  const timestamp = Date.now();
  const uniqueId = Math.random().toString(36).substring(2, 9);
  const fileExt = params.file.name.split('.').pop()?.toLowerCase() || 'vtp';
  const fileName = `${params.userId}/${timestamp}_${uniqueId}.${fileExt}`;
  
  console.log('📤 Upload avec type générique - Nom fichier:', fileName);
  
  // FORCER application/octet-stream (type générique)
  const contentType = 'application/octet-stream';
  console.log('📄 Type générique forcé:', contentType);
  
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
    '❌ Upload type générique timeout'
  );
  
  if (uploadError) throw uploadError;
  
  // URL signée
  const { data: signedData } = await supabase.storage
    .from('geometries')
    .createSignedUrl(fileName, 31536000);
  
  if (!signedData?.signedUrl) {
    throw new Error('Impossible de générer URL signée');
  }
  
  return {
    success: true,
    fileUrl: signedData.signedUrl,
    fileName: params.file.name,
    fileSize: params.file.size,
    fileType: 'application/octet-stream',
    path: fileName
  };
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
      file_type: params.file.type,
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
    fileType: params.file.type,
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

// Test direct de l'upload
export const testUpload = async (file: File, userId: string): Promise<UploadGeometryResponse> => {
  console.log('🧪 Test upload...');
  return uploadGeometry({ file, userId });
};

// Export du service par défaut (compatibilité avec le code existant)
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
