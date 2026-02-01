import { Button } from "@/components/ui/button";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  Plus,
  Settings,
  LogOut,
  TrendingUp,
  Zap,
  Clock,
  CheckCircle,
  RefreshCw,
  AlertCircle,
  User,
  Mail,
  Calendar,
} from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { 
  getSimulations, 
  subscribeToSimulation, 
  unsubscribeFromChannel,
  type Simulation 
} from "@/services/simulation.service";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const { user, profile, signOut } = useAuth();
  const [, setLocation] = useLocation();
  const [simulations, setSimulations] = useState<Simulation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const realtimeChannelsRef = useRef<any[]>([]);

  // Charger les simulations
  const loadSimulations = useCallback(async () => {
    if (!user) {
      setLoading(false);
      setRefreshing(false);
      setError('Veuillez vous connecter');
      return;
    }

    try {
      setError(null);
      const data = await getSimulations();
      const limitedData = data.slice(0, 5);
      setSimulations(limitedData);

      // Nettoyer anciens canaux
      realtimeChannelsRef.current.forEach(channel => {
        if (channel) unsubscribeFromChannel(channel);
      });
      
      // Nouveaux canaux pour simulations en cours
      const runningSims = limitedData.filter(
        (sim: Simulation) => sim.status === 'running' || sim.status === 'pending'
      );
      
      const channels = runningSims.map((sim: Simulation) => {
        try {
          return subscribeToSimulation(sim.id, (payload) => {
            if (payload.new) {
              setSimulations(prev => 
                prev.map(s => s.id === payload.new.id ? { ...s, ...payload.new } : s)
              );
            }
          });
        } catch (err) {
          console.error('❌ Erreur subscription:', sim.id, err);
          return null;
        }
      }).filter(Boolean);
      
      realtimeChannelsRef.current = channels;
    } catch (error: any) {
      console.error('❌ Erreur loadSimulations:', error);
      setError(error.message || 'Erreur inconnue');
      setSimulations([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  // Initialisation
  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        console.log('⚠️ Dashboard: utilisateur non connecté');
        setLoading(false);
        setError('Veuillez vous connecter pour accéder au dashboard');
        return;
      }
      
      await loadSimulations();
    };
    
    init();
    
    return () => {
      realtimeChannelsRef.current.forEach(channel => {
        if (channel) unsubscribeFromChannel(channel);
      });
      realtimeChannelsRef.current = [];
    };
  }, [loadSimulations]);

  const handleSignOut = async () => {
    try {
      realtimeChannelsRef.current.forEach(channel => {
        if (channel) unsubscribeFromChannel(channel);
      });
      realtimeChannelsRef.current = [];
      
      await signOut();
      toast.success('Déconnexion réussie');
      setLocation('/');
    } catch (error: any) {
      console.error('❌ Erreur signOut:', error);
      toast.error('Erreur lors de la déconnexion');
    }
  };

  const handleNewSimulation = () => {
    if (!user) {
      toast.error('Veuillez vous connecter');
      setLocation('/login');
      return;
    }
    setLocation('/simulation/new');
  };

  // Fonctions utilitaires
  const getStatusText = (status: string): string => {
    switch (status) {
      case 'completed': return 'Terminée';
      case 'running': return 'En cours';
      case 'failed': return 'Échouée';
      case 'pending': return 'En attente';
      case 'cancelled': return 'Annulée';
      default: return status;
    }
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'completed': return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'running': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'failed': return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'pending': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      default: return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
    }
  };

  const getUserDisplayName = () => {
    if (profile?.full_name) return profile.full_name;
    if (user?.user_metadata?.full_name) return user.user_metadata.full_name;
    if (user?.user_metadata?.first_name && user?.user_metadata?.last_name) {
      return `${user.user_metadata.first_name} ${user.user_metadata.last_name}`;
    }
    return user?.email?.split('@')[0] || 'Ingénieur';
  };

  const getUserAvatar = () => {
    if (profile?.avatar_url) return profile.avatar_url;
    if (user?.user_metadata?.avatar_url) return user.user_metadata.avatar_url;
    if (user?.user_metadata?.picture) return user.user_metadata.picture;
    return null;
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-primary to-secondary flex items-center justify-center">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="font-bold text-xl">VoltFlow AI</h1>
                <p className="text-xs text-muted-foreground">
                  Dashboard
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="hidden md:flex items-center gap-3 p-2 rounded-lg bg-background border border-border">
                {getUserAvatar() ? (
                  <img 
                    src={getUserAvatar()} 
                    alt={getUserDisplayName()}
                    className="w-8 h-8 rounded-full border-2 border-primary/20"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                    <User className="w-4 h-4 text-primary" />
                  </div>
                )}
                <div className="text-sm">
                  <p className="font-medium">{getUserDisplayName()}</p>
                  <p className="text-xs text-muted-foreground truncate max-w-[150px]">
                    {user?.email}
                  </p>
                </div>
              </div>

              <Separator orientation="vertical" className="h-6" />

              <Button
                onClick={handleNewSimulation}
                className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
                disabled={loading}
              >
                <Plus className="w-4 h-4" />
                Nouvelle Simulation
              </Button>
              
              <Button 
                variant="ghost" 
                size="icon" 
                title="Paramètres"
              >
                <Settings className="w-5 h-5" />
              </Button>
              
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSignOut}
                title="Déconnexion"
              >
                <LogOut className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="mb-8 p-6 rounded-xl bg-gradient-to-r from-primary/20 via-secondary/20 to-primary/20 border border-primary/30">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold mb-2">
                Bienvenue, {getUserDisplayName()}!
              </h2>
              <p className="text-muted-foreground">
                Gérer vos simulations thermiques en temps réel
              </p>
            </div>
          </div>
        </div>

        {/* Simulations récentes */}
        <div className="p-6 rounded-xl bg-card border border-border">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
            <div>
              <h3 className="text-lg font-semibold">Simulations Récentes</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Vos {simulations.length} simulations les plus récentes
              </p>
            </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadSimulations()}
              disabled={refreshing}
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="ml-2">Actualiser</span>
            </Button>
          </div>

          <div className="space-y-4">
            {loading ? (
              [...Array(3)].map((_, i) => (
                <div key={i} className="p-4 rounded-lg bg-background border border-border">
                  <div className="flex items-center justify-between">
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-8 w-16" />
                  </div>
                </div>
              ))
            ) : error ? (
              <div className="text-center p-8 border border-destructive/20 rounded-lg bg-destructive/5">
                <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
                <h4 className="font-semibold text-lg mb-2">Erreur de chargement</h4>
                <p className="text-muted-foreground mb-6">{error}</p>
              </div>
            ) : simulations.length === 0 ? (
              <div className="text-center p-8 border border-primary/20 rounded-lg bg-primary/5">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Zap className="w-8 h-8 text-primary" />
                </div>
                <h4 className="font-semibold text-lg mb-2">Aucune simulation</h4>
                <p className="text-muted-foreground mb-6">
                  Commencez votre première simulation thermique
                </p>
                <Button onClick={handleNewSimulation}>
                  <Plus className="w-4 h-4 mr-2" />
                  Créer une simulation
                </Button>
              </div>
            ) : (
              simulations.map((sim) => (
                <div
                  key={sim.id}
                  className="p-4 rounded-lg bg-background border border-border hover:border-primary/50 transition-all duration-300 cursor-pointer"
                  onClick={() => setLocation(`/simulation/${sim.id}`)}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        <h4 className="font-semibold group-hover:text-primary transition-all duration-300 line-clamp-1">
                          {sim.name || 'Simulation sans nom'}
                        </h4>
                        <Badge 
                          variant="outline"
                          className={`text-xs capitalize ${getStatusColor(sim.status)}`}
                        >
                          {getStatusText(sim.status)}
                        </Badge>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          <span>
                            {new Date(sim.created_at).toLocaleDateString('fr-FR')}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>Progression: {sim.progress || 0}%</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="sm:text-right">
                      <div className="text-2xl font-bold text-primary">
                        {sim.progress || 0}%
                      </div>
                      <span className="text-xs text-muted-foreground capitalize block mt-1">
                        {getStatusText(sim.status)}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
