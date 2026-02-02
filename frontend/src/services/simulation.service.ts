import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

// -----------------------------------------------------------------------------
// TYPES MIS À JOUR POUR MATERIALS TEXT IDS
// -----------------------------------------------------------------------------
export type Simulation = Database['public']['Tables']['simulations']['Row'] & {
  simulation_results?: Database['public']['Tables']['simulation_results']['Row'][];
  materials?: Database['public']['Tables']['materials']['Row'];
};

export type SimulationStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type MeshDensity = 'low' | 'medium' | 'high';
export type CoolingType = 'natural_convection' | 'forced_convection' | 'radiation';
export type FluidType = 'air' | 'water' | 'oil';

// Interface pour les matériaux (IDs TEXT)
export interface Material {
  id: string;  // TEXT IDs: 'aluminum-6061', 'copper', etc.
  name: string;
  category?: string;
  thermal_conductivity?: number;
  specific_heat?: number;
  density?: number;
  melting_point?: number;
  color_hex?: string;
  is_public?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface SimulationConfig {
  geometry_config: {
    type: string;
    file_url?: string;
    file_name?: string;
    file_path?: string;
    file_size?: number;
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
  material_id: string;  // TEXT ID comme 'aluminum-6061'
  mesh_density: MeshDensity;
  solver_type?: string;
}

export interface StartSimulationResponse {
  success: boolean;
  simulation_id: string;
  status: SimulationStatus;
  results?: any;
  message?: string;
  error?: string;
}

export interface UploadGeometryResponse {
  success: boolean;
  fileUrl: string;
  fileName: string;
  fileSize?: number;
  path?: string;
  error?: string;
}

// Liste des IDs matériaux valides (pour validation)
export const VALID_MATERIAL_IDS = [
  'aluminum-6061',
  'copper',
  'stainless-steel-304',
  'titanium-grade-2',
  'silicon-carbide',
  'polycarbonate',
  'carbon-fiber-composite'
] as const;

export type MaterialId = typeof VALID_MATERIAL_IDS[number];

// -----------------------------------------------------------------------------
// FONCTIONS POUR MATERIALS
// -----------------------------------------------------------------------------

// Récupérer tous les matériaux disponibles
export const getMaterials = async (): Promise<Material[]> => {
  try {
    const { data, error } = await supabase
      .from('materials')
      .select('*')
      .order('name');
    
    if (error) {
      console.error('[SimulationService] Erreur récupération matériaux:', error);
      throw error;
    }
    
    return data as Material[];
  } catch (error) {
    console.error('[SimulationService] Échec récupération matériaux:', error);
    // Retourner une liste par défaut si la table n'existe pas encore
    return [
      { id: 'aluminum-6061', name: 'Aluminum 6061', category: 'metal' },
      { id: 'copper', name: 'Copper', category: 'metal' },
      { id: 'stainless-steel-304', name: 'Stainless Steel 304', category: 'metal' }
    ];
  }
};

// Récupérer un matériau par son ID
export const getMaterialById = async (id: string): Promise<Material | null> => {
  try {
    const { data, error } = await supabase
      .from('materials')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      console.warn(`[SimulationService] Matériau ${id} non trouvé:`, error);
      return null;
    }
    
    return data as Material;
  } catch (error) {
    console.warn(`[SimulationService] Erreur récupération matériau ${id}:`, error);
    return null;
  }
};

// Valider un ID de matériau
export const validateMaterialId = (materialId: string): boolean => {
  return VALID_MATERIAL_IDS.includes(materialId as MaterialId);
};

// Obtenir le matériau par défaut
export const getDefaultMaterial = (): MaterialId => {
  return 'aluminum-6061';
};

// -----------------------------------------------------------------------------
// FONCTIONS PRINCIPALES CORRIGÉES
// -----------------------------------------------------------------------------

// ✅ Récupérer les simulations avec les matériaux
export const getSimulations = async () => {
  try {
    const { data, error } = await supabase
      .from('simulations')
      .select(`
        *,
        simulation_results (*),
        materials (*)
      `)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[SimulationService] Erreur récupération simulations:', error);
      throw error;
    }
    
    return data as Simulation[];
  } catch (error) {
    console.error('[SimulationService] Échec récupération simulations:', error);
    throw error;
  }
};

