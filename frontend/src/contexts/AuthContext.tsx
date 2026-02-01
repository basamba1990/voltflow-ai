import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { supabase, validateEmailForAuth } from '@/lib/supabase';
import { Session } from '@supabase/supabase-js';
import { Database } from '@/lib/database.types';
import { toast } from 'sonner';

// Utiliser 'users' pour correspondre à la table réelle
type Profile = Database['public']['Tables']['users']['Row'];

interface AuthContextType {
  user: Session['user'] | null;
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string) => Promise<{error: any | null}>;
  signInWithGoogle: () => Promise<{error: any | null}>; // CHANGÉ : github → google
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
    // Récupérer les données Google
    const googleAvatar = userData.user_metadata?.avatar_url || userData.user_metadata?.picture;
    const googleFullName = userData.user_metadata?.full_name || userData.user_metadata?.name;
    const googleFirstName = userData.user_metadata?.first_name;
    const googleLastName = userData.user_metadata?.last_name;
    
    const profileData = {
      id: userData.id,
      email: userData.email || '',
      full_name: googleFullName || `${googleFirstName || ''} ${googleLastName || ''}`.trim() || null,
      first_name: googleFirstName || null,
      last_name: googleLastName || null,
      avatar_url: googleAvatar || null,
      phone: userData.user_metadata?.phone || null,
      country: userData.user_metadata?.country || null,
      city: userData.user_metadata?.city || null,
      company: userData.user_metadata?.company || null,
      address: userData.user_metadata?.address || null,
      role: userData.user_metadata?.role || 'user',
      subscription_plan: 'starter',
      simulations_used: 0,
      simulations_limit: 10,
      subscription_status: 'active',
      provider: userData.app_metadata?.provider || 'email', // Google, email, etc.
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    console.log('📝 Création du profil avec données Google:', {
      avatar: googleAvatar ? '✅ Présent' : '❌ Absent',
      fullName: profileData.full_name,
      provider: profileData.provider
    });

    const { error: profileError } = await supabase
      .from('users')
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
        .from('users')
        .select('*')
        .eq('id', userData.id)
        .single();

      if (profileError) {
        if (profileError.code === 'PGRST116') {
          console.log('Table users non trouvée, création...');
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
        .from('users')
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
        console.log('👤 Données utilisateur détectées:', {
          email: session.user.email,
          provider: session.user.app_metadata?.provider,
          hasAvatar: !!(session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture),
          metadata: session.user.user_metadata
        });
        
        const userProfile = await fetchUserProfile(session.user);
        setProfile(userProfile);
        
        // Afficher un toast pour les connexions réussies
        if (event === 'SIGNED_IN') {
          const userName = session.user.user_metadata?.full_name || 
                          session.user.user_metadata?.name || 
                          session.user.email?.split('@')[0];
          toast.success(`Bienvenue ${userName} !`, {
            description: session.user.app_metadata?.provider === 'google' 
              ? 'Connexion Google réussie' 
              : 'Connexion réussie',
            duration: 3000,
          });
        }
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

  // CORRECTION CRITIQUE : Connexion avec Google (remplace GitHub)
  const signInWithGoogle = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      console.log('🚀 Démarrage de la connexion Google OAuth...');
      
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google', // CORRECTION : 'google' au lieu de 'github'
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
            // Récupérer plus de données de Google
            scope: 'email profile openid',
          },
          skipBrowserRedirect: false,
        }
      });

      if (error) {
        console.error('❌ Erreur Google OAuth:', {
          message: error.message,
          name: error.name,
          status: error.status,
          details: error
        });
        
        // Messages d'erreur spécifiques
        let userMessage = error.message;
        if (error.message.includes('provider is not enabled')) {
          userMessage = 'Google OAuth n\'est pas activé dans Supabase. Activez-le dans le dashboard.';
        } else if (error.message.includes('invalid redirect_uri')) {
          userMessage = 'URL de redirection incorrecte. Vérifiez la configuration Google Cloud Console.';
        }
        
        setError(userMessage);
        toast.error(`Erreur Google: ${userMessage}`);
        return { error: new Error(userMessage) };
      }

      console.log('✅ Redirection Google initiée:', data);
      return { error: null };
      
    } catch (e: any) {
      console.error('❌ Exception inattendue Google OAuth:', e);
      const errorMessage = 'Erreur système lors de la connexion Google';
      setError(errorMessage);
      toast.error(errorMessage);
      return { error: e };
    } finally {
      setLoading(false);
    }
  }, []);

  // Fonction signIn avec validation d'email
  const signIn = useCallback(async (email: string) => {
    setLoading(true);
    setError(null);
    
    // VALIDATION CRITIQUE AVANT ENVOI
    const validation = validateEmailForAuth(email);
    if (!validation.valid) {
      setLoading(false);
      setError(validation.error || 'Email invalide');
      toast.error(validation.error || 'Email invalide');
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
        toast.error(`Erreur OTP: ${userMessage}`);
        console.error('❌ Erreur OTP détaillée:', {
          error,
          email: trimmedEmail,
          timestamp: new Date().toISOString()
        });
        return { error: new Error(userMessage) };
      }
      
      // Succès
      console.log('✅ OTP envoyé à:', trimmedEmail);
      toast.success('Email envoyé !', {
        description: 'Vérifiez votre boîte de réception pour le lien de connexion',
      });
      return { error: null };
      
    } catch (e: any) {
      setLoading(false);
      const errorMessage = e.message || 'Erreur inattendue lors de l\'envoi de l\'OTP';
      setError(errorMessage);
      toast.error(`Erreur: ${errorMessage}`);
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
      toast.error(`Erreur déconnexion: ${error.message}`);
      console.error('❌ Erreur signOut:', error);
      throw error;
    }
    setUser(null);
    setProfile(null);
    toast.success('Déconnexion réussie');
  }, []);

  const value = useMemo(() => ({
    user,
    profile,
    loading,
    error,
    signIn,
    signInWithGoogle, // CORRECTION : signInWithGithub → signInWithGoogle
    signOut,
    updateUserProfile,
  }), [user, profile, loading, error, signIn, signInWithGoogle, signOut, updateUserProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
