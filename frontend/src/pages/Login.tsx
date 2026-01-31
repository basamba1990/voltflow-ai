import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { 
  Mail, Lock, User, MapPin, Globe, Phone, 
  LogIn, UserPlus, Chrome, Loader2, AlertCircle,
  Github, Image as ImageIcon
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';

export default function Login() {
  const [, setLocation] = useLocation();
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'login' | 'register'>('login');

  // États pour le formulaire
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    phone: '',
    country: '',
    city: '',
    company: '',
    address: ''
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.id]: e.target.value });
  };

  // --- MÉTHODE A : EMAIL & MOT DE PASSE (LOGIN) ---
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      });
      if (error) throw error;
      toast.success("Connexion réussie");
      setLocation('/dashboard');
    } catch (error: any) {
      toast.error(error.message || "Erreur de connexion");
    } finally {
      setLoading(false);
    }
  };

  // --- MÉTHODE A : INSCRIPTION COMPLÈTE ---
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            first_name: formData.firstName,
            last_name: formData.lastName,
            phone: formData.phone,
            country: formData.country,
            city: formData.city,
            company: formData.company,
            address: formData.address,
            full_name: `${formData.firstName} ${formData.lastName}`.trim()
          },
          emailRedirectTo: `${window.location.origin}/auth/callback`
        }
      });
      if (error) throw error;
      toast.success("Inscription réussie ! Vérifiez vos emails.");
      setView('login');
    } catch (error: any) {
      toast.error(error.message || "Erreur d'inscription");
    } finally {
      setLoading(false);
    }
  };

  // --- MÉTHODE B : GOOGLE OAUTH (CORRIGÉ) ---
  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      console.log('🚀 Démarrage de la connexion Google OAuth...');
      
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google', // CORRECTION ICI : 'google' au lieu de 'github'
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
            // Récupérer plus de données de Google
            scope: 'email profile openid',
          },
          // Récupérer les informations utilisateur complètes
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
        
        toast.error(`Erreur Google: ${userMessage}`, {
          description: 'Vérifiez la configuration OAuth dans Supabase',
          duration: 10000,
        });
        return;
      }

      console.log('✅ Redirection Google initiée:', data);
      toast.success('Redirection vers Google...');
      
    } catch (error: any) {
      console.error('❌ Exception inattendue Google OAuth:', error);
      toast.error("Erreur système lors de la connexion Google", {
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  // --- FONCTION POUR RÉCUPÉRER LES DONNÉES GOOGLE ---
  const fetchGoogleUserData = async () => {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      
      if (error) throw error;
      
      if (user && user.app_metadata?.provider === 'google') {
        console.log('📸 Informations utilisateur Google:', {
          // Informations de base
          email: user.email,
          emailVerified: user.email_confirmed_at,
          
          // Métadonnées Google
          fullName: user.user_metadata?.full_name || user.user_metadata?.name,
          firstName: user.user_metadata?.first_name,
          lastName: user.user_metadata?.last_name,
          
          // Photo de profil Google
          avatarUrl: user.user_metadata?.avatar_url || user.user_metadata?.picture,
          
          // Localisation
          locale: user.user_metadata?.locale,
          
          // Données spécifiques Google
          googleId: user.user_metadata?.sub,
          provider: user.app_metadata?.provider,
          
          // Vérifier la présence de l'avatar
          hasAvatar: !!(user.user_metadata?.avatar_url || user.user_metadata?.picture)
        });
        
        // Exemple : Afficher la photo dans la console pour débogage
        if (user.user_metadata?.avatar_url) {
          console.log('🖼️ URL de l\'avatar Google:', user.user_metadata.avatar_url);
        }
        
        return user;
      }
    } catch (error) {
      console.error('❌ Erreur récupération données Google:', error);
    }
    return null;
  };

  // --- BOUTON "MOT DE PASSE OUBLIÉ" ---
  const handleForgotPassword = async () => {
    if (!formData.email) {
      toast.error('Veuillez saisir votre email');
      return;
    }
    
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(formData.email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });
      
      if (error) throw error;
      toast.success('Email de réinitialisation envoyé !');
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de l\'envoi');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-4">
      <Card className="w-full max-w-lg bg-zinc-900 border-zinc-800 text-white">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold tracking-tight">
            <span className="text-blue-500">Volt</span>
            <span className="text-cyan-400">Flow</span>
            <span className="text-white"> AI</span>
          </CardTitle>
          <CardDescription className="text-zinc-400">
            Plateforme de simulation thermique avancée
          </CardDescription>
        </CardHeader>
        
        <Tabs defaultValue="login" value={view} onValueChange={(v) => setView(v as any)} className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-zinc-800">
            <TabsTrigger value="login">Connexion</TabsTrigger>
            <TabsTrigger value="register">Inscription</TabsTrigger>
          </TabsList>

          {/* FORMULAIRE DE CONNEXION */}
          <TabsContent value="login">
            <form onSubmit={handleLogin}>
              <CardContent className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-zinc-500" />
                    <Input 
                      id="email" 
                      type="email" 
                      placeholder="nom@exemple.com" 
                      className="pl-10 bg-zinc-800 border-zinc-700" 
                      required 
                      value={formData.email}
                      onChange={handleInputChange} 
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label htmlFor="password">Mot de passe</Label>
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      Mot de passe oublié ?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-zinc-500" />
                    <Input 
                      id="password" 
                      type="password" 
                      className="pl-10 bg-zinc-800 border-zinc-700" 
                      required 
                      value={formData.password}
                      onChange={handleInputChange} 
                    />
                  </div>
                </div>
                <Button className="w-full bg-blue-600 hover:bg-blue-700" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Se connecter
                </Button>
              </CardContent>
            </form>
          </TabsContent>

          {/* FORMULAIRE D'INSCRIPTION COMPLÈTE */}
          <TabsContent value="register">
            <form onSubmit={handleRegister}>
              <CardContent className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">Prénom *</Label>
                    <Input 
                      id="firstName" 
                      placeholder="Jean" 
                      className="bg-zinc-800 border-zinc-700" 
                      required 
                      value={formData.firstName}
                      onChange={handleInputChange} 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Nom *</Label>
                    <Input 
                      id="lastName" 
                      placeholder="Dupont" 
                      className="bg-zinc-800 border-zinc-700" 
                      required 
                      value={formData.lastName}
                      onChange={handleInputChange} 
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email professionnel *</Label>
                  <Input 
                    id="email" 
                    type="email" 
                    placeholder="jean@entreprise.com" 
                    className="bg-zinc-800 border-zinc-700" 
                    required 
                    value={formData.email}
                    onChange={handleInputChange} 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company">Entreprise</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 h-4 w-4 text-zinc-500" />
                    <Input 
                      id="company" 
                      type="text" 
                      placeholder="Nom de votre entreprise" 
                      className="pl-10 bg-zinc-800 border-zinc-700" 
                      value={formData.company}
                      onChange={handleInputChange} 
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Numéro de téléphone</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 h-4 w-4 text-zinc-500" />
                    <Input 
                      id="phone" 
                      type="tel" 
                      placeholder="+221 77 123 45 67" 
                      className="pl-10 bg-zinc-800 border-zinc-700" 
                      value={formData.phone}
                      onChange={handleInputChange} 
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="country">Pays</Label>
                    <Input 
                      id="country" 
                      placeholder="Sénégal" 
                      className="bg-zinc-800 border-zinc-700" 
                      value={formData.country}
                      onChange={handleInputChange} 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="city">Ville</Label>
                    <Input 
                      id="city" 
                      placeholder="Dakar" 
                      className="bg-zinc-800 border-zinc-700" 
                      value={formData.city}
                      onChange={handleInputChange} 
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Adresse</Label>
                  <Input 
                    id="address" 
                    placeholder="123 Rue de l'Exemple" 
                    className="bg-zinc-800 border-zinc-700" 
                    value={formData.address}
                    onChange={handleInputChange} 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Mot de passe sécurisé *</Label>
                  <Input 
                    id="password" 
                    type="password" 
                    className="bg-zinc-800 border-zinc-700" 
                    required 
                    minLength={6}
                    value={formData.password}
                    onChange={handleInputChange} 
                  />
                  <p className="text-xs text-zinc-500">Minimum 6 caractères</p>
                </div>
                <Button className="w-full bg-green-600 hover:bg-green-700" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Créer mon compte
                </Button>
                
                <div className="text-center text-sm text-zinc-500">
                  <p>En créant un compte, vous acceptez nos conditions d'utilisation.</p>
                </div>
              </CardContent>
            </form>
          </TabsContent>
        </Tabs>

        <div className="px-6 pb-6">
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-zinc-800"></span>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-zinc-900 px-2 text-zinc-500">Ou continuer avec</span>
            </div>
          </div>
          
          {/* BOUTON GOOGLE (SEULEMENT CELUI-LÀ DOIT ÊTRE ACTIF) */}
          <Button 
            variant="outline" 
            className="w-full border-zinc-700 hover:bg-zinc-800 text-white mb-3"
            onClick={handleGoogleLogin}
            disabled={loading}
          >
            <Chrome className="mr-2 h-4 w-4" /> 
            {loading ? 'Connexion en cours...' : 'Google'}
          </Button>
          
          {/* NOTE INFORMATIVE POUR GITHUB */}
          <div className="text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-900/30 rounded-full border border-amber-800/50">
              <AlertCircle className="h-3 w-3 text-amber-400" />
              <p className="text-xs text-amber-300">
                GitHub OAuth nécessite une configuration supplémentaire
              </p>
            </div>
          </div>
          
          {/* GUIDE RAPIDE */}
          <div className="mt-4 p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
            <h4 className="text-sm font-semibold text-zinc-300 mb-2 flex items-center gap-2">
              <ImageIcon className="h-3 w-3" />
              Google OAuth inclut automatiquement :
            </h4>
            <ul className="text-xs text-zinc-400 space-y-1">
              <li>✅ Photo de profil Google</li>
              <li>✅ Nom complet et email vérifié</li>
              <li>✅ Connexion rapide (1 clic sur Android)</li>
              <li>✅ Sécurité maximale avec 2FA Google</li>
            </ul>
          </div>
        </div>
        
        <CardFooter className="border-t border-zinc-800 pt-4">
          <div className="text-center w-full text-sm text-zinc-500">
            <p>Besoin d'aide ? <a href="mailto:support@voltflow.ai" className="text-blue-400 hover:text-blue-300">Contactez le support</a></p>
            <p className="text-xs mt-1">© 2024 VoltFlow AI. Tous droits réservés.</p>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
