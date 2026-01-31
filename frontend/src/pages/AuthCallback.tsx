import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { supabase } from '@/lib/supabase';
import { Loader2 } from 'lucide-react';

export default function AuthCallback() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const handleAuthCallback = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) {
        console.error('Erreur de callback:', error);
        setLocation('/login?error=auth_failed');
        return;
      }

      if (session) {
        setLocation('/dashboard');
      } else {
        setLocation('/login');
      }
    };

    handleAuthCallback();
  }, [setLocation]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="text-center">
        <Loader2 className="w-12 h-12 animate-spin text-blue-500 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-white">Authentification en cours...</h2>
        <p className="text-gray-400 mt-2">Redirection vers votre tableau de bord</p>
      </div>
    </div>
  );
}
