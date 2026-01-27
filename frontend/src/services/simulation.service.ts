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
// FONCTIONS UTILITAIRES AVEC DIAGNOSTICS
// -----------------------------------------------------------------------------

const arrayBufferToBase64 = (arrayBuffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

// VALIDATION SIMPLIFIÉE - UNIQUEMENT EXTENSION
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
// UPLOAD GÉOMÉTRIE - VERSION DIAGNOSTIQUÉE
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

// ... (les autres fonctions restent inchangées) ...

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
