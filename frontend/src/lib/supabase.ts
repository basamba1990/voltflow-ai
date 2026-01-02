// FICHIER CORRIGÉ : frontend/src/lib/supabase.ts
// Client Supabase uniquement - sans fonctions métier

import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

// -----------------------------------------------------------------------------
// 1. CONFIGURATION STRICTE
// -----------------------------------------------------------------------------

if (!import.meta.env.VITE_SUPABASE_URL) {
  throw new Error('❌ VITE_SUPABASE_URL manquant dans .env');
}

if (!import.meta.env.VITE_SUPABASE_ANON_KEY) {
  throw new Error('❌ VITE_SUPABASE_ANON_KEY manquant dans .env');
}

// -----------------------------------------------------------------------------
// 2. CLIENT SUPABASE PRINCIPAL
// -----------------------------------------------------------------------------

export const supabase = createClient<Database>(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    },
    global: {
      headers: {
        'x-application-name': 'voltflow-ai'
      }
    }
  }
);

// -----------------------------------------------------------------------------
// 3. UTILITAIRES GLOBAUX - CORRIGÉS POUR ÉVITER LES 404
// -----------------------------------------------------------------------------

/**
 * Vérifie la connexion à Supabase sans requêter une table spécifique
 */
export const checkSupabaseConnection = async () => {
  try {
    // Utilise une table système ou une requête qui échouera proprement
    const { error } = await supabase
      .from('_nonexistent_table_for_connection_test')
      .select('*')
      .limit(0);

    // Si erreur 42P01 = table inexistante → connexion OK mais table absente
    // Si erreur 42501/401 = RLS actif → connexion OK
    // Sinon, erreur de connexion
    if (error) {
      if (error.code === '42P01' || error.code === '42501' || error.code === '401') {
        return { 
          status: 'connected', 
          message: 'Connexion Supabase établie' 
        };
      }
      return { 
        status: 'disconnected', 
        message: `Erreur: ${error.message}` 
      };
    }
    
    return { 
      status: 'connected', 
      message: 'Connexion Supabase établie' 
    };
  } catch (e: any) {
    console.error('❌ Diagnostic Supabase échoué:', e);
    return { 
      status: 'disconnected', 
      message: e.message || 'Impossible de se connecter à Supabase' 
    };
  }
};

/**
 * Gestionnaire d'erreurs standardisé
 */
export const handleSupabaseError = (
  error: any, 
  operation = 'opération',
  context: Record<string, any> = {}
) => {
  const errorDetails = {
    code: error?.code || 'UNKNOWN',
    message: error?.message || 'Erreur inconnue',
    operation,
    context,
    timestamp: new Date().toISOString()
  };
  
  console.error(`❌ Erreur Supabase (${operation}):`, errorDetails);
  
  const userMessages: Record<string, string> = {
    'PGRST116': 'Aucune donnée trouvée',
    '42501': 'Permission refusée',
    '401': 'Session expirée - Veuillez vous reconnecter',
    '429': 'Limite de requêtes atteinte',
    '42P01': 'Table non trouvée - Contactez le support',
    '08006': 'Erreur de connexion à la base de données',
    'UNKNOWN': 'Une erreur est survenue'
  };
  
  return {
    ...errorDetails,
    userMessage: userMessages[errorDetails.code] || userMessages.UNKNOWN,
    severity: errorDetails.code === '401' ? 'warning' : 'error'
  };
};
