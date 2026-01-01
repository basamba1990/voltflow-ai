// Configuration Supabase
export const SUPABASE_CONFIG = {
  // Vérifier que les URLs sont correctes
  auth: {
    redirectTo: () => {
      // URL dynamique basée sur l'environnement
      const baseUrl = typeof window !== 'undefined' 
        ? window.location.origin 
        : process.env.VITE_APP_URL || 'http://localhost:3000';
      
      return `${baseUrl}/dashboard`;
    },
    // Ajouter des paramètres OAuth
    github: {
      scopes: 'read:user user:email',
    },
    google: {
      scopes: 'email profile',
    },
  },
  // URLs de callback autorisées (à configurer dans le dashboard Supabase)
  allowedRedirectUrls: [
    'http://localhost:3000/dashboard',
    'http://localhost:5173/dashboard', // Vite dev server
    'https://voltflow-ai.vercel.app/dashboard',
    'https://voltflow-ai.vercel.app/',
    // Ajoutez vos propres domaines ici
  ],
};

// Fonction pour vérifier la configuration
export const checkSupabaseConfig = () => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('❌ Configuration Supabase manquante');
    console.error('VITE_SUPABASE_URL:', supabaseUrl ? '✓' : '✗');
    console.error('VITE_SUPABASE_ANON_KEY:', supabaseAnonKey ? '✓' : '✗');
    
    throw new Error(`
      Configuration Supabase manquante !
      
      Veuillez ajouter ces variables dans votre fichier .env :
      
      VITE_SUPABASE_URL=https://votre-project-ref.supabase.co
      VITE_SUPABASE_ANON_KEY=votre-anon-key
      
      Vous pouvez les trouver dans :
      Supabase Dashboard → Project Settings → API
    `);
  }

  console.log('✅ Configuration Supabase valide');
  console.log('URL:', supabaseUrl);
  
  return true;
};
