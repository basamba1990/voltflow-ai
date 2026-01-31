import React, { useState, useEffect } from 'react';
import { useLocation, Link } from 'wouter';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { 
  Mail, 
  Lock, 
  User, 
  Phone, 
  MapPin, 
  Globe, 
  Eye, 
  EyeOff, 
  AlertCircle,
  Loader2,
  Smartphone,
  Building,
  FileText
} from 'lucide-react';

// Components
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Liste des pays (simplifiée)
const COUNTRIES = [
  { code: 'FR', name: 'France' },
  { code: 'BE', name: 'Belgique' },
  { code: 'CH', name: 'Suisse' },
  { code: 'CA', name: 'Canada' },
  { code: 'US', name: 'États-Unis' },
  { code: 'GB', name: 'Royaume-Uni' },
  { code: 'DE', name: 'Allemagne' },
  { code: 'ES', name: 'Espagne' },
  { code: 'IT', name: 'Italie' },
  { code: 'MA', name: 'Maroc' },
  { code: 'TN', name: 'Tunisie' },
  { code: 'DZ', name: 'Algérie' },
  { code: 'SN', name: 'Sénégal' },
  { code: 'CI', name: 'Côte d\'Ivoire' },
  { code: 'CM', name: 'Cameroun' },
  { code: 'OTHER', name: 'Autre pays' }
];

