import { supabase, handleSupabaseError } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

// Types étendus pour la simulation
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

// Interfaces de configuration
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
  solver_type: string; // Ajout du type de solveur
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

/**
 * Service pour interagir avec les données de simulation.
 */
class SimulationService {
  // -----------------------------------------------------------------------------
  // FONCTIONS DE RÉCUPÉRATION
  // -----------------------------------------------------------------------------

  /**
   * Récupère la liste des simulations de l'utilisateur.
   */
  static async getSimulations(
    options: { limit?: number; status?: SimulationStatus; offset?: number; } = {}
  ): Promise<Simulation[]> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('Utilisateur non authentifié');

      const { limit = 10, status, offset = 0 } = options;

      let query = supabase
        .from('simulations')
        .select(
          `
            *,
            simulation_results (*)
          `
        )
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (status) {
        query = query.eq('status', status);
      }

      const { data, error } = await query;

      if (error) {
        const supabaseError = handleSupabaseError(error, 'getSimulations', { userId: session.user.id, options });
        throw new Error(supabaseError.userMessage);
      }

      return data || [];
    } catch (error: any) {
      console.error('❌ getSimulations error:', error);
      throw error;
    }
  }

  /**
   * Récupère une simulation par son ID.
   */
  static async getSimulationById(simulationId: string): Promise<Simulation | null> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('Utilisateur non authentifié');

      const { data, error } = await supabase
        .from('simulations')
        .select(
          `
            *,
            simulation_results (*)
          `
        )
        .eq('id', simulationId)
        .eq('user_id', session.user.id) // Sécurité: vérifie que l'utilisateur est propriétaire
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null; // Non trouvé
        const supabaseError = handleSupabaseError(error, 'getSimulationById', { simulationId });
        throw new Error(supabaseError.userMessage);
      }

      return data;
    } catch (error: any) {
      console.error('❌ getSimulationById error:', error);
      throw error;
    }
  }

  /**
   * Récupère les résultats d'une simulation.
   */
  static async getSimulationResults(simulationId: string): Promise<SimulationResult | null> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('Utilisateur non authentifié');

      const { data, error } = await supabase
        .from('simulation_results')
        .select('*')
        .eq('simulation_id', simulationId)
        // Jointure implicite pour vérifier les permissions via RLS
        .maybeSingle();

      if (error) {
        const supabaseError = handleSupabaseError(error, 'getSimulationResults', { simulationId });
        throw new Error(supabaseError.userMessage);
      }

      return data;
    } catch (error: any) {
      console.error('❌ getSimulationResults error:', error);
      throw error;
    }
  }

  // -----------------------------------------------------------------------------
  // CRÉATION ET MISE À JOUR
  // -----------------------------------------------------------------------------

  /**
   * Crée une nouvelle simulation.
   */
  static async createSimulation(
    params: CreateSimulationParams
  ): Promise<Simulation> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('Authentification requise');

      // Validation des données
      if (!params.name?.trim()) throw new Error('Le nom de la simulation est requis');
      if (!params.config.material_id) throw new Error('Le matériau est requis');

      const newSimulation: SimulationInsert = {
        user_id: session.user.id,
        name: params.name.trim(),
        description: params.description?.trim() || null,
        geometry_type: params.geometryType || 'complex',
        geometry_config: params.config.geometry_config || { type: 'complex' },
        boundary_conditions: params.config.boundary_conditions as any,
        material_id: params.config.material_id,
        mesh_density: params.config.mesh_density || 'high',
        solver_type: params.config.solver_type || 'fem_fortran', // Ajout du solveur
        status: 'pending' as SimulationStatus,
        progress: 0,
      };

      const { data, error } = await supabase
        .from('simulations')
        .insert(newSimulation)
        .select()
        .single();

      if (error) {
        const supabaseError = handleSupabaseError(error, 'createSimulation', { userId: session.user.id, simulationName: params.name });
        throw new Error(supabaseError.userMessage);
      }

      return data as Simulation;
    } catch (error: any) {
      console.error('❌ createSimulation error:', error);
      throw error;
    }
  }

  /**
   * Met à jour une simulation existante.
   */
  static async updateSimulation(
    simulationId: string,
    params: Partial<CreateSimulationParams>
  ): Promise<Simulation> {
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
        updateData.solver_type = params.config.solver_type; // Mise à jour du solveur
      }

      const { data, error } = await supabase
        .from('simulations')
        .update(updateData)
        .eq('id', simulationId)
        .eq('user_id', session.user.id)
        .select()
        .single();

      if (error) {
        const supabaseError = handleSupabaseError(error, 'updateSimulation', { simulationId });
        throw new Error(supabaseError.userMessage);
      }

      return data as Simulation;
    } catch (error: any) {
      console.error('❌ updateSimulation error:', error);
      throw error;
    }
  }

  // -----------------------------------------------------------------------------
  // LANCEMENT DE SIMULATION
  // -----------------------------------------------------------------------------

  /**
   * Lance une simulation en appelant une Edge Function.
   */
  static async startSimulation(simulationId: string): Promise<StartSimulationResponse> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('Authentification requise');

      // 1. Vérifier l'existence et le statut
      const { data: simulation, error: fetchError } = await supabase
        .from('simulations')
        .select('status, geometry_config, boundary_conditions, material_id, mesh_density, solver_type')
        .eq('id', simulationId)
        .eq('user_id', session.user.id)
        .single();

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          throw new Error('Simulation non trouvée');
        }
        throw new Error(`Erreur de récupération: ${fetchError.message}`);
      }

      // 2. Empêcher les doublons
      if (simulation.status === 'running') {
        throw new Error('Une simulation est déjà en cours');
      }

      // 3. Mettre à jour le statut immédiatement
      await supabase
        .from('simulations')
        .update({ status: 'running', progress: 0, error_message: null })
        .eq('id', simulationId);

      // 4. Préparer la configuration
      const config: SimulationConfig = {
        geometry_config: simulation.geometry_config as any,
        boundary_conditions: simulation.boundary_conditions as any,
        material_id: simulation.material_id,
        mesh_density: simulation.mesh_density as MeshDensity,
        solver_type: simulation.solver_type, // Ajout du solveur
      };

      // 5. Appeler l'Edge Function
      const { data, error } = await supabase.functions.invoke('simulate', {
        body: {
          simulation_id: simulationId,
          config: config,
          user_id: session.user.id, // Passer l'ID utilisateur pour la sécurité
        }
      });

      if (error) {
        console.error('Edge Function invocation error:', error);
        // Marquer comme échoué en cas d'erreur d'appel
        await supabase
          .from('simulations')
          .update({ status: 'failed', progress: 0, error_message: error.message || 'Erreur lors de l\'appel' })
          .eq('id', simulationId);
        throw new Error(`Échec du lancement: ${error.message || 'Erreur inconnue'}`);
      }

      // 6. Retourner la réponse
      return {
        success: data?.success || false,
        simulation_id: simulationId,
        status: data?.status || 'running',
        results: data?.results,
        message: data?.message || 'Simulation lancée avec succès'
      };
    } catch (error: any) {
      console.error('❌ startSimulation error:', error);
      throw error;
    }
  }

  /**
   * Upload un fichier de géométrie (STL, STEP, OBJ) via une Edge Function.
   */
  static async uploadGeometry(params: { file: File, userId: string, simulationId?: string }): Promise<{ success: boolean, fileUrl: string, fileName: string }> {
    const reader = new FileReader();
    const fileData = await new Promise<string>((resolve) => {
      reader.onload = () => {
        // Utiliser ArrayBuffer et Buffer.from pour une meilleure gestion des binaires
        const arrayBuffer = reader.result as ArrayBuffer;
        const buffer = Buffer.from(arrayBuffer);
        resolve(buffer.toString('base64'));
      };
      reader.readAsArrayBuffer(params.file);
    });

    const { data, error } = await supabase.functions.invoke('upload-geometry', {
      body: {
        file_name: params.file.name,
        file_data: fileData,
        user_id: params.userId,
        simulation_id: params.simulationId,
        mime_type: params.file.type, // Ajout du type MIME
      }
    });

    if (error) {
      console.error('Edge Function upload error:', error);
      throw new Error(`Échec de l'upload: ${error.message}`);
    }

    return {
      success: true,
      fileUrl: data.fileUrl,
      fileName: data.fileName,
    };
  }

  // -----------------------------------------------------------------------------
  // SUPPRESSION
  // -----------------------------------------------------------------------------

  /**
   * Supprime une simulation et ses résultats.
   */
  static async deleteSimulation(simulationId: string): Promise<void> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('Authentification requise');

      // Vérifier que l'utilisateur est propriétaire et le statut
      const { data: simulation } = await supabase
        .from('simulations')
        .select('user_id, status')
        .eq('id', simulationId)
        .single();

      if (!simulation) throw new Error('Simulation non trouvée');
      if (simulation.user_id !== session.user.id) throw new Error('Permission refusée');
      if (simulation.status === 'running') throw new Error('Impossible de supprimer une simulation en cours');

      // La suppression en cascade des résultats devrait être gérée par la base de données
      // si la RLS est correctement configurée, mais on peut le faire explicitement pour plus de sûreté.
      await supabase
        .from('simulation_results')
        .delete()
        .eq('simulation_id', simulationId);

      // Supprimer la simulation
      const { error } = await supabase
        .from('simulations')
        .delete()
        .eq('id', simulationId)
        .eq('user_id', session.user.id);

      if (error) {
        const supabaseError = handleSupabaseError(error, 'deleteSimulation', { simulationId });
        throw new Error(supabaseError.userMessage);
      }
    } catch (error: any) {
      console.error('❌ deleteSimulation error:', error);
      throw error;
    }
  }

  // -----------------------------------------------------------------------------
  // TEMPS RÉEL
  // -----------------------------------------------------------------------------

  /**
   * S'abonne aux changements de statut de la simulation.
   */
  static subscribeToSimulation(
    simulationId: string,
    callback: (payload: any) => void
  ) {
    const channel = supabase
      .channel(`simulation-updates-${simulationId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'simulations', filter: `id=eq.${simulationId}` },
        callback
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'simulation_results', filter: `simulation_id=eq.${simulationId}` },
        callback
      )
      .subscribe((status) => {
        console.log(`Subscription status for ${simulationId}:`, status);
      });

    return channel;
  }

  /**
   * Se désabonne d'un canal de simulation.
   */
  static unsubscribeFromChannel(channel: any) {
    if (channel) {
      supabase.removeChannel(channel);
    }
  }
}

export default SimulationService;
