import { Button } from "@/components/ui/button";
import { ArrowRight, Zap, Layers, BarChart3, Shield, Rocket, Users, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useLocation } from "wouter";

/**
 * VoltFlow AI - Landing Page
 * Design: Neon-Noir Cinématique
 * Palette: Rose vif (accent), Bleu électrique, Fond bleu marine profond
 */

export default function Home() {
  const [hoveredPlan, setHoveredPlan] = useState<string | null>(null);
  const { user, signIn, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [isRedirecting, setIsRedirecting] = useState(false);

  // Vérifier si l'utilisateur est déjà connecté
  useEffect(() => {
    if (user && !authLoading) {
      // Rediriger vers le dashboard si déjà connecté
      setLocation('/dashboard');
    }
  }, [user, authLoading, setLocation]);

  const plans = [
    {
      id: "starter",
      name: "Starter",
      price: "$29",
      period: "/mois",
      description: "Pour débuter avec les simulations thermiques",
      features: [
        "10 simulations/mois",
        "Matériaux de base",
        "Support par email",
        "Visualisation 2D",
      ],
      cta: "Commencer",
      highlighted: false,
    },
    {
      id: "professional",
      name: "Professional",
      price: "$99",
      period: "/mois",
      description: "Pour les professionnels et équipes",
      features: [
        "100 simulations/mois",
        "Bibliothèque complète",
        "Support prioritaire",
        "Visualisation 3D",
        "Exports avancés",
        "API access",
      ],
      cta: "Essayer",
      highlighted: true,
    },
    {
      id: "enterprise",
      name: "Enterprise",
      price: "Personnalisé",
      period: "",
      description: "Pour les grandes organisations",
      features: [
        "Simulations illimitées",
        "Support 24/7 dédié",
        "Infrastructure privée",
        "Intégrations custom",
        "SLA garanti",
        "Formation incluse",
      ],
      cta: "Contacter",
      highlighted: false,
    },
  ];

  const features = [
    {
      icon: Zap,
      title: "Simulations Ultra-Rapides",
      description:
        "Moteur physique optimisé avec GPU pour des résultats en secondes",
    },
    {
      icon: Layers,
      title: "Matériaux Avancés",
      description:
        "Bibliothèque complète de matériaux industriels avec propriétés thermiques",
    },
    {
      icon: BarChart3,
      title: "Analyse Détaillée",
      description:
        "Visualisations 3D interactives et rapports d'analyse complets",
    },
    {
      icon: Shield,
      title: "Sécurité Enterprise",
      description:
        "Chiffrement end-to-end et conformité GDPR/ISO 27001",
    },
    {
      icon: Rocket,
      title: "API Puissante",
      description:
        "Intégrez VoltFlow à vos workflows existants via notre API REST",
    },
    {
      icon: Users,
      title: "Collaboration",
      description:
        "Partagez les simulations et collaborez en temps réel avec votre équipe",
    },
  ];

  const handleSignIn = async () => {
    try {
      setIsRedirecting(true);
      await signIn('github');
      // Note: signIn redirige automatiquement, donc ce code ne s'exécute qu'en cas d'erreur
    } catch (error: any) {
      setIsRedirecting(false);
      console.error('Sign in error:', error);
      
      // Ne pas afficher de toast si l'erreur est liée à la redirection
      if (!error.message.includes('redirect')) {
        toast.error('Erreur lors de la connexion. Veuillez réessayer.');
      }
    }
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
            disabled={authLoading || isRedirecting}
            className="bg-primary hover:bg-primary/90 text-primary-foreground min-w-[120px]"
          >
            {authLoading || isRedirecting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Connexion...
              </>
            ) : user ? (
              'Connecté'
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
                disabled={authLoading || isRedirecting}
              >
                {authLoading || isRedirecting ? (
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
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 border-t border-border">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Fonctionnalités Puissantes
            </h2>
            <p className="text-lg text-muted-foreground">
              Tout ce dont vous avez besoin pour maîtriser la simulation thermique
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <div
                  key={idx}
                  className="group p-6 rounded-xl bg-card border border-border hover:border-primary/50 transition-smooth hover:neon-glow"
                >
                  <div className="mb-4 p-3 w-fit rounded-lg bg-primary/20 group-hover:bg-primary/30 transition-smooth">
                    <Icon className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 border-t border-border">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Plans Transparents
            </h2>
            <p className="text-lg text-muted-foreground">
              Choisissez le plan qui correspond à vos besoins
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {plans.map((plan) => (
              <div
                key={plan.id}
                onMouseEnter={() => setHoveredPlan(plan.id)}
                onMouseLeave={() => setHoveredPlan(null)}
                className={`relative p-8 rounded-2xl border transition-smooth ${
                  plan.highlighted
                    ? "bg-gradient-to-br from-primary/20 to-secondary/20 border-primary/50 neon-glow scale-105"
                    : "bg-card border-border hover:border-primary/30"
                }`}
              >
                {plan.highlighted && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-primary text-primary-foreground text-xs font-semibold rounded-full">
                    Populaire
                  </div>
                )}

                <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {plan.description}
                </p>

                <div className="mb-6">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className="text-muted-foreground text-sm">{plan.period}</span>
                </div>

                <Button
                  className={`w-full mb-8 ${
                    plan.highlighted
                      ? "bg-primary hover:bg-primary/90"
                      : "bg-secondary hover:bg-secondary/90"
                  }`}
                  onClick={handleSignIn}
                  disabled={authLoading || isRedirecting}
                >
                  {authLoading || isRedirecting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    plan.cta
                  )}
                </Button>

                <div className="space-y-3">
                  {plan.features.map((feature, idx) => (
                    <div key={idx} className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <div className="w-2 h-2 rounded-full bg-primary" />
                      </div>
                      <span className="text-sm">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

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
            <Button
              size="lg"
              onClick={handleSignIn}
              disabled={authLoading || isRedirecting}
              className="bg-primary hover:bg-primary/90 text-primary-foreground min-w-[200px]"
            >
              {authLoading || isRedirecting ? (
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
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer id="contact" className="py-12 border-t border-border">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Zap className="w-5 h-5 text-primary" />
                <span className="font-bold">VoltFlow AI</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Simulation thermique nouvelle génération
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Produit</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#features" className="hover:text-primary transition-smooth">Fonctionnalités</a></li>
                <li><a href="#pricing" className="hover:text-primary transition-smooth">Tarifs</a></li>
                <li><a href="#" className="hover:text-primary transition-smooth">Documentation</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Entreprise</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-primary transition-smooth">À propos</a></li>
                <li><a href="#" className="hover:text-primary transition-smooth">Blog</a></li>
                <li><a href="#" className="hover:text-primary transition-smooth">Carrières</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Légal</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-primary transition-smooth">Confidentialité</a></li>
                <li><a href="#" className="hover:text-primary transition-smooth">Conditions</a></li>
                <li><a href="#" className="hover:text-primary transition-smooth">Contact</a></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-border text-center text-sm text-muted-foreground">
            <p>&copy; 2025 VoltFlow AI. Tous droits réservés.</p>
          </div>
        </div>
      </footer>

      {/* Chargement overlay */}
      {(authLoading || isRedirecting) && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto mb-4" />
            <p className="text-lg font-semibold">Connexion en cours...</p>
            <p className="text-sm text-muted-foreground mt-2">
              Redirection vers GitHub pour l'authentification
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
