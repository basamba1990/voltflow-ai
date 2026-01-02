// FICHIER CORRIGÉ : frontend/src/contexts/AuthContext.tsx
// Basé sur l'architecture robuste de SmooveBox v2
import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Session } from '@supabase/supabase-js';
import { Database } from '../lib/database.types';

// Définir les types pour le profil utilisateur
type Profile = Database['public']['Tables']['users']['Row'];

// Définir le type pour le contexte d'authentification
interface AuthContextType {
  user: Session['user'] | null;
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateUserProfile: (updates: Partial<Profile>) => Promise<Profile | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<Session['user'] | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fonction pour créer un profil utilisateur (similaire à SmooveBox)
  const createUserProfile = async (userData: Session['user']): Promise<Profile> => {
    const profileData: Profile = {
      id: userData.id,
      email: userData.email || '',
      full_name: userData.user_metadata?.full_name || null,
      avatar_url: userData.user_metadata?.avatar_url || null,
      role: 'user',
      subscription_plan: 'free',
      simulations_used: 0,
      simulations_limit: 5,
      stripe_customer_id: null,
      stripe_subscription_id: null,
      subscription_status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error: profileError } = await supabase
      .from('users')
      .insert(profileData as any); // Utiliser 'as any' pour les types complexes
      
    if (profileError && profileError.code !== '23505') { // 23505 = duplicate key (déjà créé)
      console.error('Erreur création profil:', profileError);
      throw profileError;
    }
    return profileData;
  };

  // Récupérer ou créer le profil utilisateur
  const fetchUserProfile = async (userData: Session['user']): Promise<Profile | null> => {
    if (!userData.id) return null;
    try {
      const { data: existingProfile, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', userData.id)
        .single();

      if (profileError && profileError.code !== 'PGRST116') {
        console.error('Erreur récupération profil:', profileError);
      }

      if (!existingProfile) {
        return await createUserProfile(userData);
      }
      return existingProfile;
    } catch (e) {
      console.error('Erreur lors du fetch/création du profil:', e);
      return null;
    }
  };

  // Mise à jour du profil
  const updateUserProfile = useCallback(async (updates: Partial<Profile>): Promise<Profile | null> => {
    try {
      if (!user?.id) throw new Error('Utilisateur non connecté');
      const { data, error } = await supabase
        .from('users')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id)
        .select()
        .single();
      
      if (error) throw error;
      setProfile(data as Profile);
      return data as Profile;
    } catch (e) {
      console.error('Erreur mise à jour profil:', e);
      setError('Échec de la mise à jour du profil.');
      return null;
    }
  }, [user]);

  // Écouteur d'état d'authentification
  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        const userProfile = await fetchUserProfile(session.user);
        setProfile(userProfile);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    // Récupération initiale de la session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        const userProfile = await fetchUserProfile(session.user);
        setProfile(userProfile);
      }
      setLoading(false);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  // Fonctions d'authentification
  const signIn = useCallback(async (email: string) => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ email });
    setLoading(false);
    if (error) {
      setError(error.message);
      throw error;
    }
  }, []);

  const signOut = useCallback(async () => {
    setLoading(true);
    const { error } = await supabase.auth.signOut();
    setLoading(false);
    if (error) {
      setError(error.message);
      throw error;
    }
  }, []);

  const value = useMemo(() => ({
    user,
    profile,
    loading,
    error,
    signIn,
    signOut,
    updateUserProfile,
  }), [user, profile, loading, error, signIn, signOut, updateUserProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
