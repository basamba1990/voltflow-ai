import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

// -----------------------------------------------------------------------------
// 1. CONFIGURATION STRICTE
// -----------------------------------------------------------------------------
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Variables d\'environnement Supabase manquantes.');
}

// -----------------------------------------------------------------------------
// 2. CLIENT SUPABASE PRINCIPAL - OPTIMISÉ POUR UPLOAD
// -----------------------------------------------------------------------------
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'voltflow-ai-auth',
    storage: typeof window !== 'undefined' ? localStorage : undefined,
    flowType: 'pkce', // 🔥 IMPORTANT pour les applications web modernes
    debug: false
  },
  global: {
    headers: {
      'x-application-name': 'voltflow-ai',
      'x-client-info': 'supabase-js-web/2.89.0',
      'Accept': 'application/json',
      'Cache-Control': 'no-cache'
    }
  },
  db: {
    schema: 'public'
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
});

// -----------------------------------------------------------------------------
// 3. CLIENT SERVICE ROLE (Désactivé côté client pour sécurité)
// -----------------------------------------------------------------------------
export const serviceRoleSupabase = null;

// -----------------------------------------------------------------------------
// 4. UTILITAIRES D'AUTHENTIFICATION AMÉLIORÉS
// -----------------------------------------------------------------------------

/**
 * Vérifie et rafraîchit la session si nécessaire
 * 🔥 CORRECTION CRITIQUE : Gère l'expiration des tokens
 */
export const ensureValidSession = async (maxRetries = 2) => {
  for (let i = 0; i <= maxRetries; i++) {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) {
        console.error(`❌ Erreur session (tentative ${i + 1}/${maxRetries + 1}):`, error);
        if (i === maxRetries) throw error;
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }
      
      if (!session) {
        console.log(`⚠️ Session non trouvée (tentative ${i + 1}/${maxRetries + 1})`);
        if (i === maxRetries) throw new Error('Session expirée. Veuillez vous reconnecter.');
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }
      
      // 🔥 Vérifier si le token va expirer (moins de 5 minutes)
      const expiresAt = session.expires_at ? session.expires_at * 1000 : null;
      const now = Date.now();
      const fiveMinutes = 5 * 60 * 1000;
      
      if (expiresAt && expiresAt < now + fiveMinutes) {
        console.log('🔄 Token expirant bientôt, rafraîchissement...');
        const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();
        
        if (refreshError) {
          console.error('❌ Erreur rafraîchissement:', refreshError);
          throw refreshError;
        }
        
        if (!refreshedData.session) {
          throw new Error('Session non rafraîchie');
        }
        
        console.log('✅ Session rafraîchie');
        return refreshedData.session;
      }
      
      console.log('✅ Session valide');
      return session;
      
    } catch (error) {
      if (i === maxRetries) {
        console.error('❌ Impossible d\'obtenir une session valide après plusieurs tentatives');
        throw error;
      }
    }
  }
  
  throw new Error('Impossible d\'obtenir une session valide');
};

/**
 * Vérifie si l'utilisateur est authentifié
 */
export const checkAuth = async () => {
  try {
    const session = await ensureValidSession();
    return { session, error: null };
  } catch (error: any) {
    console.error('❌ Erreur d\'authentification:', error);
    return { session: null, error };
  }
};

/**
 * Valide un email pour l'authentification OTP
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
    
    // Nettoyer le storage local
    if (typeof window !== 'undefined') {
      localStorage.removeItem('voltflow-ai-auth');
    }
    
    return { success: true, error: null };
  } catch (error: any) {
    console.error('❌ Erreur de déconnexion:', error);
    return { success: false, error: error.message };
  }
};

// -----------------------------------------------------------------------------
// 5. GESTION D'ERREURS UNIFIÉE
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
// 6. UTILITAIRES DE SANTÉ - FONCTIONS MANQUANTES
// -----------------------------------------------------------------------------

/**
 * Vérifie la connexion à Supabase
 */
