import React, { useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { 
  Lock, 
  Mail, 
  ArrowLeft, 
  Eye, 
  EyeOff, 
  CheckCircle,
  Loader2 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function ResetPasswordPage() {
  const [, setLocation] = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<"request" | "reset">("request");
  const [showPassword, setShowPassword] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  
  // États pour la demande de réinitialisation
  const [email, setEmail] = useState("");
  
  // États pour la réinitialisation du mot de passe
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Demande d'envoi d'email de réinitialisation
  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim()) {
      toast.error("Veuillez saisir votre adresse email");
      return;
    }

    setIsLoading(true);
    
    try {
      console.log("📧 Envoi d'email de réinitialisation à:", email);
      
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });

      if (error) {
        console.error("❌ Erreur d'envoi d'email:", error);
        toast.error(`Erreur: ${error.message}`);
        return;
      }

      console.log("✅ Email de réinitialisation envoyé");
      setEmailSent(true);
      toast.success("Email envoyé avec succès", {
        description: "Vérifiez votre boîte de réception et suivez les instructions",
      });
      
      // Basculer vers l'étape de réinitialisation après 3 secondes
      setTimeout(() => {
        setStep("reset");
        setEmailSent(false);
      }, 3000);
      
    } catch (error: any) {
      console.error("❌ Erreur inattendue:", error);
      toast.error("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setIsLoading(false);
    }
  };

  // Réinitialisation du mot de passe
  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!password || !confirmPassword) {
      toast.error("Veuillez saisir et confirmer votre nouveau mot de passe");
      return;
    }
    
    if (password.length < 6) {
      toast.error("Le mot de passe doit contenir au moins 6 caractères");
      return;
    }
    
    if (password !== confirmPassword) {
      toast.error("Les mots de passe ne correspondent pas");
      return;
    }

    setIsLoading(true);
    
    try {
      console.log("🔄 Réinitialisation du mot de passe...");
      
      const { error } = await supabase.auth.updateUser({
        password: password
      });

      if (error) {
        console.error("❌ Erreur de réinitialisation:", error);
        toast.error(`Erreur: ${error.message}`);
        return;
      }

      console.log("✅ Mot de passe réinitialisé avec succès");
      toast.success("Mot de passe modifié !", {
        description: "Vous pouvez maintenant vous connecter avec votre nouveau mot de passe",
      });
      
      // Redirection vers la page de connexion après 2 secondes
      setTimeout(() => {
        setLocation("/login");
      }, 2000);
      
    } catch (error: any) {
      console.error("❌ Erreur inattendue:", error);
      toast.error("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card className="bg-gray-900/50 border-gray-800 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center gap-3 mb-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation("/login")}
                className="text-gray-400 hover:text-white"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Retour
              </Button>
            </div>
            
            <CardTitle className="text-2xl text-white">
              {step === "request" ? "Réinitialiser le mot de passe" : "Nouveau mot de passe"}
            </CardTitle>
            <CardDescription className="text-gray-400">
              {step === "request" 
                ? "Entrez votre email pour recevoir un lien de réinitialisation" 
                : "Choisissez un nouveau mot de passe sécurisé"}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {step === "request" ? (
              // ÉTAPE 1 : Demande de réinitialisation
              <form onSubmit={handleResetRequest} className="space-y-4">
                {emailSent ? (
                  <Alert className="bg-green-900/20 border-green-800">
                    <CheckCircle className="h-4 w-4 text-green-400" />
                    <AlertDescription className="ml-2">
                      Email envoyé ! Vérifiez votre boîte de réception.
                      Redirection vers l'étape suivante...
                    </AlertDescription>
                  </Alert>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-gray-300">
                        <Mail className="inline w-4 h-4 mr-2" />
                        Adresse email associée à votre compte
                      </Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="votre@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="bg-gray-800 border-gray-700 text-white"
                        required
                      />
                    </div>

                    <Alert className="bg-blue-900/20 border-blue-800">
                      <AlertDescription className="text-sm text-blue-300">
                        <p className="font-semibold mb-1">ℹ️ Comment ça marche ?</p>
                        <ul className="list-disc list-inside space-y-1">
                          <li>Nous vous enverrons un email avec un lien sécurisé</li>
                          <li>Cliquez sur le lien dans l'email</li>
                          <li>Vous pourrez alors définir un nouveau mot de passe</li>
                        </ul>
                      </AlertDescription>
                    </Alert>

                    <Button
                      type="submit"
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Envoi en cours...
                        </>
                      ) : (
                        'Envoyer le lien de réinitialisation'
                      )}
                    </Button>
                  </>
                )}
              </form>
            ) : (
              // ÉTAPE 2 : Réinitialisation du mot de passe
              <form onSubmit={handlePasswordReset} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-gray-300">
                    <Lock className="inline w-4 h-4 mr-2" />
                    Nouveau mot de passe *
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
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
                  <Label htmlFor="confirmPassword" className="text-gray-300">
                    <Lock className="inline w-4 h-4 mr-2" />
                    Confirmer le mot de passe *
                  </Label>
                  <Input
                    id="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="bg-gray-800 border-gray-700 text-white"
                    required
                  />
                </div>

                <Alert className="bg-green-900/20 border-green-800">
                  <AlertDescription className="text-sm text-green-300">
                    <p className="font-semibold mb-1">🔒 Conseils de sécurité</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>Utilisez au moins 8 caractères</li>
                      <li>Combinez lettres, chiffres et caractères spéciaux</li>
                      <li>Évitez les mots de passe courants</li>
                    </ul>
                  </AlertDescription>
                </Alert>

                <Button
                  type="submit"
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Mise à jour...
                    </>
                  ) : (
                    'Réinitialiser le mot de passe'
                  )}
                </Button>
              </form>
            )}
          </CardContent>

          <CardFooter className="flex flex-col space-y-4 border-t border-gray-800 pt-6">
            <div className="text-center">
              <p className="text-sm text-gray-400">
                Besoin d'aide ?{" "}
                <button
                  onClick={() => setLocation("/login")}
                  className="text-blue-400 hover:text-blue-300 font-medium"
                >
                  Contactez le support
                </button>
              </p>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
