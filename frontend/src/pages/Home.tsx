import { Button } from "@/components/ui/button";
import { ArrowRight, Zap, Layers, BarChart3, Shield, Rocket, Users, Loader2, Chrome } from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase"; // AJOUT IMPORTANT

/**
 * VoltFlow AI - Landing Page
 * Design: Neon-Noir Cinématique
 * Palette: Rose vif (accent), Bleu électrique, Fond bleu marine profond
 */

export default function Home() {
  const [hoveredPlan, setHoveredPlan] = useState<string | null>(null);
  const { user, loading: authLoading } = useAuth(); // SUPPRIMEZ signInWithGithub
  const [, setLocation] = useLocation();
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false); // NOUVEAU ÉTAT

  // Vérifier si l'utilisateur est déjà connecté
  useEffect(() => {
    if (user && !authLoading) {
      // Rediriger vers le dashboard si déjà connecté
      setLocation('/dashboard');
    }
  }, [user, authLoading, setLocation]);

  const plans = [
    // ... (gardez votre tableau plans inchangé)
  ];

  const features = [
    // ... (gardez votre tableau features inchangé)
  ];

  // 🔥 NOUVELLE FONCTION POUR GOOGLE OAUTH
  const handleGoogleSignIn = async () => {
    try {
      setIsGoogleLoading(true);
      console.log('🚀 Tentative de connexion Google depuis Home...');
      
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
            scope: 'email profile openid',
          }
        }
      });

      if (error) {
        console.error('❌ Erreur Google OAuth:', error);
        
        let userMessage = 'Erreur lors de la connexion.';
        if (error.message.includes('provider is not enabled')) {
          userMessage = 'Google OAuth non configuré. Contactez le support.';
        } else if (error.message.includes('invalid redirect_uri')) {
          userMessage = 'Problème de configuration. Réessayez plus tard.';
        }
        
        toast.error(userMessage);
        setIsGoogleLoading(false);
        return;
      }

      toast.success('Redirection vers Google...');
      // La redirection se fera automatiquement
      
    } catch (error: any) {
      console.error('❌ Exception Google OAuth:', error);
      toast.error('Erreur système. Réessayez.');
      setIsGoogleLoading(false);
    }
  };

  // 🎯 FONCTION PRINCIPALE DE CONNEXION (UTILISE GOOGLE)
  const handleSignIn = async () => {
    // Si déjà connecté, aller au dashboard
    if (user) {
      setLocation('/dashboard');
      return;
    }
    
    // Utiliser Google OAuth
    await handleGoogleSignIn();
  };

  const handleDemo = () => {
    toast.info('Version démo bientôt disponible!');
  };

  return (
    <div className="min-h-screen bg-background text-foreground overflow-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 backdrop-blur-md bg-background/80 border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-6 h-6 text-primary" />
            <span className="font-bold text-xl">VoltFlow AI</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm hover:text-primary transition-smooth">
              Fonctionnalités
            </a>
            <a href="#pricing" className="text-sm hover:text-primary transition-smooth">
              Tarifs
            </a>
            <a href="#contact" className="text-sm hover:text-primary transition-smooth">
              Contact
            </a>
          </div>
          <Button 
            onClick={handleSignIn}
            disabled={authLoading || isGoogleLoading}
            className="bg-primary hover:bg-primary/90 text-primary-foreground min-w-[120px]"
          >
            {authLoading || isGoogleLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Connexion...
              </>
            ) : user ? (
              'Dashboard'
            ) : (
              'Se connecter'
            )}
          </Button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        {/* Background Gradient */}
        <div className="absolute inset-0 gradient-neon opacity-40" />
        
        {/* Animated Elements */}
        <div className="absolute top-20 right-10 w-72 h-72 bg-primary/20 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-0 left-10 w-96 h-96 bg-secondary/20 rounded-full blur-3xl animate-float" style={{ animationDelay: "1s" }} />

        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-block mb-6 px-4 py-2 rounded-full bg-primary/20 border border-primary/50">
              <span className="text-sm font-medium text-primary">
                ✨ Simulation Thermique Nouvelle Génération
              </span>
            </div>

            <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
              Simulez la Thermique en{" "}
              <span className="bg-gradient-to-r from-primary via-secondary to-primary bg-clip-text text-transparent">
                Secondes
              </span>
            </h1>

            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              VoltFlow AI combine l'intelligence artificielle et la physique numérique pour
              accélérer vos simulations thermiques industrielles. Obtenez des résultats
              précis 100x plus rapidement.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
              <Button
                size="lg"
                onClick={handleSignIn}
                className="bg-primary hover:bg-primary/90 text-primary-foreground neon-glow min-w-[200px]"
                disabled={authLoading || isGoogleLoading}
              >
                {authLoading || isGoogleLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Connexion...
                  </>
                ) : (
                  <>
                    Démarrer Gratuitement
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-secondary text-secondary hover:bg-secondary/10 min-w-[150px]"
                onClick={handleDemo}
              >
                Voir la Démo
              </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 md:gap-8 pt-8 border-t border-border">
              <div>
                <div className="text-3xl font-bold text-primary">100x</div>
                <div className="text-sm text-muted-foreground">Plus rapide</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-secondary">99.9%</div>
                <div className="text-sm text-muted-foreground">Précision</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-primary">5000+</div>
                <div className="text-sm text-muted-foreground">Utilisateurs</div>
              </div>
            </div>
            
            {/* Option alternative de connexion */}
            <div className="mt-8 pt-6 border-t border-border">
              <p className="text-sm text-muted-foreground mb-3">Ou connectez-vous avec</p>
              <Button
                variant="outline"
                onClick={handleGoogleSignIn}
                disabled={authLoading || isGoogleLoading}
                className="border-blue-500 hover:bg-blue-500/10 text-blue-400"
              >
                <Chrome className="w-4 h-4 mr-2" />
                Google
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      {/* ... (garde le reste de la section features inchangé) */}

      {/* Pricing Section */}
      {/* ... (garde le reste de la section pricing inchangé) */}

      {/* CTA Section */}
      <section className="py-20 border-t border-border">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center p-12 rounded-2xl bg-gradient-to-r from-primary/20 via-secondary/20 to-primary/20 border border-primary/30 neon-glow">
            <h2 className="text-4xl font-bold mb-4">
              Prêt à Transformer Vos Simulations?
            </h2>
            <p className="text-lg text-muted-foreground mb-8">
              Rejoignez des milliers d'ingénieurs qui font confiance à VoltFlow AI
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                size="lg"
                onClick={handleSignIn}
                disabled={authLoading || isGoogleLoading}
                className="bg-primary hover:bg-primary/90 text-primary-foreground min-w-[200px]"
              >
                {authLoading || isGoogleLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Connexion...
                  </>
                ) : (
                  <>
                    Commencer Maintenant
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={handleGoogleSignIn}
                disabled={authLoading || isGoogleLoading}
                className="border-blue-500 hover:bg-blue-500/10 text-blue-400"
              >
                <Chrome className="w-4 h-4 mr-2" />
                Continuer avec Google
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      {/* ... (garde le footer inchangé) */}

      {/* Chargement overlay */}
      {(authLoading || isGoogleLoading) && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto mb-4" />
            <p className="text-lg font-semibold">Connexion en cours...</p>
            <p className="text-sm text-muted-foreground mt-2">
              Redirection vers Google pour l'authentification
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
