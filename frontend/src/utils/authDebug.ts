/**
 * Utilitaire de débogage pour l'authentification
 */
export class AuthDebugger {
  static logAuthState() {
    console.group('🔐 État de l\'authentification');
    
    // Vérifier les variables d'environnement
    console.log('Variables d\'environnement:');
    console.log('- VITE_SUPABASE_URL:', import.meta.env.VITE_SUPABASE_URL ? '✓ Présent' : '✗ Manquant');
    console.log('- VITE_SUPABASE_ANON_KEY:', import.meta.env.VITE_SUPABASE_ANON_KEY ? '✓ Présent' : '✗ Manquant');
    
    // Vérifier l'URL actuelle
    console.log('URL actuelle:', window.location.href);
    
    // Vérifier les paramètres d'URL
    const params = new URLSearchParams(window.location.search);
    console.log('Paramètres URL:');
    params.forEach((value, key) => {
      console.log(`  ${key}: ${value}`);
    });
    
    // Vérifier le localStorage
    console.log('LocalStorage Supabase:');
    Object.keys(localStorage).forEach(key => {
      if (key.includes('supabase') || key.includes('auth')) {
        try {
          const value = JSON.parse(localStorage[key]);
          console.log(`  ${key}:`, value);
        } catch {
          console.log(`  ${key}:`, localStorage[key]);
        }
      }
    });
    
    console.groupEnd();
  }
  
  static checkRedirectConfig() {
    console.group('🔗 Configuration de redirection');
    
    const currentOrigin = window.location.origin;
    const redirectUrl = `${currentOrigin}/dashboard`;
    
    console.log('Origine actuelle:', currentOrigin);
    console.log('URL de redirection calculée:', redirectUrl);
    
    // Vérifier dans Supabase Dashboard
    console.log('\n📋 À configurer dans Supabase Dashboard:');
    console.log('1. Allez sur: https://supabase.com/dashboard/project/_/auth/url-configuration');
    console.log('2. Ajoutez cette URL à "Redirect URLs":');
    console.log('   ', redirectUrl);
    console.log('\n3. Vérifiez la configuration GitHub OAuth:');
    console.log('   - Client ID et Secret configurés');
    console.log('   - Callback URL: https://fyycfdpuvtouyhwnydka.supabase.co/auth/v1/callback');
    
    console.groupEnd();
  }
  
  static clearAuth() {
    console.log('🧹 Nettoyage de l\'authentification...');
    
    // Supprimer les tokens Supabase
    Object.keys(localStorage).forEach(key => {
      if (key.includes('supabase') || key.includes('auth')) {
        localStorage.removeItem(key);
        console.log(`Supprimé: ${key}`);
      }
    });
    
    // Supprimer les cookies
    document.cookie.split(';').forEach(cookie => {
      const [name] = cookie.trim().split('=');
      if (name.includes('supabase') || name.includes('auth')) {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
        console.log(`Cookie supprimé: ${name}`);
      }
    });
    
    // Rediriger vers la page d'accueil
    window.location.href = '/';
    
    console.log('✅ Authentification nettoyée');
  }
}

// Utilisation dans la console du navigateur
declare global {
  interface Window {
    authDebug: {
      log: () => void;
      checkRedirects: () => void;
      clear: () => void;
    };
  }
}

// Exposer les fonctions de débogage
if (typeof window !== 'undefined') {
  window.authDebug = {
    log: AuthDebugger.logAuthState,
    checkRedirects: AuthDebugger.checkRedirectConfig,
    clear: AuthDebugger.clearAuth,
  };
  
  console.log('🔧 Débogage auth disponible:');
  console.log('- authDebug.log() - Afficher l\'état de l\'auth');
  console.log('- authDebug.checkRedirects() - Vérifier les redirects');
  console.log('- authDebug.clear() - Nettoyer l\'auth');
}
