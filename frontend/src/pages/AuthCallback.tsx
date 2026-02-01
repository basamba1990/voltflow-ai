import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Loader2, CheckCircle, AlertCircle, User, Mail, Building } from "lucide-react";

export default function AuthCallback() {
  const [, setLocation] = useLocation();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleAuthCallback = async () => {
      console.log("🔄 Processing auth callback...");

      try {
        // 1. Récupérer la session depuis l'URL
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error("❌ Session error:", sessionError);
          setError(sessionError.message);
          toast.error("Authentication failed");
          setLocation("/login?error=auth_failed");
          return;
        }

        if (!session) {
          console.warn("⚠️ No session found");
          setLocation("/login");
          return;
        }

        console.log("✅ Session found for:", session.user.email);

        // 2. Récupérer l'utilisateur complet
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        
        if (userError) {
          console.warn("⚠️ Could not get user details:", userError);
        }

        // 3. Afficher les informations utilisateur
        if (user) {
          console.log("👤 User metadata:", user.user_metadata);
          
          // Message de bienvenue personnalisé
          const userName = user.user_metadata?.full_name || 
                          user.user_metadata?.name || 
                          `${user.user_metadata?.first_name || ''} ${user.user_metadata?.last_name || ''}`.trim() ||
                          user.email;
          
          toast.success(`Welcome ${userName}!`, {
            description: "Authentication successful",
            duration: 3000,
          });

          // 4. Rediriger vers le dashboard
          setTimeout(() => {
            setLocation("/dashboard");
          }, 1000);
        }

      } catch (error: any) {
        console.error("❌ Unexpected error:", error);
        setError(error.message || "Unknown error");
        toast.error("Authentication error");
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
        </div>
        
        <h1 className="text-2xl font-bold text-white mb-2">
          Completing Authentication
        </h1>
        
        {error ? (
          <div className="mt-4 p-4 bg-red-900/20 rounded-lg border border-red-800">
            <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
            <p className="text-red-300">{error}</p>
            <button
              onClick={() => setLocation("/login")}
              className="mt-3 text-sm text-blue-400 hover:text-blue-300 underline"
            >
              Return to login
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-gray-400 mb-6">
              Please wait while we secure your session...
            </p>
            
            <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
              <div className="flex items-center justify-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse"></div>
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
              </div>
              
              <p className="text-sm text-gray-300">
                Securely connecting to VoltFlow AI...
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