// ✅ Récupérer une simulation par ID avec son matériau
export const getSimulationById = async (id: string) => {
  if (!id || id === 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa') {
    throw new Error('ID de simulation invalide');
  }

  try {
    const { data, error } = await supabase
      .from('simulations')
      .select(`
        *,
        simulation_results (*),
        materials (*)
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error(`[SimulationService] Simulation ${id} non trouvée:`, error);
      throw error;
    }
    
    return data as Simulation;
  } catch (error) {
    console.error(`[SimulationService] Erreur récupération simulation ${id}:`, error);
    throw error;
  }
};

// ✅ Créer une simulation avec vérification du matériau
export const createSimulation = async (params: { 
  name: string; 
  description?: string; 
  geometryType: string; 
  config: SimulationConfig 
}) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Authentification requise');

    // Valider l'ID du matériau
    if (!validateMaterialId(params.config.material_id)) {
      console.warn(`[SimulationService] ID matériau invalide: ${params.config.material_id}, utilisation par défaut`);
      params.config.material_id = getDefaultMaterial();
    }

    // Vérifier que le matériau existe dans la base
    const material = await getMaterialById(params.config.material_id);
    if (!material) {
      console.warn(`[SimulationService] Matériau ${params.config.material_id} non trouvé dans DB, utilisation quand même`);
    }

    const { data, error } = await supabase
      .from('simulations')
      .insert({
        user_id: session.user.id,
        name: params.name.substring(0, 100),
        description: params.description?.substring(0, 500) || null,
        geometry_type: params.geometryType,
        geometry_config: params.config.geometry_config || {},
        boundary_conditions: params.config.boundary_conditions || {
          initial_temp: 1000,
          ambient_temp: 25,
          cooling_type: 'natural_convection',
          convection_coeff: 80,
          fluid_type: 'air',
          fluid_velocity: 0
        },
        material_id: params.config.material_id,
        mesh_density: params.config.mesh_density || 'medium',
        solver_type: params.config.solver_type || 'fem_fortran',
        status: 'pending',
        progress: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('[SimulationService] Erreur création simulation:', error);
      throw error;
    }
    
    console.log(`[SimulationService] Simulation créée: ${data.id}`);
    return data;
  } catch (error: any) {
    console.error('[SimulationService] Échec création simulation:', error);
    throw error;
  }
};

// ✅ Mettre à jour une simulation
export const updateSimulation = async (id: string, params: { 
  name: string; 
  description?: string; 
  geometryType: string; 
  config: SimulationConfig;
}) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Authentification requise');

    // Valider l'ID du matériau si fourni
    if (params.config.material_id && !validateMaterialId(params.config.material_id)) {
      console.warn(`[SimulationService] ID matériau invalide: ${params.config.material_id}, conservation ancienne valeur`);
      // Récupérer l'ancienne valeur
      const { data: oldSim } = await supabase
        .from('simulations')
        .select('material_id')
        .eq('id', id)
        .single();
      params.config.material_id = oldSim?.material_id || getDefaultMaterial();
    }

    const { data, error } = await supabase
      .from('simulations')
      .update({
        name: params.name,
        description: params.description || null,
        geometry_type: params.geometryType,
        geometry_config: params.config.geometry_config || {},
        boundary_conditions: params.config.boundary_conditions || {},
        material_id: params.config.material_id,
        mesh_density: params.config.mesh_density || 'medium',
        solver_type: params.config.solver_type || 'fem_fortran',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('user_id', session.user.id)
      .select()
      .single();

    if (error) {
      console.error(`[SimulationService] Erreur mise à jour simulation ${id}:`, error);
      throw error;
    }
    
    return data;
  } catch (error: any) {
    console.error(`[SimulationService] Échec mise à jour simulation ${id}:`, error);
    throw error;
  }
};

// ✅ Lancer une simulation - VERSION CORRIGÉE FINALE
export const startSimulation = async (simulationId: string): Promise<StartSimulationResponse> => {
  try {
    console.log(`[SimulationService] Démarrage simulation: ${simulationId}`);

    // Validation de base
    if (!simulationId || simulationId === 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa') {
      throw new Error('ID de simulation invalide. Veuillez créer une simulation valide.');
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      throw new Error('Authentification requise. Veuillez vous connecter.');
    }

    // Vérifier que la simulation existe et appartient à l'utilisateur
    const simulation = await getSimulationById(simulationId);
    if (!simulation) {
      throw new Error('Simulation non trouvée');
    }

    if (simulation.user_id !== session.user.id) {
      throw new Error('Vous n\'avez pas la permission de lancer cette simulation');
    }

    if (simulation.status === 'running') {
      throw new Error('La simulation est déjà en cours');
    }

    // Appeler l'Edge Function 'simulate' 
    console.log(`[SimulationService] Appel Edge Function simulate pour ${simulationId}`);
    
    const { data, error } = await supabase.functions.invoke('simulate', {
      body: { 
        simulationId 
      },
      headers: {
        'Cache-Control': 'no-cache',
        'Authorization': `Bearer ${session.access_token}`
      }
    });

    if (error) {
      console.error('[SimulationService] Erreur Edge Function:', error);
      
      // Gestion des erreurs spécifiques
      if (error.message?.includes('404') || error.message?.includes('not found')) {
        throw new Error('Fonction de simulation non trouvée. Veuillez contacter le support.');
      }
      if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
        throw new Error('Erreur réseau. Veuillez vérifier votre connexion.');
      }
      if (error.message?.includes('timeout')) {
        throw new Error('Timeout de la simulation. Veuillez réessayer.');
      }
      
      throw error;
    }
    
    console.log(`[SimulationService] Simulation ${simulationId} lancée avec succès`);
    return data;
  } catch (error: any) {
    console.error('[SimulationService] Erreur critique lancement simulation:', error);
    
    // Mettre à jour le statut en échec
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
      console.error('[SimulationService] Impossible de mettre à jour le statut en échec:', updateError);
    }
    
    return {
      success: false,
      simulation_id: simulationId,
      status: 'failed',
      error: error.message || 'Erreur inconnue lors du lancement de la simulation'
    };
  }
};

// ✅ Upload de géométrie - VERSION CORRIGÉE
export const uploadGeometry = async (params: { 
  file: File; 
  simulationId?: string;
  onProgress?: (progress: number) => void;
}): Promise<UploadGeometryResponse> => {
  try {
    console.log('[SimulationService] Upload de géométrie:', params.file.name);

    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id || 'anonymous';
    
    if (userId === 'anonymous') {
      throw new Error('Vous devez être connecté pour uploader des fichiers');
    }

    // Validation fichier
    if (!params.file) {
      throw new Error('Aucun fichier fourni');
    }

    if (params.file.size > 50 * 1024 * 1024) {
      throw new Error('La taille du fichier dépasse la limite de 50MB');
    }

    const fileExt = params.file.name.toLowerCase().split('.').pop() || 'stl';
    const allowedExtensions = ['stl', 'step', 'stp', 'obj', 'iges', 'igs', 'vtp', 'vti', 'ply', 'vtk'];
    
    if (!allowedExtensions.includes(fileExt)) {
      throw new Error(`Format non supporté: .${fileExt}. Formats autorisés: ${allowedExtensions.join(', ')}`);
    }

    // Nettoyage nom de fichier
    const safeName = params.file.name
      .replace(/[^\x00-\x7F]/g, "")
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9._-]/g, "");

    const fileName = `${userId}/${Date.now()}_${safeName}`;

    // Progression
    if (params.onProgress) params.onProgress(10);

    // Upload avec timeout
    const uploadPromise = supabase.storage
      .from('simulation-files')
      .upload(fileName, params.file, {
        cacheControl: '3600',
        upsert: false,
        contentType: 'application/octet-stream'
      });

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Timeout upload après 60 secondes')), 60000);
    });

    const { error: uploadError } = await Promise.race([
      uploadPromise,
      timeoutPromise
    ]) as any;

    if (uploadError) {
      console.error("[SimulationService] Erreur upload:", uploadError);
      
      if (uploadError.message.includes('already exists')) {
        throw new Error('Un fichier avec ce nom existe déjà. Veuillez renommer votre fichier.');
      }
      if (uploadError.message.includes('413')) {
        throw new Error('Fichier trop volumineux. Taille maximale: 50MB.');
      }
      
      throw new Error(`Échec de l'upload: ${uploadError.message}`);
    }

    if (params.onProgress) params.onProgress(70);

    // Récupération URL
    const { data: { publicUrl } } = supabase.storage
      .from('simulation-files')
      .getPublicUrl(fileName);

    // Mise à jour simulation si ID fourni
    if (params.simulationId) {
      try {
        const { error: updateError } = await supabase
          .from('simulations')
          .update({
            geometry_config: {
              file_url: publicUrl,
              file_name: params.file.name,
              file_size: params.file.size,
              file_path: fileName,
              type: fileExt,
              uploaded_at: new Date().toISOString()
            },
            updated_at: new Date().toISOString()
          })
          .eq('id', params.simulationId);

        if (updateError) {
          console.warn('[SimulationService] Avertissement: Impossible de mettre à jour la simulation:', updateError.message);
        } else {
          console.log(`[SimulationService] Simulation ${params.simulationId} mise à jour avec le fichier`);
        }
      } catch (updateErr: any) {
        console.warn('[SimulationService] Échec mise à jour simulation:', updateErr.message);
      }
    }

    if (params.onProgress) params.onProgress(100);

    console.log('[SimulationService] Upload réussi:', fileName);
    
    return {
      success: true,
      fileUrl: publicUrl,
      fileName: params.file.name,
      fileSize: params.file.size,
      path: fileName
    };
  } catch (error: any) {
    console.error('[SimulationService] Échec upload:', error);
    return {
      success: false,
      fileUrl: '',
      fileName: params?.file?.name || '',
      error: error.message || 'Échec de l\'upload'
    };
  }
};

