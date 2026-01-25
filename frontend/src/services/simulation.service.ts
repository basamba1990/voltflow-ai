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

export interface UploadGeometryResponse {
  success: boolean;
  fileUrl: string;
  fileName: string;
  fileSize?: number;
  path?: string;
}

// -----------------------------------------------------------------------------
// FONCTIONS UTILITAIRES
// -----------------------------------------------------------------------------

const validateFile = (file: File): void => {
  const maxSize = 50 * 1024 * 1024;
  if (file.size > maxSize) {
    throw new Error(`Fichier trop volumineux. Maximum: ${maxSize / (1024 * 1024)} MB`);
  }
  
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
// MÉTHODE UPLOAD PRINCIPALE - CORRIGÉE
// -----------------------------------------------------------------------------

export const uploadGeometry = async (
  params: { file: File; userId: string; simulationId?: string }
): Promise<UploadGeometryResponse> => {
  console.log('🚀 UPLOAD START:', params.file.name);
  
  try {
    // 1. VALIDATION
    validateFile(params.file);
    
    // 2. VÉRIFICATION SESSION
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.user) {
      throw new Error('Session expirée. Reconnectez-vous.');
    }
    
    console.log('✅ User ID:', session.user.id, 'JWT présent');
    
    // 3. GÉNÉRATION DU CHEMIN
    const timestamp = Date.now();
    const uniqueId = Math.random().toString(36).substring(2, 9);
    const fileExt = params.file.name.split('.').pop() || 'vtp';
    const filePath = `${params.userId}/${timestamp}_${uniqueId}.${fileExt}`;
    
    console.log('📁 File path:', filePath);
    
    // 4. UPLOAD DIRECT VERS STORAGE (Méthode principale)
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('geometries')
      .upload(filePath, params.file, {
        cacheControl: '3600',
        upsert: false,
        contentType: 'application/octet-stream'
      });
    
    // 5. GESTION ERREUR UPLOAD
    if (uploadError) {
      console.error('❌ STORAGE UPLOAD ERROR:', uploadError);
      
      if (uploadError.message?.includes('row-level security') || uploadError.message?.includes('403')) {
        throw new Error('ERREUR RLS. Vérifiez vos politiques dans Supabase → Storage → geometries → Policies');
      }
      
      if (uploadError.message?.includes('Duplicate')) {
        throw new Error('Fichier déjà existant. Renommez votre fichier.');
      }
      
      throw new Error(`Échec upload: ${uploadError.message}`);
    }
    
    if (!uploadData?.path) {
      throw new Error('Aucun chemin retourné après upload');
    }
    
    console.log('✅ Storage upload réussi:', uploadData.path);
    
    // 6. GÉNÉRATION URL SIGNÉE
    const { data: signedUrlData, error: signedError } = await supabase.storage
      .from('geometries')
      .createSignedUrl(uploadData.path, 31536000); // 1 an
    
    if (signedError || !signedUrlData?.signedUrl) {
      console.warn('⚠️ Impossible de générer URL signée, utilisation URL publique');
      
      // Fallback: URL publique
      const { data: publicUrlData } = supabase.storage
        .from('geometries')
        .getPublicUrl(uploadData.path);
      
      if (!publicUrlData?.publicUrl) {
        throw new Error('Impossible de générer URL pour le fichier');
      }
      
      console.log('✅ URL publique générée');
      
      return {
        success: true,
        fileUrl: publicUrlData.publicUrl,
        fileName: params.file.name,
        fileSize: params.file.size,
        path: uploadData.path
      };
    }
    
    console.log('✅ URL signée générée');
    
    // 7. MISE À JOUR SIMULATION (optionnel)
    if (params.simulationId) {
      try {
        const { error: updateError } = await supabase
          .from('simulations')
          .update({
            geometry_config: {
              file_url: signedUrlData.signedUrl,
              file_path: uploadData.path,
              file_name: params.file.name,
              file_size: params.file.size,
              uploaded_at: new Date().toISOString()
            }
          })
          .eq('id', params.simulationId)
          .eq('user_id', params.userId);
        
        if (updateError) {
          console.warn('⚠️ Mise à jour simulation échouée:', updateError.message);
        } else {
          console.log('✅ Simulation mise à jour');
        }
      } catch (updateErr) {
        console.warn('⚠️ Erreur lors de la mise à jour simulation:', updateErr);
      }
    }
    
    // 8. RÉPONSE SUCCÈS
    return {
      success: true,
      fileUrl: signedUrlData.signedUrl,
      fileName: params.file.name,
      fileSize: params.file.size,
      path: uploadData.path
    };
    
  } catch (error: any) {
    console.error('❌ UPLOAD CRITICAL ERROR:', error);
    
    // Messages d'erreur clairs
    let userMessage = error.message || 'Erreur inconnue';
    
    if (error.message?.includes('RLS')) {
      userMessage = 'Erreur de sécurité. Vérifiez vos politiques RLS dans Supabase.';
    } else if (error.message?.includes('network')) {
      userMessage = 'Erreur réseau. Vérifiez votre connexion internet.';
    } else if (error.message?.includes('format')) {
      userMessage = 'Format de fichier non supporté. Utilisez STL, STEP, VTP, etc.';
    }
    
    throw new Error(userMessage);
  }
};

// -----------------------------------------------------------------------------
// AUTRES FONCTIONS (simplifiées)
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

export const createSimulation = async (params: any): Promise<Simulation> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Authentification requise');

    const newSimulation = {
      user_id: session.user.id,
      name: params.name?.trim() || 'Nouvelle simulation',
      description: params.description?.trim() || null,
      geometry_type: 'complex',
      geometry_config: params.geometryConfig || {},
      boundary_conditions: params.boundaryConditions || {},
      material_id: params.materialId || '',
      mesh_density: params.meshDensity || 'medium',
      solver_type: params.solverType || 'fem_fortran',
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
  params: any
): Promise<Simulation> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Authentification requise');

    const updateData: any = {};
    if (params.name !== undefined) updateData.name = params.name.trim();
    if (params.description !== undefined) updateData.description = params.description?.trim() || null;
    
    if (params.geometryConfig) {
      updateData.geometry_config = params.geometryConfig;
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

export const startSimulation = async (simulationId: string): Promise<any> => {
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

    if (error) throw error;

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

// Export du service
export const SimulationService = {
  getSimulations,
  getSimulationById,
  createSimulation,
  updateSimulation,
  startSimulation,
  uploadGeometry,
  deleteSimulation
};

export default SimulationService;
