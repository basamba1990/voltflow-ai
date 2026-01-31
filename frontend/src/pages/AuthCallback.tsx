import { useEffect } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Loader2, CheckCircle, AlertCircle } from "lucide-react";

export default function AuthCallback() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const handleAuthCallback = async () => {
      console.log("🔄 Traitement du callback d'authentification...");

      try {
        // Récupérer la session depuis l'URL
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error("❌ Erreur de session:", sessionError);
          toast.error("Erreur d'authentification", {
            description: sessionError.message,
          });
          setLocation("/login?error=auth_failed");
          return;
        }

        if (session) {
          console.log("✅ Session authentifiée détectée:", session.user.email);
          
          // Récupérer les informations utilisateur complètes
          const { data: { user }, error: userError } = await supabase.auth.getUser();
          
          if (userError) {
            console.warn("⚠️ Impossible de récupérer les détails utilisateur:", userError);
          } else if (user) {
            console.log("👤 Informations utilisateur:", {
              email: user.email,
              name: user.user_metadata?.full_name || user.user_metadata?.name,
              avatar: user.user_metadata?.avatar_url,
              provider: user.app_metadata?.provider,
            });
            
            // Afficher un message de bienvenue
            toast.success("Authentification réussie !", {
              description: `Bienvenue ${user.user_metadata?.first_name || user.user_metadata?.name || "Utilisateur"} !`,
              duration: 3000,
            });
          }
          
          // Rediriger vers le dashboard après un court délai
          setTimeout(() => {
            setLocation("/dashboard");
          }, 1500);
          
        } else {
          console.warn("⚠️ Aucune session trouvée, redirection vers login");
          setLocation("/login");
        }
        
      } catch (error: any) {
        console.error("❌ Erreur inattendue:", error);
        toast.error("Erreur lors de l'authentification", {
          description: "Veuillez réessayer ou contacter le support.",
        });
        setLocation("/login?error=unexpected");
      }
    };

    handleAuthCallback();
  }, [setLocation]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black flex items-center justify-center p-4">
      <div className="text-center max-w-md mx-auto">
        <div className="relative mb-6">
          <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 flex items-center justify-center">
            <Loader2 className="w-10 h-10 text-white animate-spin" />
          </div>
          <div className="absolute -top-2 -right-2 animate-pulse">
            <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-white" />
            </div>
          </div>
        </div>
        
        <h1 className="text-2xl font-bold text-white mb-2">
          Finalisation de l'authentification
        </h1>
        <p className="text-gray-400 mb-6">
          Nous vérifions vos informations de connexion...
        </p>
        
        <div className="space-y-4">
          <div className="flex items-center justify-center gap-3 text-sm text-gray-300">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
              <span>Vérification du token</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse"></div>
              <span>Récupération du profil</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
              <span>Redirection</span>
            </div>
          </div>
          
          <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
            <h3 className="text-sm font-semibold text-gray-300 mb-2">
              Connexion sécurisée en cours
            </h3>
            <p className="text-xs text-gray-400">
              Vos informations sont traitées de manière sécurisée via Supabase Auth.
              Vous serez redirigé automatiquement vers votre tableau de bord.
            </p>
          </div>
          
          <div className="pt-4">
            <p className="text-xs text-gray-500">
              Si la redirection ne se fait pas automatiquement,{" "}
              <button
                onClick={() => setLocation("/dashboard")}
                className="text-blue-400 hover:text-blue-300 underline"
              >
                cliquez ici
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
