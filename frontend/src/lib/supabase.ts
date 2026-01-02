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
// 3. UTILITAIRES GLOBAUX (optionnels mais recommandés)
// -----------------------------------------------------------------------------

/**
 * Vérifie la connexion à Supabase
 */
export const checkSupabaseConnection = async () => {
  try {
    const { data, error } = await supabase.from('profiles').select('count').limit(1);
    
    if (error) {
      // Erreur de permission = RLS actif mais connexion OK
      if (error.code === '42501' || error.code === '401') {
        return { 
          status: 'connected', 
          message: 'Connexion établie (RLS actif)' 
        };
      }
      throw error;
    }
    
    return { 
      status: 'connected', 
      message: 'Connexion Supabase établie' 
    };
  } catch (error: any) {
    console.error('❌ Diagnostic Supabase échoué:', error);
    return { 
      status: 'disconnected', 
      message: error.message || 'Erreur réseau' 
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
  
  // Messages utilisateur selon le code d'erreur
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
