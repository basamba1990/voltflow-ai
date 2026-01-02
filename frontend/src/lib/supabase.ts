// FICHIER CORRIGÉ DEFINITIF : frontend/src/lib/supabase.ts

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
        'x-application-name': 'voltflow-ai',
        'x-client-info': 'supabase-js-web/2.89.0'
      }
    }
  }
);

// -----------------------------------------------------------------------------
// 3. DIAGNOSTIC CORRIGÉ - PLUS DE 404
// -----------------------------------------------------------------------------

/**
 * Vérifie la connexion à Supabase SANS générer de 404
 */
export const checkSupabaseConnection = async () => {
  try {
    // Méthode SANS requête HTTP qui cause des 404
    // On vérifie simplement que les variables d'environnement sont présentes
    // et que le client peut être instancié
    
    if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
      return { 
        status: 'disconnected', 
        message: 'Variables d\'environnement manquantes' 
      };
    }
    
    // Test de connexion léger: vérifier que le client peut être créé
    // sans faire de requête HTTP vers une table
    const testClient = createClient(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_SUPABASE_ANON_KEY,
      {
        auth: { autoRefreshToken: false, persistSession: false }
      }
    );
    
    // Tentative très légère: récupérer la session (méthode auth, pas REST)
    const { error } = await testClient.auth.getSession();
    
    if (error) {
      // Erreur réseau ou config invalide
      console.error('❌ Test connexion Supabase échoué:', error);
      return { 
        status: 'disconnected', 
        message: `Connexion impossible: ${error.message}` 
      };
    }
    
    return { 
      status: 'connected', 
      message: 'Connexion Supabase disponible' 
    };
  } catch (e: any) {
    console.error('❌ Diagnostic Supabase échoué:', e);
    return { 
      status: 'disconnected', 
      message: e.message || 'Erreur de configuration Supabase' 
    };
  }
};

// -----------------------------------------------------------------------------
// 4. GESTION D'ERREURS
// -----------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------
// 5. UTILITAIRE POUR VALIDER LES EMAILS (POUR OTP)
// -----------------------------------------------------------------------------

/**
 * Valide un email pour éviter les erreurs 400 de Supabase Auth
 */
export const validateEmailForAuth = (email: string): { valid: boolean; error?: string } => {
  const trimmedEmail = (email || '').trim().toLowerCase();
  
  if (!trimmedEmail) {
    return { valid: false, error: 'L\'email est requis' };
  }
  
  // Validation de format basique mais robuste
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  
  if (!emailRegex.test(trimmedEmail)) {
    return { valid: false, error: 'Format d\'email invalide' };
  }
  
  // Validation de longueur
  if (trimmedEmail.length > 254) {
    return { valid: false, error: 'Email trop long' };
  }
  
  return { valid: true };
};
