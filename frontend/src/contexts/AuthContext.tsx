import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Session } from '@supabase/supabase-js';
import { Database } from '../lib/database.types';

// Utilisation de la table 'users' comme définie dans votre base de données
type Profile = Database['public']['Tables']['users']['Row'];

interface AuthContextType {
  user: Session['user'] | null;
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<{error: any | null}>;
  signInWithOtp: (email: string) => Promise<{error: any | null}>;
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
  const [user, setUser] = useState<Session['user'] | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * RÉCUPÉRATION OU CRÉATION DU PROFIL
   * Cette fonction s'assure que chaque utilisateur authentifié a une ligne dans la table 'users'
   */
  const fetchOrCreateProfile = async (userData: Session['user']) => {
    if (!userData) return null;
    
    try {
      // 1. Essayer de récupérer le profil existant
      const { data, error: fetchError } = await supabase
        .from('users')
        .select('*')
        .eq('id', userData.id)
        .single();

      if (data) return data;

      // 2. Si le profil n'existe pas (code PGRST116), on le crée
      if (fetchError && fetchError.code === 'PGRST116') {
        const { data: newProfile, error: insertError } = await supabase
          .from('users')
          .insert([{
            id: userData.id,
            email: userData.email || '',
            full_name: userData.user_metadata?.full_name || userData.user_metadata?.name || 'Utilisateur',
            avatar_url: userData.user_metadata?.avatar_url || null,
            subscription_plan: 'starter',
            role: 'user',
            subscription_status: 'active'
          }])
          .select()
          .single();

        if (insertError) throw insertError;
        return newProfile;
      }
      return null;
    } catch (err) {
      console.error("❌ Erreur lors de la gestion du profil:", err);
      return null;
    }
  };

  /**
   * CYCLE DE VIE DE L'AUTH
   */
  useEffect(() => {
    // Vérification initiale
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        const p = await fetchOrCreateProfile(session.user);
        setProfile(p);
      }
      setLoading(false);
    });

    // Écoute des changements (Login/Logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log(`🔔 Auth Event: ${event}`);
      if (session?.user) {
        setUser(session.user);
        const p = await fetchOrCreateProfile(session.user);
        setProfile(p);
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  /**
   * CONNEXION GOOGLE
   */
  const signInWithGoogle = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/dashboard`,
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account',
          },
        },
      });
      if (error) throw error;
      return { error: null };
    } catch (e: any) {
      setError(e.message);
      return { error: e };
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * CONNEXION PAR EMAIL (OTP)
   */
  const signInWithOtp = useCallback(async (email: string) => {
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
        }
      });
      if (error) throw error;
      return { error: null };
    } catch (e: any) {
      setError(e.message);
      return { error: e };
    } finally {
      setLoading(false);
    }
  }, []);

  const signOut = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setLoading(false);
  };

  const updateUserProfile = async (updates: Partial<Profile>) => {
    if (!user) return null;
    const { data, error } = await supabase
      .from('users')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', user.id)
      .select()
      .single();
    
    if (data) setProfile(data);
    return data;
  };

  const value = useMemo(() => ({
    user, profile, loading, error, signInWithGoogle, signInWithOtp, signOut, updateUserProfile
  }), [user, profile, loading, error, signInWithGoogle, signInWithOtp]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