export const checkSupabaseConnection = async () => {
  try {
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

export const checkConnection = checkSupabaseConnection;

/**
 * 🔥 NOUVEAU : Test de connexion Storage avec diagnostics
 */
export const testStorageConnection = async () => {
  try {
    const results = {
      auth: { success: false, message: '' },
      buckets: [] as any[],
      uploadTest: { success: false, message: '' }
    };

    // Test auth
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    results.auth = {
      success: !authError && !!session,
      message: authError ? authError.message : 'Authentifié'
    };

    // Test buckets
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    if (!bucketsError) {
      results.buckets = buckets.map(b => ({
        id: b.id,
        name: b.name,
        public: b.public,
        fileSizeLimit: b.file_size_limit,
        allowedMimeTypes: b.allowed_mime_types
      }));
    }

    // Test upload simple
    if (session) {
      try {
        const testFile = new File(['test'], 'test.txt', { type: 'text/plain' });
        const testPath = `test/${Date.now()}_test.txt`;
        
        const { error: uploadError } = await supabase.storage
          .from('simulation-files')
          .upload(testPath, testFile);
        
        results.uploadTest = {
          success: !uploadError,
          message: uploadError ? uploadError.message : 'Upload test réussi'
        };
        
        // Nettoyer le fichier test
        if (!uploadError) {
          await supabase.storage
            .from('simulation-files')
            .remove([testPath]);
        }
      } catch (uploadErr: any) {
        results.uploadTest = {
          success: false,
          message: uploadErr.message
        };
      }
    }

    return {
      success: results.auth.success && results.uploadTest.success,
      ...results
    };
  } catch (error: any) {
    return {
      success: false,
      auth: { success: false, message: error.message },
      buckets: [],
      uploadTest: { success: false, message: error.message }
    };
  }
};

/**
 * 🔥 NOUVEAU : Récupérer un client Supabase avec session valide
 */
export const getAuthenticatedSupabase = async () => {
  try {
    const session = await ensureValidSession();
    
    if (!session) {
      throw new Error('Session non authentifiée');
    }

    // Vérifier que le token est encore valide
    const expiresAt = session.expires_at ? session.expires_at * 1000 : Date.now() + 3600000;
    const now = Date.now();

    if (expiresAt < now + 60000) { // Moins d'1 minute avant expiration
      console.log('🔄 Rafraîchissement de la session...');
      const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();
      
      if (refreshError) {
        console.error('❌ Erreur rafraîchissement:', refreshError);
        throw refreshError;
      }
      
      if (!refreshedData.session) {
        throw new Error('Session non rafraîchie');
      }
      
      console.log('✅ Session rafraîchie');
      return supabase;
    }

    return supabase;
  } catch (error) {
    console.error('❌ Erreur authentification Supabase:', error);
    
    // Fallback: utiliser le service role si disponible
    if (serviceRoleSupabase) {
      console.log('🔄 Utilisation du service role comme fallback...');
      return serviceRoleSupabase;
    }
    
    throw error;
  }
};

// -----------------------------------------------------------------------------
// 7. INITIALISATION AUTOMATIQUE
// -----------------------------------------------------------------------------
if (typeof window !== 'undefined') {
  // Vérifier la session au chargement
  setTimeout(async () => {
    try {
      const { session } = await checkAuth();
      if (session) {
        console.log('✅ Session active détectée:', session.user.email);
      }
    } catch (error) {
      console.log('ℹ️ Aucune session active détectée');
    }
  }, 1000);

  // Rafraîchissement automatique toutes les 10 minutes
  setInterval(async () => {
    try {
      const { session } = await supabase.auth.getSession();
      if (session) {
        const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
        const now = Date.now();
        
        if (expiresAt && expiresAt < now + 600000) { // Moins de 10 minutes
          console.log('🔄 Rafraîchissement automatique de la session...');
          await supabase.auth.refreshSession();
        }
      }
    } catch (error) {
      console.warn('⚠️ Erreur rafraîchissement automatique:', error);
    }
  }, 600000); // 10 minutes
}

export { supabase as default };