export default function Login() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<'login' | 'signup'>('login');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // États pour le formulaire d'inscription
  const [signupForm, setSignupForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    country: '',
    city: '',
    address: '',
    company: '',
    role: 'engineer' as 'engineer' | 'student' | 'researcher' | 'professional' | 'other'
  });

  // États pour le formulaire de connexion
  const [loginForm, setLoginForm] = useState({
    email: '',
    password: ''
  });

  // Vérifier si l'utilisateur est déjà connecté
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setLocation('/dashboard');
      }
    };
    checkAuth();

    // Écouter les changements d'authentification
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        setLocation('/dashboard');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [setLocation]);

  // 🔐 INSCRIPTION AVEC EMAIL ET MOT DE PASSE
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    // Validation des champs
    if (!signupForm.firstName.trim() || !signupForm.lastName.trim()) {
      setError('Le nom et prénom sont requis');
      return;
    }

    if (!signupForm.email.trim()) {
      setError('L\'email est requis');
      return;
    }

    if (!signupForm.password) {
      setError('Le mot de passe est requis');
      return;
    }

    if (signupForm.password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères');
      return;
    }

    if (signupForm.password !== signupForm.confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }

    setIsLoading(true);

    try {
      console.log('📝 Tentative d\'inscription avec:', signupForm.email);
      
      const { data, error } = await supabase.auth.signUp({
        email: signupForm.email,
        password: signupForm.password,
        options: {
          data: {
            first_name: signupForm.firstName.trim(),
            last_name: signupForm.lastName.trim(),
            phone: signupForm.phone || null,
            country: signupForm.country || null,
            city: signupForm.city || null,
            address: signupForm.address || null,
            company: signupForm.company || null,
            role: signupForm.role,
            full_name: `${signupForm.firstName.trim()} ${signupForm.lastName.trim()}`,
            signup_date: new Date().toISOString()
          },
          emailRedirectTo: `${window.location.origin}/auth/callback`
        }
      });

      if (error) {
        console.error('❌ Erreur d\'inscription:', error);
        
        let errorMessage = error.message;
        if (error.message.includes('already registered')) {
          errorMessage = 'Cet email est déjà utilisé. Connectez-vous ou utilisez un autre email.';
        } else if (error.message.includes('Invalid email')) {
          errorMessage = 'Adresse email invalide.';
        } else if (error.message.includes('Password should be at least')) {
          errorMessage = 'Le mot de passe doit contenir au moins 6 caractères.';
        } else if (error.message.includes('rate limit')) {
          errorMessage = 'Trop de tentatives. Veuillez réessayer dans quelques minutes.';
        }
        
        setError(errorMessage);
        toast.error(`❌ ${errorMessage}`);
        return;
      }

      console.log('✅ Inscription réussie:', data);
      
      if (data.user && data.user.identities && data.user.identities.length === 0) {
        // Utilisateur déjà existant
        toast.info('📧 Compte existant', {
          description: 'Cet email est déjà associé à un compte. Essayez de vous connecter.'
        });
        setActiveTab('login');
        setLoginForm(prev => ({ ...prev, email: signupForm.email }));
      } else if (data.user) {
        // Nouvel utilisateur
        toast.success('🎉 Inscription réussie !', {
          description: 'Un email de confirmation vous a été envoyé. Vérifiez votre boîte de réception.'
        });
        
        // Réinitialiser le formulaire
        setSignupForm({
          firstName: '',
          lastName: '',
          email: '',
          password: '',
          confirmPassword: '',
          phone: '',
          country: '',
          city: '',
          address: '',
          company: '',
          role: 'engineer'
        });
        
        // Basculer vers l'onglet connexion
        setActiveTab('login');
        setLoginForm({ email: signupForm.email, password: '' });
      }

    } catch (error: any) {
      console.error('❌ Erreur inattendue:', error);
      setError('Une erreur inattendue est survenue. Veuillez réessayer.');
      toast.error('❌ Erreur lors de l\'inscription');
    } finally {
      setIsLoading(false);
    }
  };

  // 🔐 CONNEXION AVEC EMAIL ET MOT DE PASSE
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (!loginForm.email.trim() || !loginForm.password) {
      setError('L\'email et le mot de passe sont requis');
      return;
    }

    setIsLoading(true);

    try {
      console.log('🔐 Tentative de connexion avec:', loginForm.email);
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginForm.email,
        password: loginForm.password
      });

      if (error) {
        console.error('❌ Erreur de connexion:', error);
        
        let errorMessage = error.message;
        if (error.message.includes('Invalid login credentials')) {
          errorMessage = 'Email ou mot de passe incorrect.';
        } else if (error.message.includes('Email not confirmed')) {
          errorMessage = 'Veuillez confirmer votre email avant de vous connecter.';
        } else if (error.message.includes('rate limit')) {
          errorMessage = 'Trop de tentatives. Veuillez réessayer dans quelques minutes.';
        }
        
        setError(errorMessage);
        toast.error(`❌ ${errorMessage}`);
        return;
      }

      console.log('✅ Connexion réussie:', data);
      
      toast.success('✅ Connexion réussie !', {
        description: `Bon retour, ${data.user?.user_metadata?.first_name || 'Utilisateur'} !`
      });

      // La redirection se fera automatiquement via onAuthStateChange
      
    } catch (error: any) {
      console.error('❌ Erreur inattendue:', error);
      setError('Une erreur inattendue est survenue. Veuillez réessayer.');
      toast.error('❌ Erreur lors de la connexion');
    } finally {
      setIsLoading(false);
    }
  };

  // 🔵 CONNEXION AVEC GOOGLE
  const handleGoogleLogin = async () => {
    setError(null);
    
    try {
      console.log('🔵 Tentative de connexion Google...');
      
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent'
          }
        }
      });

      if (error) {
        console.error('❌ Erreur Google OAuth:', error);
        setError('Erreur lors de la connexion avec Google. Veuillez réessayer.');
        toast.error('❌ Erreur de connexion Google');
        return;
      }

      toast.success('🔵 Connexion Google en cours...');
      
    } catch (error: any) {
      console.error('❌ Erreur inattendue Google:', error);
      setError('Une erreur inattendue est survenue.');
      toast.error('❌ Erreur lors de la connexion Google');
    }
  };

  // 🔄 MÉTHODE DE RÉINITIALISATION DE MOT DE PASSE
  const handleForgotPassword = async () => {
    if (!loginForm.email.trim()) {
      toast.error('Veuillez saisir votre email pour réinitialiser le mot de passe');
      return;
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(loginForm.email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });

      if (error) {
        toast.error(`❌ Erreur: ${error.message}`);
        return;
      }

      toast.success('📧 Email de réinitialisation envoyé', {
        description: 'Vérifiez votre boîte de réception'
      });
    } catch (error) {
      toast.error('❌ Erreur lors de l\'envoi de l\'email');
    }
  };

  // VALIDATION DU NUMÉRO DE TÉLÉPHONE
  const validatePhoneNumber = (phone: string): boolean => {
    // Validation simple - vous pouvez ajouter une logique plus complexe
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    return phone === '' || phoneRegex.test(phone.replace(/\s+/g, ''));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            <span className="text-blue-500">Volt</span>
            <span className="text-cyan-400">Flow</span>
            <span className="text-white"> AI</span>
          </h1>
          <p className="text-gray-400">Simulations thermiques industrielles avancées</p>
        </div>

        <Card className="bg-gray-900/50 border-gray-800 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-2xl text-white text-center">
              {activeTab === 'login' ? 'Connexion à votre compte' : 'Créer un compte'}
            </CardTitle>
            <CardDescription className="text-gray-400 text-center">
              {activeTab === 'login' 
                ? 'Accédez à vos simulations et modèles thermiques' 
                : 'Commencez votre essai gratuit avec toutes les fonctionnalités'}
            </CardDescription>
          </CardHeader>

          <CardContent>
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
              <TabsList className="grid grid-cols-2 mb-6 bg-gray-800">
                <TabsTrigger value="login" className="data-[state=active]:bg-blue-600">
                  Connexion
                </TabsTrigger>
                <TabsTrigger value="signup" className="data-[state=active]:bg-blue-600">
                  Inscription
                </TabsTrigger>
              </TabsList>

              {/* Messages d'erreur */}
              {error && (
                <Alert variant="destructive" className="mb-6 bg-red-900/20 border-red-800">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {/* Onglet CONNEXION */}
              <TabsContent value="login">
                <div className="space-y-6">
                  <div className="text-center mb-4">
                    <p className="text-sm text-gray-400 mb-2">
                      <span className="text-green-500 font-semibold">✔ Méthode recommandée</span> - Pas de liens cliquables, sécurité maximale
                    </p>
                  </div>

                  {/* Formulaire de connexion */}
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="login-email" className="text-gray-300">
                        <Mail className="inline w-4 h-4 mr-2" />
                        Adresse email
                      </Label>
                      <Input
                        id="login-email"
                        type="email"
                        placeholder="votre@email.com"
                        value={loginForm.email}
                        onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                        className="bg-gray-800 border-gray-700 text-white"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <Label htmlFor="login-password" className="text-gray-300">
                          <Lock className="inline w-4 h-4 mr-2" />
                          Mot de passe
                        </Label>
                        <button
                          type="button"
                          onClick={handleForgotPassword}
                          className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                        >
                          Mot de passe oublié ?
                        </button>
                      </div>
                      <div className="relative">
                        <Input
                          id="login-password"
                          type={showPassword ? 'text' : 'password'}
                          placeholder="••••••••"
                          value={loginForm.password}
                          onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                          className="bg-gray-800 border-gray-700 text-white pr-10"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-300"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <Button
                      type="submit"
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Connexion en cours...
                        </>
                      ) : (
                        'Se connecter'
                      )}
                    </Button>
                  </form>

                  <Separator className="my-6 bg-gray-700" />

                  {/* Options de connexion alternatives */}
                  <div className="space-y-3">
                    <div className="text-center">
                      <p className="text-sm text-gray-400 mb-3">Ou connectez-vous avec</p>
                    </div>

                    {/* Bouton Google */}
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full bg-gray-800 hover:bg-gray-700 border-gray-700 text-white"
                      onClick={handleGoogleLogin}
                      disabled={isLoading}
                    >
                      <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                        <path
                          fill="currentColor"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="currentColor"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="currentColor"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        />
                        <path
                          fill="currentColor"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        />
                      </svg>
                      Continuer avec Google
                    </Button>
                  </div>
                </div>
              </TabsContent>

              {/* Onglet INSCRIPTION */}
              <TabsContent value="signup">
                <div className="space-y-6">
                  {/* Guide d'inscription */}
                  <Alert className="bg-blue-900/20 border-blue-800">
                    <AlertDescription className="text-sm">
                      <p className="font-semibold mb-1">💡 Pourquoi créer un compte ?</p>
                      <ul className="list-disc list-inside space-y-1 text-blue-300">
                        <li>Accès illimité aux simulations thermiques</li>
                        <li>Sauvegarde automatique de vos projets</li>
                        <li>Export de données et rapports</li>
                        <li>Support technique prioritaire</li>
                      </ul>
                    </AlertDescription>
                  </Alert>

                  {/* Formulaire d'inscription */}
                  <form onSubmit={handleSignup} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="signup-firstname" className="text-gray-300">
                          <User className="inline w-4 h-4 mr-2" />
                          Prénom *
                        </Label>
                        <Input
                          id="signup-firstname"
                          type="text"
                          placeholder="Jean"
                          value={signupForm.firstName}
                          onChange={(e) => setSignupForm({ ...signupForm, firstName: e.target.value })}
                          className="bg-gray-800 border-gray-700 text-white"
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="signup-lastname" className="text-gray-300">
                          <User className="inline w-4 h-4 mr-2" />
                          Nom *
                        </Label>
                        <Input
                          id="signup-lastname"
                          type="text"
                          placeholder="Dupont"
                          value={signupForm.lastName}
                          onChange={(e) => setSignupForm({ ...signupForm, lastName: e.target.value })}
                          className="bg-gray-800 border-gray-700 text-white"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signup-email" className="text-gray-300">
                        <Mail className="inline w-4 h-4 mr-2" />
                        Adresse email *
                      </Label>
                      <Input
                        id="signup-email"
                        type="email"
                        placeholder="jean.dupont@entreprise.com"
                        value={signupForm.email}
                        onChange={(e) => setSignupForm({ ...signupForm, email: e.target.value })}
                        className="bg-gray-800 border-gray-700 text-white"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="signup-password" className="text-gray-300">
                          <Lock className="inline w-4 h-4 mr-2" />
                          Mot de passe *
                        </Label>
                        <div className="relative">
                          <Input
                            id="signup-password"
                            type={showPassword ? 'text' : 'password'}
                            placeholder="••••••••"
                            value={signupForm.password}
                            onChange={(e) => setSignupForm({ ...signupForm, password: e.target.value })}
                            className="bg-gray-800 border-gray-700 text-white pr-10"
                            required
                            minLength={6}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-300"
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        <p className="text-xs text-gray-500">Minimum 6 caractères</p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="signup-confirm-password" className="text-gray-300">
                          <Lock className="inline w-4 h-4 mr-2" />
                          Confirmer le mot de passe *
                        </Label>
                        <Input
                          id="signup-confirm-password"
                          type={showPassword ? 'text' : 'password'}
                          placeholder="••••••••"
                          value={signupForm.confirmPassword}
                          onChange={(e) => setSignupForm({ ...signupForm, confirmPassword: e.target.value })}
                          className="bg-gray-800 border-gray-700 text-white"
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="signup-phone" className="text-gray-300">
                          <Phone className="inline w-4 h-4 mr-2" />
                          Numéro de téléphone
                        </Label>
                        <Input
                          id="signup-phone"
                          type="tel"
                          placeholder="+33 1 23 45 67 89"
                          value={signupForm.phone}
                          onChange={(e) => setSignupForm({ ...signupForm, phone: e.target.value })}
                          className="bg-gray-800 border-gray-700 text-white"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="signup-role" className="text-gray-300">
                          <User className="inline w-4 h-4 mr-2" />
                          Rôle professionnel
                        </Label>
                        <Select
                          value={signupForm.role}
                          onValueChange={(value: any) => setSignupForm({ ...signupForm, role: value })}
                        >
                          <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                            <SelectValue placeholder="Sélectionner" />
                          </SelectTrigger>
                          <SelectContent className="bg-gray-800 border-gray-700">
                            <SelectItem value="engineer">Ingénieur</SelectItem>
                            <SelectItem value="student">Étudiant</SelectItem>
                            <SelectItem value="researcher">Chercheur</SelectItem>
                            <SelectItem value="professional">Professionnel</SelectItem>
                            <SelectItem value="other">Autre</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="signup-country" className="text-gray-300">
                          <Globe className="inline w-4 h-4 mr-2" />
                          Pays
                        </Label>
                        <Select
                          value={signupForm.country}
                          onValueChange={(value) => setSignupForm({ ...signupForm, country: value })}
                        >
                          <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                            <SelectValue placeholder="Sélectionner un pays" />
                          </SelectTrigger>
                          <SelectContent className="bg-gray-800 border-gray-700 max-h-[200px]">
                            {COUNTRIES.map((country) => (
                              <SelectItem key={country.code} value={country.code}>
                                {country.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="signup-city" className="text-gray-300">
                          <MapPin className="inline w-4 h-4 mr-2" />
                          Ville
                        </Label>
                        <Input
                          id="signup-city"
                          type="text"
                          placeholder="Paris"
                          value={signupForm.city}
                          onChange={(e) => setSignupForm({ ...signupForm, city: e.target.value })}
                          className="bg-gray-800 border-gray-700 text-white"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signup-company" className="text-gray-300">
                        <Building className="inline w-4 h-4 mr-2" />
                        Entreprise / Organisation
                      </Label>
                      <Input
                        id="signup-company"
                        type="text"
                        placeholder="Nom de votre entreprise"
                        value={signupForm.company}
                        onChange={(e) => setSignupForm({ ...signupForm, company: e.target.value })}
                        className="bg-gray-800 border-gray-700 text-white"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signup-address" className="text-gray-300">
                        <MapPin className="inline w-4 h-4 mr-2" />
                        Adresse
                      </Label>
                      <Input
                        id="signup-address"
                        type="text"
                        placeholder="123 rue de l'Exemple, 75000 Paris"
                        value={signupForm.address}
                        onChange={(e) => setSignupForm({ ...signupForm, address: e.target.value })}
                        className="bg-gray-800 border-gray-700 text-white"
                      />
                    </div>

                    {/* Conditions d'utilisation */}
                    <div className="flex items-start space-x-2 text-sm">
                      <input
                        type="checkbox"
                        id="terms"
                        required
                        className="mt-1 bg-gray-800 border-gray-700"
                      />
                      <label htmlFor="terms" className="text-gray-400">
                        J'accepte les{' '}
                        <Link href="/terms" className="text-blue-400 hover:text-blue-300">
                          conditions d'utilisation
                        </Link>{' '}
                        et la{' '}
                        <Link href="/privacy" className="text-blue-400 hover:text-blue-300">
                          politique de confidentialité
                        </Link>
                      </label>
                    </div>

                    <Button
                      type="submit"
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Création du compte...
                        </>
                      ) : (
                        'Créer mon compte gratuit'
                      )}
                    </Button>
                  </form>

                  <Separator className="my-6 bg-gray-700" />

                  <div className="text-center">
                    <p className="text-sm text-gray-400">
                      Déjà un compte ?{' '}
                      <button
                        type="button"
                        onClick={() => setActiveTab('login')}
                        className="text-blue-400 hover:text-blue-300 font-medium"
                      >
                        Se connecter
                      </button>
                    </p>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>

          <CardFooter className="flex flex-col space-y-4 border-t border-gray-800 pt-6">
            <div className="text-center space-y-2">
              <p className="text-sm text-gray-400">
                En vous connectant, vous acceptez nos{' '}
                <Link href="/terms" className="text-blue-400 hover:text-blue-300">
                  Conditions d'utilisation
                </Link>
              </p>
              <p className="text-xs text-gray-500">
                © 2024 VoltFlow AI. Tous droits réservés.
              </p>
            </div>
            
            {/* Lien de retour */}
            <div className="text-center">
              <Link href="/">
                <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
                  ← Retour à l'accueil
                </Button>
              </Link>
            </div>
          </CardFooter>
        </Card>

        {/* Guide d'authentification */}
        <Card className="mt-6 bg-gray-900/50 border-gray-800 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-white">📚 Guide d'authentification</CardTitle>
            <CardDescription className="text-gray-400">
              Choisissez la méthode la plus adaptée à votre cas
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="p-4 bg-green-900/20 rounded-lg border border-green-800/50">
                <h3 className="font-semibold text-green-400 mb-2">
                  <span className="inline-flex items-center">
                    <Mail className="w-4 h-4 mr-2" />
                    Email & Mot de passe (Recommandé)
                  </span>
                </h3>
                <p className="text-sm text-gray-300">
                  <strong>Le plus fiable</strong> - Méthode classique qui ne dépend pas de liens cliquables pouvant être "mangés" par des bots.
                  Utilisez cette méthode pour une sécurité maximale et une expérience stable sur tous les appareils.
                </p>
                <div className="mt-2 text-xs text-gray-400">
                  <span className="font-semibold">Configuration requise :</span> Activer "Email Provider" dans Supabase Auth
                </div>
              </div>

              <div className="p-4 bg-blue-900/20 rounded-lg border border-blue-800/50">
                <h3 className="font-semibold text-blue-400 mb-2">
                  <span className="inline-flex items-center">
                    <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
                      <path fill="currentColor" d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z"/>
                      <path fill="white" d="M12 5l3.09 6.26L22 12l-5.91 2.74L12 19l-3.09-6.26L2 12l5.91-2.74L12 5z"/>
                    </svg>
                    Google OAuth (Fluide sur Android)
                  </span>
                </h3>
                <p className="text-sm text-gray-300">
                  <strong>Plus fluide sur Android</strong> - Si vous utilisez Android (détecté dans vos logs), la connexion Google est souvent plus rapide 
                  car votre téléphone est déjà connecté au compte Google. Idéal pour une expérience "one-click".
                </p>
                <div className="mt-2 text-xs text-gray-400">
                  <span className="font-semibold">Configuration :</span> Activer "Google OAuth" dans Supabase Auth avec vos identifiants Google Cloud
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
