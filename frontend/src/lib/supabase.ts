// frontend/src/lib/supabase.ts
// FICHIER CORRIGÉ AVEC LES FONCTIONS MANQUANTES
import { createClient } from '@supabase/supabase-js';
import { Database } from './database.types';

// 1. Configuration du Client Supabase
if (!import.meta.env.VITE_SUPABASE_URL) {
    console.error("❌ VITE_SUPABASE_URL n'est pas défini.");
}
if (!import.meta.env.VITE_SUPABASE_ANON_KEY) {
    console.error("❌ VITE_SUPABASE_ANON_KEY n'est pas défini.");
}

export const supabase = createClient<Database>(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY
);

// 2. Gestion d'Erreur (conservée depuis votre fichier)
export const handleSupabaseError = (error: any, operation: string = 'opération', context: any = {}) => {
    console.error(`❌ Erreur lors de ${operation}:`, { error, context, timestamp: new Date().toISOString() });
    const errorMap: { [key: string]: { error: string, details: string, userMessage: string, severity: 'info' | 'warning' | 'error', action?: string } } = {
        'PGRST116': { error: 'Aucun résultat trouvé', details: 'Aucune donnée correspondante trouvée dans la base de données', userMessage: 'Aucune donnée trouvée pour votre recherche.', severity: 'info' },
        '42501': { error: 'Permission refusée', details: 'Vous n\'avez pas les droits nécessaires pour cette opération', userMessage: 'Vous n\'avez pas les permissions nécessaires pour effectuer cette action.', severity: 'warning' },
        '401': { error: 'Non autorisé', details: 'Authentification requise ou jeton invalide', userMessage: 'Votre session a expiré ou vous n\'êtes pas autorisé. Veuillez vous reconnecter.', severity: 'warning', action: 'redirectToLogin' },
        '429': { error: 'Limite atteinte', details: 'Limite de simulations mensuelle atteinte', userMessage: 'Limite de simulations mensuelle atteinte. Veuillez mettre à niveau votre plan.', severity: 'warning', action: 'redirectToBilling' },
        'default': { error: 'Erreur inattendue', details: error.message || 'Une erreur s\'est produite', userMessage: 'Une erreur inattendue s\'est produite. Veuillez réessayer.', severity: 'error' }
    };
    const errorInfo = errorMap[error.code] || errorMap['default'];
    if (errorInfo.severity === 'error') {
        console.error('🚨 Erreur critique:', { operation, error: errorInfo, context, timestamp: new Date().toISOString() });
    }
    return errorInfo;
};

// 3. Fonction de Diagnostic (conservée)
export const checkSupabaseConnection = async () => {
    try {
        const { data, error } = await supabase.from('users').select('id').limit(1);
        if (error) {
            if (error.code === '401' || error.code === '42501') {
                return { status: 'connected', message: 'Connexion établie, RLS actif.' };
            }
            throw error;
        }
        return { status: 'connected', message: 'Connexion établie et fonctionnelle.' };
    } catch (e: any) {
        console.error('Erreur de diagnostic Supabase:', e);
        return { status: 'disconnected', message: e.message || 'Erreur réseau ou configuration invalide.' };
    }
};

// -----------------------------------------------------------------------------
// 4. NOUVELLES FONCTIONS MANQUANTES À EXPORTER
// -----------------------------------------------------------------------------

/**
 * Récupère la liste des simulations pour l'utilisateur connecté.
 * @param params Paramètres optionnels (limit, status, etc.)
 * @returns Promesse résolue avec un tableau de simulations
 */
export const getSimulations = async (params?: { limit?: number; status?: string }): Promise<any[]> => {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            throw new Error('Utilisateur non authentifié');
        }

        let query = supabase
            .from('simulations')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (params?.limit) {
            query = query.limit(params.limit);
        }
        if (params?.status) {
            query = query.eq('status', params.status);
        }

        const { data, error } = await query;

        if (error) {
            const errorInfo = handleSupabaseError(error, 'getSimulations', { userId: user.id, params });
            throw new Error(errorInfo.userMessage);
        }

        return data || [];
    } catch (error: any) {
        console.error('Erreur dans getSimulations:', error);
        throw error;
    }
};

/**
 * S'abonne aux mises à jour en temps réel d'une simulation.
 * @param simulationId ID de la simulation à suivre
 * @param callback Fonction appelée à chaque mise à jour
 * @returns L'objet channel pour se désabonner
 */
export const subscribeToSimulation = (simulationId: string, callback: (payload: any) => void) => {
    const channel = supabase
        .channel(`simulation:${simulationId}`)
        .on(
            'postgres_changes',
            {
                event: '*', // Écoute INSERT, UPDATE, DELETE
                schema: 'public',
                table: 'simulations',
                filter: `id=eq.${simulationId}`
            },
            callback
        )
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log(`✅ Abonné aux mises à jour de la simulation ${simulationId}`);
            }
            if (status === 'CHANNEL_ERROR') {
                console.error(`❌ Erreur d'abonnement pour la simulation ${simulationId}`);
            }
        });

    return channel;
};

/**
 * Se désabonne d'un canal Realtime.
 * @param channel Le canal retourné par subscribeToSimulation
 */
export const unsubscribeFromChannel = (channel: any) => {
    if (channel) {
        supabase.removeChannel(channel);
        console.log(`🔴 Désabonné du canal ${channel.topic}`);
    }
};
