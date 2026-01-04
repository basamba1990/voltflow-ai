// frontend/src/App.tsx
// VERSION CORRIGÉE - COMPLÈTE ET SYNTAXE VALIDE

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import Dashboard from "@/pages/Dashboard";
import SimulationEditor from "@/pages/SimulationEditor";
import { Route, Switch } from "wouter";
import ErrorBoundary from "@/components/ErrorBoundary";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AuthProvider } from "@/contexts/AuthContext";
import Home from "@/pages/Home";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useEffect, useState } from "react";
import { checkSupabaseConnection } from "@/lib/supabase";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * VoltFlow AI - Application Router
 * Design: Neon-Noir Cinématique
 */

// Création du client React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <ProtectedRoute path="/dashboard" component={Dashboard} />
      <ProtectedRoute path="/simulation/new" component={SimulationEditor} />
      <ProtectedRoute path="/simulation/:id" component={SimulationEditor} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<{
    status: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        // 1. Vérifier les erreurs d'authentification dans l'URL
        const checkAuthErrors = () => {
          const urlParams = new URLSearchParams(window.location.search);
          const error = urlParams.get('error');
          const errorDescription = urlParams.get('error_description');

          if (error) {
            console.error('Authentication error in URL:', error, errorDescription);
            // Nettoyer l'URL
            window.history.replaceState({}, document.title, window.location.pathname);
          }
        };

        checkAuthErrors();

        // 2. Vérifier la connexion Supabase (diagnostic)
        const connection = await checkSupabaseConnection();
        setConnectionStatus(connection);

        if (connection.status === 'disconnected') {
          console.warn('⚠️ Connexion Supabase limitée:', connection.message);
          // Ne pas bloquer l'app, mais afficher un avertissement en dev
          if (import.meta.env.DEV) {
            console.log('Mode développement: continuation malgré connexion limitée');
          }
        } else {
          console.log('✅ Connexion Supabase établie');
        }

      } catch (error) {
        console.error('❌ Erreur lors de l\'initialisation:', error);
        setConnectionStatus({
          status: 'error',
          message: 'Erreur d\'initialisation'
        });
      } finally {
        // Petit délai pour une meilleure expérience utilisateur
        setTimeout(() => {
          setIsLoading(false);
        }, 500);
      }
    };

    initializeApp();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-lg font-semibold">Initialisation de VoltFlow AI...</p>
          {connectionStatus && (
            <div className={`mt-2 text-sm ${connectionStatus.status === 'connected' ? 'text-green-500' : 'text-amber-500'}`}>
              {connectionStatus.message}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultTheme="dark">
          <AuthProvider>
            <TooltipProvider>
              <Toaster 
                position="top-right"
                toastOptions={{
                  duration: 5000,
                  classNames: {
                    toast: 'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
                    description: 'group-[.toast]:text-muted-foreground',
                    actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
                    cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
                  },
                }}
              />
              <Router />
            </TooltipProvider>
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
