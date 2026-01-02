// FICHIER NOUVEAU : frontend/src/services/simulation.service.ts
// Contient TOUTES les fonctions manquantes pour Dashboard

import { supabase, handleSupabaseError } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

// Types
export type Simulation = Database['public']['Tables']['simulations']['Row'];
export type SimulationInsert = Database['public']['Tables']['simulations']['Insert'];
export type SimulationUpdate = Database['public']['Tables']['simulations']['Update'];

export type SimulationStatus = 'pending' | 'running' | 'completed' | 'failed';
export type SimulationChannel = ReturnType<typeof supabase.channel>;

// -----------------------------------------------------------------------------
// 1. FONCTIONS DE RÉCUPÉRATION (GET)
// -----------------------------------------------------------------------------

/**
 * Récupère les simulations avec pagination et filtres
 */
export const getSimulations = async (
  options: {
    limit?: number;
    status?: SimulationStatus;
    userId?: string;
    offset?: number;
  } = {}
): Promise<Simulation[]> => {
  const { 
    limit = 10, 
    status, 
    userId,
    offset = 0 
  } = options;
  
  try {
    // Récupère l'utilisateur courant si userId non fourni
    let targetUserId = userId;
    if (!targetUserId) {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) throw new Error('Utilisateur non authentifié');
      targetUserId = user.id;
    }
    
    // Construction de la requête
    let query = supabase
      .from('simulations')
      .select('*')
      .eq('user_id', targetUserId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (status) {
      query = query.eq('status', status);
    }
    
    const { data, error } = await query;
    
    if (error) {
      throw handleSupabaseError(error, 'getSimulations', { userId: targetUserId });
    }
    
    return data || [];
  } catch (error: any) {
    console.error('❌ Erreur getSimulations:', error);
    throw error;
  }
};

/**
 * Récupère une simulation par son ID
 */
export const getSimulationById = async (simulationId: string): Promise<Simulation | null> => {
  try {
    const { data, error } = await supabase
      .from('simulations')
      .select('*')
      .eq('id', simulationId)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') return null; // Non trouvé
      throw handleSupabaseError(error, 'getSimulationById', { simulationId });
    }
    
    return data;
  } catch (error: any) {
    console.error('❌ Erreur getSimulationById:', error);
    throw error;
  }
};

// -----------------------------------------------------------------------------
// 2. FONCTIONS DE CRÉATION/MODIFICATION (POST/PUT)
// -----------------------------------------------------------------------------

/**
 * Crée une nouvelle simulation
 */
export const createSimulation = async (
  simulationData: Omit<SimulationInsert, 'user_id' | 'id' | 'created_at' | 'updated_at'>
): Promise<Simulation> => {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!user) throw new Error('Utilisateur non authentifié');
    
    const newSimulation: SimulationInsert = {
      ...simulationData,
      user_id: user.id,
      status: 'pending',
      progress: 0
    };
    
    const { data, error } = await supabase
      .from('simulations')
      .insert(newSimulation)
      .select()
      .single();
    
    if (error) {
      throw handleSupabaseError(error, 'createSimulation', { userId: user.id });
    }
    
    return data;
  } catch (error: any) {
    console.error('❌ Erreur createSimulation:', error);
    throw error;
  }
};

/**
 * Met à jour une simulation existante
 */
export const updateSimulation = async (
  simulationId: string,
  updates: SimulationUpdate
): Promise<Simulation> => {
  try {
    const { data, error } = await supabase
      .from('simulations')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', simulationId)
      .select()
      .single();
    
    if (error) {
      throw handleSupabaseError(error, 'updateSimulation', { simulationId });
    }
    
    return data;
  } catch (error: any) {
    console.error('❌ Erreur updateSimulation:', error);
    throw error;
  }
};

// -----------------------------------------------------------------------------
// 3. ABONNEMENTS TEMPS RÉEL (REALTIME)
// -----------------------------------------------------------------------------

/**
 * S'abonne aux mises à jour temps réel d'une simulation
 */
export const subscribeToSimulation = (
  simulationId: string,
  callback: (payload: {
    new: Simulation;
    old: Simulation;
    eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  }) => void
): SimulationChannel => {
  if (!simulationId) {
    throw new Error('Simulation ID requis pour l\'abonnement');
  }
  
  const channel = supabase
    .channel(`simulation-updates-${simulationId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'simulations',
        filter: `id=eq.${simulationId}`
      },
      (payload) => {
        console.log(`📡 Mise à jour simulation ${simulationId}:`, payload);
        callback(payload as any);
      }
    )
    .subscribe((status) => {
      console.log(`📡 Statut abonnement ${simulationId}:`, status);
    });
  
  return channel;
};

/**
 * Se désabonne d'un canal
 */
export const unsubscribeFromChannel = (channel: SimulationChannel): void => {
  if (channel) {
    const subscription = supabase.removeChannel(channel);
    console.log(`🔴 Désabonné du canal:`, subscription);
  }
};

/**
 * S'abonne à toutes les simulations de l'utilisateur
 */
export const subscribeToUserSimulations = (
  userId: string,
  callback: (payload: any) => void
): SimulationChannel => {
  const channel = supabase
    .channel(`user-simulations-${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'simulations',
        filter: `user_id=eq.${userId}`
      },
      callback
    )
    .subscribe();
  
  return channel;
};

// -----------------------------------------------------------------------------
// 4. FONCTIONS UTILITAIRES
// -----------------------------------------------------------------------------

/**
 * Rafraîchit la liste des simulations (force revalidation)
 */
export const refreshSimulations = async (): Promise<Simulation[]> => {
  return getSimulations({ limit: 50 });
};

/**
 * Supprime une simulation (soft delete)
 */
export const deleteSimulation = async (simulationId: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('simulations')
      .update({ status: 'deleted', deleted_at: new Date().toISOString() })
      .eq('id', simulationId);
    
    if (error) {
      throw handleSupabaseError(error, 'deleteSimulation', { simulationId });
    }
  } catch (error: any) {
    console.error('❌ Erreur deleteSimulation:', error);
    throw error;
  }
};

/**
 * Compte le nombre de simulations par statut
 */
export const getSimulationStats = async (userId?: string) => {
  try {
    const targetUserId = userId || (await supabase.auth.getUser()).data.user?.id;
    if (!targetUserId) throw new Error('Utilisateur non trouvé');
    
    const { data, error } = await supabase
      .from('simulations')
      .select('status')
      .eq('user_id', targetUserId);
    
    if (error) throw error;
    
    const stats = {
      total: data.length,
      pending: data.filter(s => s.status === 'pending').length,
      running: data.filter(s => s.status === 'running').length,
      completed: data.filter(s => s.status === 'completed').length,
      failed: data.filter(s => s.status === 'failed').length
    };
    
    return stats;
  } catch (error: any) {
    console.error('❌ Erreur getSimulationStats:', error);
    throw error;
  }
};
