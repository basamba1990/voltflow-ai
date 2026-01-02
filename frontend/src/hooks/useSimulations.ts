// FICHIER NOUVEAU : frontend/src/hooks/useSimulations.ts
// Basé sur l'architecture React Query de SmooveBox v2
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Database } from '../lib/database.types';

type SimulationRow = Database['public']['Tables']['simulations']['Row'];

/**
 * Hook pour récupérer les simulations de l'utilisateur avec React Query.
 * @returns {Object} { data, isLoading, error, refetch }
 */
export function useSimulations() {
  const { user } = useAuth();

  return useQuery<SimulationRow[], Error>({
    queryKey: ['simulations', user?.id],
    queryFn: async () => {
      if (!user) {
        // Ne devrait pas arriver si le composant est protégé par RequireAuth
        throw new Error('User not authenticated');
      }

      const { data, error } = await supabase
        .from('simulations')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      return data || [];
    },
    // N'exécute la requête que si l'utilisateur est authentifié
    enabled: !!user, 
    // Les données sont considérées comme "fraîches" pendant 5 minutes
    staleTime: 5 * 60 * 1000, 
  });
}
