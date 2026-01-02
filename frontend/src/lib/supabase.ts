// FICHIER CORRIGÉ : frontend/src/lib/supabase.ts
// Basé sur l'architecture robuste de SmooveBox v2
import { createClient } from '@supabase/supabase-js';
import { Database } from './database.types';

// -----------------------------------------------------------------------------
// 1. Configuration du Client Supabase
// -----------------------------------------------------------------------------

// Vérification des variables d'environnement (Critique)
if (!import.meta.env.VITE_SUPABASE_URL) {
  console.error("❌ VITE_SUPABASE_URL n'est pas défini. La connexion Supabase échouera.");
}
if (!import.meta.env.VITE_SUPABASE_ANON_KEY) {
  console.error("❌ VITE_SUPABASE_ANON_KEY n'est pas défini. La connexion Supabase échouera.");
}

export const supabase = createClient<Database>(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// -----------------------------------------------------------------------------
// 2. Gestion d'Erreur Avancée (Inspiré de SmooveBox)
// -----------------------------------------------------------------------------

/**
 * Gère les erreurs Supabase et fournit un message utilisateur clair.
 * @param error L'objet d'erreur retourné par Supabase.
 * @param operation Description de l'opération en cours.
 * @param context Contexte supplémentaire pour le débogage.
 * @returns Un objet contenant les informations d'erreur pour l'utilisateur.
 */
export const handleSupabaseError = (error: any, operation: string = 'opération', context: any = {}) => {
  console.error(`❌ Erreur lors de ${operation}:`, {
    error,
    context,
    timestamp: new Date().toISOString()
  });
  
  const errorMap: { [key: string]: { error: string, details: string, userMessage: string, severity: 'info' | 'warning' | 'error', action?: string } } = {
    'PGRST116': { 
      error: 'Aucun résultat trouvé', 
      details: 'Aucune donnée correspondante trouvée dans la base de données',
      userMessage: 'Aucune donnée trouvée pour votre recherche.',
      severity: 'info'
    },
    '42501': { 
      error: 'Permission refusée', 
      details: 'Vous n\'avez pas les droits nécessaires pour cette opération',
      userMessage: 'Vous n\'avez pas les permissions nécessaires pour effectuer cette action.',
      severity: 'warning'
    },
    '401': {
      error: 'Non autorisé',
      details: 'Authentification requise ou jeton invalide',
      userMessage: 'Votre session a expiré ou vous n\'êtes pas autorisé. Veuillez vous reconnecter.',
      severity: 'warning',
      action: 'redirectToLogin'
    },
    '429': {
      error: 'Limite atteinte',
      details: 'Limite de simulations mensuelle atteinte',
      userMessage: 'Limite de simulations mensuelle atteinte. Veuillez mettre à niveau votre plan.',
      severity: 'warning',
      action: 'redirectToBilling'
    },
    // Erreurs génériques
    'default': { 
      error: 'Erreur inattendue', 
      details: error.message || 'Une erreur s\'est produite',
      userMessage: 'Une erreur inattendue s\'est produite. Veuillez réessayer.',
      severity: 'error'
    }
  };

  const errorInfo = errorMap[error.code] || errorMap['default'];

  if (errorInfo.severity === 'error') {
    console.error('🚨 Erreur critique:', {
      operation,
      error: errorInfo,
      context,
      timestamp: new Date().toISOString()
    });
  }
  return errorInfo;
};

// -----------------------------------------------------------------------------
// 3. Fonction de Diagnostic (Optionnel mais Recommandé)
// -----------------------------------------------------------------------------

/**
 * Vérifie l'état de la connexion Supabase.
 */
export const checkSupabaseConnection = async () => {
  try {
    // Tentative de lecture d'une table publique ou d'une requête simple
    const { data, error } = await supabase.from('users').select('id').limit(1);
    
    if (error) {
      // Si l'erreur est une erreur de permission (401, 42501), la connexion est établie mais les RLS sont actifs.
      // Si l'erreur est une erreur réseau, la connexion est coupée.
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
