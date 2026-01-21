import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

// -----------------------------------------------------------------------------
// 1. CONFIGURATION STRICTE
// -----------------------------------------------------------------------------

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('❌ Variables d\'environnement Supabase manquantes');
}

// -----------------------------------------------------------------------------
// 2. CLIENT SUPABASE PRINCIPAL - OPTIMISÉ
// -----------------------------------------------------------------------------

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'voltflow-ai-auth'
  },
  global: {
    headers: {
      'x-application-name': 'voltflow-ai',
      'x-client-info': 'supabase-js-web/2.89.0',
      'Accept': 'application/json'
    }
  },
  db: {
    schema: 'public'
  }
});

// -----------------------------------------------------------------------------
// 3. UTILITAIRES D'AUTHENTIFICATION
// -----------------------------------------------------------------------------

/**
 * Vérifie si l'utilisateur est authentifié
 */
export const checkAuth = async () => {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) throw error;
    return { session, error: null };
  } catch (error) {
    console.error('❌ Erreur d\'authentification:', error);
    return { session: null, error };
  }
};

/**
 * Valide un email pour l'authentification OTP (alias pour compatibilité)
 */
export const validateEmailForAuth = (email: string): { valid: boolean; error?: string } => {
  const trimmedEmail = email.trim().toLowerCase();
  
  if (!trimmedEmail) {
    return { valid: false, error: 'L\'email est requis' };
  }
  
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  
  if (!emailRegex.test(trimmedEmail)) {
    return { valid: false, error: 'Format d\'email invalide' };
  }
  
  if (trimmedEmail.length > 254) {
    return { valid: false, error: 'Email trop long' };
  }
  
  return { valid: true };
};

/**
 * Valide un email (version alternative)
 */
export const validateEmail = (email: string): { valid: boolean; error?: string } => {
  return validateEmailForAuth(email);
};

/**
 * Déconnexion sécurisée
 */
export const signOut = async () => {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    return { success: true, error: null };
  } catch (error: any) {
    console.error('❌ Erreur de déconnexion:', error);
    return { success: false, error: error.message };
  }
};

// -----------------------------------------------------------------------------
// 4. GESTION D'ERREURS UNIFIÉE
// -----------------------------------------------------------------------------

export type SupabaseError = {
  code: string;
  message: string;
  details?: string;
  hint?: string;
};

export const handleSupabaseError = (
  error: any,
  operation = 'opération',
  context: Record<string, any> = {}
) => {
  const errorDetails: SupabaseError & {
    operation: string;
    context: Record<string, any>;
    timestamp: string;
    userMessage: string;
    severity: 'info' | 'warning' | 'error';
  } = {
    code: error?.code || 'UNKNOWN',
    message: error?.message || 'Erreur inconnue',
    details: error?.details,
    hint: error?.hint,
    operation,
    context,
    timestamp: new Date().toISOString(),
    userMessage: 'Une erreur est survenue',
    severity: 'error'
  };
  
  // Messages utilisateur personnalisés
  const userMessages: Record<string, string> = {
    'PGRST116': 'Aucune donnée trouvée',
    '42501': 'Permission refusée',
    '401': 'Session expirée - Veuillez vous reconnecter',
    '429': 'Limite de requêtes atteinte - Réessayez plus tard',
    '42P01': 'Erreur système - Contactez le support',
    '08006': 'Erreur de connexion à la base de données',
    '23505': 'Cette donnée existe déjà',
    '23503': 'Donnée liée non trouvée',
    '22P02': 'Format de donnée invalide',
    'UNKNOWN': 'Une erreur inattendue est survenue'
  };
  
  // Déterminer la sévérité
  if (errorDetails.code === '401') errorDetails.severity = 'warning';
  if (errorDetails.code === '429') errorDetails.severity = 'info';
  
  errorDetails.userMessage = userMessages[errorDetails.code] || userMessages.UNKNOWN;
  
  console.error(`❌ Supabase Error (${operation}):`, {
    ...errorDetails,
    stack: error?.stack
  });
  
  return errorDetails;
};

// -----------------------------------------------------------------------------
// 5. UTILITAIRES DE SANTÉ - AJOUT DE LA FONCTION MANQUANTE
// -----------------------------------------------------------------------------

/**
 * Vérifie la connexion à Supabase
 * CORRECTION : Cette fonction était appelée `checkSupabaseConnection` dans App.tsx
 */
export const checkSupabaseConnection = async () => {
  try {
    // Test simple via auth plutôt que REST pour éviter 404
    const startTime = Date.now();
    const { data, error } = await supabase.auth.getSession();
    const latency = Date.now() - startTime;
    
    if (error) {
      return {
        status: 'disconnected',
        message: `Connexion impossible: ${error.message}`,
        latency,
        timestamp: new Date().toISOString()
      };
    }
    
    return {
      status: 'connected',
      message: 'Connexion Supabase établie',
      latency,
      timestamp: new Date().toISOString(),
      user: data.session?.user?.email || 'non authentifié'
    };
  } catch (error: any) {
    return {
      status: 'disconnected',
      message: error.message || 'Erreur de connexion',
      latency: null,
      timestamp: new Date().toISOString()
    };
  }
};

// Alias pour compatibilité
export const checkConnection = checkSupabaseConnection;