// -----------------------------------------------------------------------------
// FONCTIONS UTILITAIRES
// -----------------------------------------------------------------------------

// Vérifier si une simulation existe
export const checkSimulationExists = async (simulationId: string): Promise<boolean> => {
  try {
    const { data, error } = await supabase
      .from('simulations')
      .select('id')
      .eq('id', simulationId)
      .single();

    return !error && !!data;
  } catch {
    return false;
  }
};

// Tester la connexion à l'Edge Function
export const testEdgeFunctionConnection = async (): Promise<boolean> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return false;

    const response = await fetch(
      `${supabase.supabaseUrl}/functions/v1/simulate`,
      {
        method: 'OPTIONS',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      }
    );

    return response.status === 204;
  } catch {
    return false;
  }
};

// Supprimer une simulation
export const deleteSimulation = async (id: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Authentification requise');

  const { error } = await supabase
    .from('simulations')
    .delete()
    .eq('id', id)
    .eq('user_id', session.user.id);

  if (error) throw error;
};

// S'abonner aux changements d'une simulation
export const subscribeToSimulation = (id: string, callback: (payload: any) => void) => {
  return supabase.channel(`sim-${id}`)
    .on('postgres_changes', { 
      event: '*', 
      schema: 'public', 
      table: 'simulations', 
      filter: `id=eq.${id}` 
    }, callback)
    .subscribe();
};

// Se désabonner d'un canal
export const unsubscribeFromChannel = (channel: any) => {
  if (channel) supabase.removeChannel(channel);
};

// -----------------------------------------------------------------------------
// EXPORT PAR DÉFAUT
// -----------------------------------------------------------------------------

export const SimulationService = {
  // Fonctions principales
  getSimulations,
  getSimulationById,
  createSimulation,
  updateSimulation,
  startSimulation,
  uploadGeometry,
  deleteSimulation,
  
  // Fonctions matériaux
  getMaterials,
  getMaterialById,
  validateMaterialId,
  getDefaultMaterial,
  VALID_MATERIAL_IDS,
  
  // Fonctions utilitaires
  checkSimulationExists,
  testEdgeFunctionConnection,
  
  // Abonnements
  subscribeToSimulation,
  unsubscribeFromChannel
};

export default SimulationService;
