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

// Types locaux
type ChartDataPoint = {
  month: string;
  simulations: number;
  avgTime: number;
};

type TemperatureDataPoint = {
  name: string;
  value: number;
  fill: string;
};

type StatItem = {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  trend: string;
  limit?: number;
};

/**
 * VoltFlow AI - Dashboard
 * Design: Neon-Noir avec statistiques en temps réel
 */
export default function Dashboard() {
  const { user, profile, signOut } = useAuth();
  const [, setLocation] = useLocation();
  const [simulations, setSimulations] = useState<Simulation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [userStats, setUserStats] = useState({
    simulationsUsed: 0,
    simulationsLimit: 10,
    subscriptionPlan: "Starter"
  });
  const realtimeChannelsRef = useRef<any[]>([]);

  const chartData: ChartDataPoint[] = [
    { month: "Jan", simulations: 12, avgTime: 2.5 },
    { month: "Fév", simulations: 19, avgTime: 2.1 },
    { month: "Mar", simulations: 15, avgTime: 1.8 },
    { month: "Avr", simulations: 22, avgTime: 1.5 },
    { month: "Mai", simulations: 28, avgTime: 1.2 },
    { month: "Juin", simulations: 35, avgTime: 0.9 },
  ];

  const temperatureData: TemperatureDataPoint[] = [
    { name: "Startup", value: 25, fill: "#8B5CF6" },
    { name: "Optimisé", value: 45, fill: "#3B82F6" },
    { name: "Avancé", value: 30, fill: "#10B981" },
  ];

  const stats: StatItem[] = [
    {
      label: "Simulations ce mois",
      value: userStats.simulationsUsed.toString(),
      icon: Zap,
      trend: "+12%",
      limit: userStats.simulationsLimit,
    },
    {
      label: "Temps moyen",
      value: "1.2s",
      icon: Clock,
      trend: "-23%",
    },
    {
      label: "Taux de succès",
      value: "98.5%",
      icon: CheckCircle,
      trend: "+2%",
    },
    {
      label: "Économies GPU",
      value: "156h",
      icon: TrendingUp,
      trend: "+34%",
    },
  ];

  // Charger les statistiques utilisateur
  const loadUserStats = useCallback(() => {
    if (profile) {
      setUserStats({
        simulationsUsed: profile.simulations_used || 0,
        simulationsLimit: profile.simulations_limit || 10,
        subscriptionPlan: profile.subscription_plan || "Starter"
      });
    } else if (user?.user_metadata) {
      setUserStats({
        simulationsUsed: user.user_metadata.simulations_used || 0,
        simulationsLimit: user.user_metadata.simulations_limit || 10,
        subscriptionPlan: user.user_metadata.subscription_plan || "Starter"
      });
    }
  }, [user, profile]);

  const loadSimulations = useCallback(async () => {
    // Vérifier si l'utilisateur est connecté
    if (!user) {
      setLoading(false);
      setRefreshing(false);
      setError('Veuillez vous connecter pour voir vos simulations');
      return;
    }

    try {
      setError(null);
      
      // Charger les simulations avec une limite
      const data = await getSimulations();
      // Limiter à 5 simulations pour l'affichage
      const limitedData = data.slice(0, 5);
      setSimulations(limitedData);

      // Nettoyer les anciens canaux
      realtimeChannelsRef.current.forEach(channel => {
        if (channel) {
          unsubscribeFromChannel(channel);
        }
      });
      
      // Créer de nouveaux canaux pour les simulations en cours
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
          console.error('❌ Erreur subscription pour simulation:', sim.id, err);
          return null;
        }
      }).filter(Boolean);
      
      realtimeChannelsRef.current = channels;
    } catch (error: any) {
      console.error('❌ Erreur loadSimulations:', error);
      setError(error.message || 'Erreur inconnue lors du chargement');
      
      if (error.message?.includes('NetworkError') || error.message?.includes('fetch')) {
        toast.error('Problème de connexion. Vérifiez votre réseau.');
      } else if (error.message?.includes('JWT') || error.message?.includes('401')) {
        toast.error('Session expirée. Redirection...');
        setTimeout(() => signOut(), 2000);
      } else {
        toast.error('Erreur lors du chargement des simulations');
      }
      setSimulations([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, signOut]);

  // Initialisation
  useEffect(() => {
    const init = async () => {
      // 1. Vérifier la session
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        console.log('⚠️ Dashboard: utilisateur non connecté');
        setLoading(false);
        setError('Veuillez vous connecter pour accéder au dashboard');
        return;
      }
      
      // 2. Charger les statistiques utilisateur
      loadUserStats();
      
      // 3. Charger les simulations
      await loadSimulations();
    };
    
    init();
    
    // Cleanup function
    return () => {
      realtimeChannelsRef.current.forEach(channel => {
        if (channel) {
          unsubscribeFromChannel(channel);
        }
      });
      realtimeChannelsRef.current = [];
    };
  }, [loadSimulations, loadUserStats]);

  const handleSignOut = async () => {
    try {
      // Nettoyer les abonnements avant déconnexion
      realtimeChannelsRef.current.forEach(channel => {
        if (channel) {
          unsubscribeFromChannel(channel);
        }
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
      toast.error('Veuillez vous connecter pour créer une simulation');
      setLocation('/login');
      return;
    }
    
    // Vérifier la limite de simulations
    if (userStats.simulationsUsed >= userStats.simulationsLimit) {
      toast.error(`Limite de ${userStats.simulationsLimit} simulations atteinte ce mois-ci.`);
      return;
    }
    
    setLocation('/simulation/new');
  };

  const handleRefresh = () => {
    if (!user) {
      toast.error('Veuillez vous connecter pour actualiser');
      return;
    }
    setRefreshing(true);
    loadSimulations();
  };

  const SimulationSkeleton = () => (
    <>
      {[...Array(3)].map((_, i) => (
        <div key={i} className="p-4 rounded-lg bg-background border border-border animate-pulse">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="h-4 bg-muted rounded w-32"></div>
              <div className="h-3 bg-muted rounded w-24"></div>
            </div>
            <div className="h-8 bg-muted rounded w-16"></div>
          </div>
          <div className="mt-3 h-2 bg-muted rounded-full"></div>
        </div>
      ))}
    </>
  );

  const ErrorState = () => (
    <div className="text-center p-8 border border-destructive/20 rounded-lg bg-destructive/5">
      <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
      <h4 className="font-semibold text-lg mb-2">Erreur de chargement</h4>
      <p className="text-muted-foreground mb-6">
        {error || 'Impossible de charger les simulations'}
      </p>
      <Button 
        variant="outline" 
        onClick={handleRefresh}
        disabled={refreshing}
      >
        <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
        Réessayer
      </Button>
    </div>
  );

  const EmptyState = () => (
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
  );

  // État non connecté
  if (!user && !loading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
        <div className="text-center p-8 max-w-md w-full">
          <AlertCircle className="w-16 h-16 text-primary mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-4">Non connecté</h2>
          <p className="text-muted-foreground mb-6">
            Veuillez vous connecter pour accéder au dashboard
          </p>
          <Button onClick={() => setLocation('/login')} className="w-full">
            Se connecter
          </Button>
        </div>
      </div>
    );
  }

  // Helper pour le statut de simulation
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
      case 'cancelled': return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
      default: return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
    }
  };

  const getProgressColor = (status: string): string => {
    switch (status) {
      case 'completed': return 'bg-primary';
      case 'running': return 'bg-blue-500';
      case 'failed': return 'bg-red-500';
      case 'pending': return 'bg-yellow-500';
      case 'cancelled': return 'bg-gray-500';
      default: return 'bg-secondary';
    }
  };

  // Récupérer le nom d'affichage de l'utilisateur
  const getUserDisplayName = () => {
    if (profile?.full_name) return profile.full_name;
    if (user?.user_metadata?.full_name) return user.user_metadata.full_name;
    if (user?.user_metadata?.first_name && user?.user_metadata?.last_name) {
      return `${user.user_metadata.first_name} ${user.user_metadata.last_name}`;
    }
    return user?.email?.split('@')[0] || 'Ingénieur';
  };

  // Récupérer l'avatar de l'utilisateur
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
                  Dashboard • <span className="font-medium">{userStats.subscriptionPlan}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Info utilisateur */}
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
                disabled={loading || refreshing}
              >
                <Plus className="w-4 h-4" />
                Nouvelle Simulation
              </Button>
              
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setLocation('/settings')}
                disabled={loading}
                title="Paramètres"
              >
                <Settings className="w-5 h-5" />
              </Button>
              
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSignOut}
                disabled={loading}
                title="Déconnexion"
              >
                <LogOut className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Section de bienvenue */}
        <div className="mb-8 p-6 rounded-xl bg-gradient-to-r from-primary/20 via-secondary/20 to-primary/20 border border-primary/30">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold mb-2">
                Bienvenue, {getUserDisplayName()}!
              </h2>
              <p className="text-muted-foreground">
                Vous avez effectué <span className="font-semibold text-primary">{userStats.simulationsUsed}</span> simulations ce mois sur{' '}
                <span className="font-semibold">{userStats.simulationsLimit}</span> autorisées.
              </p>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-primary">{userStats.simulationsUsed}</div>
                <div className="text-xs text-muted-foreground">Simulations</div>
              </div>
              <div className="h-12 w-px bg-border"></div>
              <div className="text-center">
                <div className="text-3xl font-bold text-secondary">{userStats.simulationsLimit - userStats.simulationsUsed}</div>
                <div className="text-xs text-muted-foreground">Restantes</div>
              </div>
            </div>
          </div>
          
          {/* Barre de progression */}
          <div className="mt-4">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-muted-foreground">Progression du mois</span>
              <span className="font-medium">
                {Math.round((userStats.simulationsUsed / userStats.simulationsLimit) * 100)}%
              </span>
            </div>
            <div className="w-full bg-background rounded-full h-2 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  userStats.simulationsUsed >= userStats.simulationsLimit ? 'bg-red-500' : 'bg-primary'
                }`}
                style={{ 
                  width: `${Math.min((userStats.simulationsUsed / userStats.simulationsLimit) * 100, 100)}%` 
                }}
              />
            </div>
          </div>
        </div>

        {/* Cartes de statistiques */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {stats.map((stat, idx) => {
            const Icon = stat.icon;
            const usagePercentage = stat.limit
              ? Math.round((Number(stat.value) / stat.limit) * 100)
              : 0;
            return (
              <div
                key={idx}
                className="p-6 rounded-xl bg-card border border-border hover:border-primary/50 transition-all duration-300 group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="p-3 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-all duration-300">
                    <Icon className="w-6 h-6 text-primary" />
                  </div>
                  <Badge 
                    variant={stat.trend.startsWith('+') ? "default" : "destructive"}
                    className="text-xs font-semibold"
                  >
                    {stat.trend}
                  </Badge>
                </div>
                <div className="text-2xl font-bold mb-1">{stat.value}</div>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                {stat.limit && (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Utilisation</span>
                      <span>{usagePercentage}%</span>
                    </div>
                    <div className="w-full bg-background rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${
                          usagePercentage > 80 ? 'bg-red-500' : 'bg-primary'
                        }`}
                        style={{ width: `${Math.min(usagePercentage, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Graphiques */}
        <div className="grid lg:grid-cols-3 gap-8 mb-8">
          {/* Graphique de tendance */}
          <div className="lg:col-span-2 p-6 rounded-xl bg-card border border-border">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold">
                Tendance des Simulations
              </h3>
              <Badge variant="outline" className="text-xs">
                6 derniers mois
              </Badge>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                  strokeOpacity={0.3}
                />
                <XAxis 
                  dataKey="month" 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                />
                <YAxis 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    color: 'hsl(var(--foreground))',
                    fontSize: '12px',
                  }}
                  formatter={(value, name) => {
                    if (name === 'simulations') return [value, 'Simulations'];
                    if (name === 'avgTime') return [`${value}min`, 'Temps moyen'];
                    return value;
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="simulations"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ 
                    fill: 'hsl(var(--primary))',
                    strokeWidth: 2,
                    r: 4 
                  }}
                  activeDot={{ r: 6 }}
                  name="Simulations"
                />
                <Line
                  type="monotone"
                  dataKey="avgTime"
                  stroke="hsl(var(--secondary))"
                  strokeWidth={2}
                  dot={{ 
                    fill: 'hsl(var(--secondary))',
                    strokeWidth: 2,
                    r: 4 
                  }}
                  activeDot={{ r: 6 }}
                  name="Temps moyen (min)"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Graphique circulaire */}
          <div className="p-6 rounded-xl bg-card border border-border">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold">
                Distribution par Type
              </h3>
              <Badge variant="outline" className="text-xs">
                Total: 100%
              </Badge>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={temperatureData}
                  cx="50%"
                  cy="50%"
                  labelLine={true}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {temperatureData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    color: 'hsl(var(--foreground))',
                    fontSize: '12px',
                  }}
                  formatter={(value, name, props) => {
                    return [`${value}%`, props.payload.name];
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            
            <div className="mt-4 grid grid-cols-3 gap-2">
              {temperatureData.map((item, index) => (
                <div key={index} className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: item.fill }}
                  />
                  <span className="text-xs text-muted-foreground">{item.name}</span>
                </div>
              ))}
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
            
            <div className="flex items-center gap-2">
              {refreshing && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  Actualisation...
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={refreshing || loading}
                aria-label="Actualiser"
              >
                <RefreshCw
                  className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
                />
                <span className="ml-2 hidden sm:inline">Actualiser</span>
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            {loading ? (
              <SimulationSkeleton />
            ) : error ? (
              <ErrorState />
            ) : simulations.length === 0 ? (
              <EmptyState />
            ) : (
              simulations.map((sim) => {
                const duration = sim.estimated_duration 
                  ? `${Math.round((sim.estimated_duration || 0) / 60)}min` 
                  : 'En cours';
                
                return (
                  <div
                    key={sim.id}
                    className="p-4 rounded-lg bg-background border border-border hover:border-primary/50 transition-all duration-300 cursor-pointer group"
                    onClick={() => setLocation(`/simulation/${sim.id}`)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        setLocation(`/simulation/${sim.id}`);
                      }
                    }}
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
                              {new Date(sim.created_at).toLocaleDateString('fr-FR', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric'
                              })}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>Durée: {duration}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Zap className="w-3 h-3" />
                            <span>Progression: {sim.progress || 0}%</span>
                          </div>
                        </div>
                        
                        <div className="mt-3">
                          <div className="flex justify-between text-xs text-muted-foreground mb-1">
                            <span>Progression</span>
                            <span>{sim.progress || 0}%</span>
                          </div>
                          <div className="w-full bg-background rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-full transition-all duration-500 ${getProgressColor(sim.status)}`}
                              style={{ width: `${sim.progress || 0}%` }}
                            />
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
                        {sim.description && (
                          <p className="text-xs text-muted-foreground mt-2 line-clamp-2 max-w-[200px]">
                            {sim.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          
          {simulations.length > 0 && (
            <div className="mt-6 pt-6 border-t border-border">
              <Button 
                variant="ghost" 
                className="w-full"
                onClick={() => setLocation('/dashboard/simulations')}
              >
                Voir toutes les simulations
              </Button>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-12 pt-8 border-t border-border">
        <div className="container mx-auto px-4">
          <div className="text-center text-sm text-muted-foreground">
            <p>
              VoltFlow AI Dashboard • Version 1.0 • 
              <span className="mx-2">•</span>
              <span className="text-primary">{userStats.subscriptionPlan} Plan</span>
            </p>
            <p className="mt-2">
              Besoin d'aide ?{' '}
              <a 
                href="mailto:support@voltflow.ai" 
                className="text-primary hover:underline"
              >
                Contactez le support
              </a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
