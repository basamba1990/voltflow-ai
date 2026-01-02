// FICHIER CORRIGÉ : frontend/src/contexts/AuthContext.tsx

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { supabase, validateEmailForAuth } from '../lib/supabase';
import { Session } from '@supabase/supabase-js';
import { Database } from '../lib/database.types';

// CORRECTION : Utiliser 'profiles' au lieu de 'users' pour correspondre à la table réelle
type Profile = Database['public']['Tables']['profiles']['Row'];

interface AuthContextType {
  user: Session['user'] | null;
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string) => Promise<{error: any | null}>;
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

  // Fonction pour créer un profil utilisateur
  const createUserProfile = async (userData: Session['user']): Promise<Profile> => {
    const profileData = {
      id: userData.id,
      email: userData.email || '',
      full_name: userData.user_metadata?.full_name || null,
      avatar_url: userData.user_metadata?.avatar_url || null,
      subscription_plan: 'free',
      simulations_used: 0,
      simulations_limit: 10,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error: profileError } = await supabase
      .from('profiles')
      .insert(profileData);
      
    if (profileError && profileError.code !== '23505') {
      console.error('❌ Erreur création profil:', profileError);
      throw profileError;
    }
    return profileData as Profile;
  };

  // Récupérer ou créer le profil utilisateur
  const fetchUserProfile = async (userData: Session['user']): Promise<Profile | null> => {
    if (!userData.id) return null;
    try {
      const { data: existingProfile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userData.id)
        .single();

      if (profileError) {
        if (profileError.code === 'PGRST116') {
          console.log('Table profiles non trouvée, création...');
          return await createUserProfile(userData);
        }
        console.error('❌ Erreur récupération profil:', profileError);
        return null;
      }
      return existingProfile;
    } catch (e: any) {
      console.error('❌ Erreur lors du fetch/création du profil:', e);
      return null;
    }
  };

  // Mise à jour du profil
  const updateUserProfile = useCallback(async (updates: Partial<Profile>): Promise<Profile | null> => {
    try {
      if (!user?.id) throw new Error('Utilisateur non connecté');
      const { data, error } = await supabase
        .from('profiles')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id)
        .select()
        .single();
      
      if (error) throw error;
      setProfile(data);
      return data;
    } catch (e: any) {
      console.error('❌ Erreur mise à jour profil:', e);
      setError('Échec de la mise à jour du profil.');
      return null;
    }
  }, [user]);

  // Écouteur d'état d'authentification
  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log(`🔑 Événement auth: ${event}`, session ? 'Session présente' : 'Session absente');
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        const userProfile = await fetchUserProfile(session.user);
        setProfile(userProfile);
      } else {
        setProfile(null);
      }
      setLoading(false);
      setError(null);
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

  // CORRECTION CRITIQUE : Fonction signIn avec validation d'email
  const signIn = useCallback(async (email: string) => {
    setLoading(true);
    setError(null);
    
    // VALIDATION CRITIQUE AVANT ENVOI
    const validation = validateEmailForAuth(email);
    if (!validation.valid) {
      setLoading(false);
      setError(validation.error || 'Email invalide');
      console.error('❌ Email invalide pour OTP:', email);
      return { error: new Error(validation.error) };
    }
    
    const trimmedEmail = email.trim().toLowerCase();
    
    try {
      // Configuration CORRECTE de l'OTP
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmedEmail,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            email: trimmedEmail,
            created_at: new Date().toISOString()
          }
        }
      });
      
      setLoading(false);
      
      if (error) {
        let userMessage = error.message;
        
        if (error.message.includes('rate limit') || error.message.includes('429')) {
          userMessage = 'Trop de tentatives. Veuillez patienter quelques minutes.';
        } else if (error.message.includes('disabled')) {
          userMessage = 'L\'authentification par email est désactivée.';
        } else if (error.message.includes('invalid format')) {
          userMessage = 'Format d\'email invalide.';
        }
        
        setError(userMessage);
        console.error('❌ Erreur OTP détaillée:', {
          error,
          email: trimmedEmail,
          timestamp: new Date().toISOString()
        });
        return { error: new Error(userMessage) };
      }
      
      // Succès
      console.log('✅ OTP envoyé à:', trimmedEmail);
      return { error: null };
      
    } catch (e: any) {
      setLoading(false);
      const errorMessage = e.message || 'Erreur inattendue lors de l\'envoi de l\'OTP';
      setError(errorMessage);
      console.error('❌ Exception OTP:', e);
      return { error: new Error(errorMessage) };
    }
  }, []);

  const signOut = useCallback(async () => {
    setLoading(true);
    const { error } = await supabase.auth.signOut();
    setLoading(false);
    if (error) {
      setError(error.message);
      console.error('❌ Erreur signOut:', error);
      throw error;
    }
    setUser(null);
    setProfile(null);
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
