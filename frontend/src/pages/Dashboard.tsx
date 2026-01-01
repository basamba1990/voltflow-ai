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
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getSimulations, subscribeToSimulation, unsubscribeFromChannel } from "@/lib/supabase";
import { useLocation } from "wouter";
import { toast } from "sonner";

/**
 * VoltFlow AI - Dashboard
 * Design: Neon-Noir avec statistiques en temps réel
 */

export default function Dashboard() {
  const { user, profile, signOut } = useAuth()
  const [, setLocation] = useLocation()
  const [simulations, setSimulations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [realtimeChannels, setRealtimeChannels] = useState<any[]>([])

  const chartData = [
    { month: "Jan", simulations: 12, avgTime: 2.5 },
    { month: "Fév", simulations: 19, avgTime: 2.1 },
    { month: "Mar", simulations: 15, avgTime: 1.8 },
    { month: "Avr", simulations: 22, avgTime: 1.5 },
    { month: "Mai", simulations: 28, avgTime: 1.2 },
    { month: "Juin", simulations: 35, avgTime: 0.9 },
  ];

  const temperatureData = [
    { name: "Startup", value: 25, fill: "oklch(0.65 0.25 330)" },
    { name: "Optimisé", value: 45, fill: "oklch(0.55 0.28 260)" },
    { name: "Avancé", value: 30, fill: "oklch(0.75 0.15 200)" },
  ];

  const stats = [
    {
      label: "Simulations ce mois",
      value: profile?.simulations_used || "0",
      icon: Zap,
      trend: "+12%",
      limit: profile?.simulations_limit || 10,
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

  const loadSimulations = useCallback(async () => {
    try {
      setError(null)
      setLoading(true)
      const data = await getSimulations({ limit: 5 })
      setSimulations(data)
      
      // Subscribe to real-time updates for running simulations
      const runningSims = data.filter((sim: any) => 
        sim.status === 'running' || sim.status === 'pending'
      )
      
      // Clean up old channels
      realtimeChannels.forEach(channel => unsubscribeFromChannel(channel))
      
      // Create new channels
      const channels = runningSims.map((sim: any) => {
        return subscribeToSimulation(sim.id, (payload) => {
          setSimulations(prev => prev.map(s => 
            s.id === payload.new.id ? { ...s, ...payload.new } : s
          ))
        })
      })
      
      setRealtimeChannels(channels)
      
    } catch (error: any) {
      console.error('Error loading simulations:', error)
      setError(error.message)
      
      if (error.message.includes('NetworkError')) {
        toast.error('Problème de connexion. Vérifiez votre réseau.')
      } else if (error.message.includes('JWT')) {
        toast.error('Session expirée. Redirection...')
        setTimeout(() => signOut(), 2000)
      } else {
        toast.error('Erreur lors du chargement des simulations')
      }
      
      setSimulations([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [realtimeChannels, signOut])

  useEffect(() => {
    loadSimulations()
    
    return () => {
      // Cleanup realtime subscriptions
      realtimeChannels.forEach(channel => unsubscribeFromChannel(channel))
    }
  }, [])

  const handleSignOut = async () => {
    try {
      await signOut()
      toast.success('Déconnexion réussie')
    } catch (error) {
      toast.error('Erreur lors de la déconnexion')
    }
  }

  const handleNewSimulation = () => {
    setLocation('/simulation/new')
  }

  const handleRefresh = () => {
    setRefreshing(true)
    loadSimulations()
  }

  const SimulationSkeleton = () => (
    <div className="space-y-4">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="p-4 rounded-lg bg-background border border-border animate-pulse">
          <div className="flex items-center justify-between mb-2">
            <div className="h-4 bg-gray-700 rounded w-1/4"></div>
            <div className="h-3 bg-gray-800 rounded w-1/6"></div>
          </div>
          <div className="space-y-2">
            <div className="h-2 bg-gray-800 rounded w-full"></div>
            <div className="h-2 bg-gray-800 rounded w-5/6"></div>
          </div>
          <div className="mt-3 w-full bg-gray-800 rounded-full h-2">
            <div className="h-full bg-gray-700 rounded-full w-1/4"></div>
          </div>
        </div>
      ))}
    </div>
  )

  const ErrorState = () => (
    <div className="text-center py-8">
      <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
        <AlertCircle className="w-6 h-6 text-red-500" />
      </div>
      <h4 className="font-semibold mb-2">Erreur de chargement</h4>
      <p className="text-sm text-muted-foreground mb-4">
        {error || 'Impossible de charger les simulations'}
      </p>
      <Button 
        variant="outline" 
        size="sm"
        onClick={handleRefresh}
        disabled={refreshing}
      >
        <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
        Réessayer
      </Button>
    </div>
  )

  const EmptyState = () => (
    <div className="text-center py-8">
      <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
        <Zap className="w-6 h-6 text-primary" />
      </div>
      <h4 className="font-semibold mb-2">Aucune simulation</h4>
      <p className="text-sm text-muted-foreground mb-4">
        Commencez votre première simulation thermique
      </p>
      <Button 
        variant="outline" 
        size="sm"
        onClick={handleNewSimulation}
      >
        <Plus className="w-4 h-4 mr-2" />
        Créer une simulation
      </Button>
    </div>
  )

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-md">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <Zap className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="font-bold text-lg">VoltFlow AI</h1>
              <p className="text-xs text-muted-foreground">
                Dashboard • {profile?.subscription_plan || 'Starter'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Button 
              onClick={handleNewSimulation}
              className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
              disabled={loading}
            >
              <Plus className="w-4 h-4" />
              Nouvelle Simulation
            </Button>
            <Button variant="ghost" size="icon" disabled={loading}>
              <Settings className="w-5 h-5" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={handleSignOut}
              disabled={loading}
            >
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Welcome Section */}
        <div className="mb-8 p-6 rounded-xl bg-gradient-to-r from-primary/20 via-secondary/20 to-primary/20 border border-primary/30 neon-glow">
          <h2 className="text-2xl font-bold mb-2">
            Bienvenue, {profile?.full_name || 'Ingénieur'}!
          </h2>
          <p className="text-muted-foreground">
            Vous avez {profile?.simulations_used || 0} simulations ce mois sur {profile?.simulations_limit || 10}. Continuez à optimiser vos designs thermiques.
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid md:grid-cols-4 gap-4 mb-8">
          {stats.map((stat, idx) => {
            const Icon = stat.icon;
            const usagePercentage = stat.limit ? 
              Math.round((Number(stat.value) / stat.limit) * 100) : 0;
            
            return (
              <div
                key={idx}
                className="p-6 rounded-xl bg-card border border-border hover:border-primary/50 transition-smooth"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="p-2 rounded-lg bg-primary/20">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <span className={`text-xs font-semibold ${
                    stat.trend.startsWith('+') ? 'text-green-500' : 'text-red-500'
                  }`}>
                    {stat.trend}
                  </span>
                </div>
                <div className="text-2xl font-bold mb-1">{stat.value}</div>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                
                {stat.limit && (
                  <div className="mt-3 w-full bg-background rounded-full h-1 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        usagePercentage > 80 ? 'bg-red-500' : 'bg-primary'
                      }`}
                      style={{ width: `${Math.min(usagePercentage, 100)}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Charts Section */}
        <div className="grid lg:grid-cols-3 gap-8 mb-8">
          {/* Line Chart */}
          <div className="lg:col-span-2 p-6 rounded-xl bg-card border border-border">
            <h3 className="text-lg font-semibold mb-6">Tendance des Simulations</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.08 260 / 0.3)" />
                <XAxis stroke="oklch(0.75 0.05 60)" />
                <YAxis stroke="oklch(0.75 0.05 60)" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "oklch(0.18 0.04 260)",
                    border: "1px solid oklch(0.25 0.08 260 / 0.3)",
                    borderRadius: "8px",
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="simulations"
                  stroke="oklch(0.65 0.25 330)"
                  strokeWidth={2}
                  dot={{ fill: "oklch(0.65 0.25 330)" }}
                  name="Simulations"
                />
                <Line
                  type="monotone"
                  dataKey="avgTime"
                  stroke="oklch(0.55 0.28 260)"
                  strokeWidth={2}
                  dot={{ fill: "oklch(0.55 0.28 260)" }}
                  name="Temps moyen (min)"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Pie Chart */}
          <div className="p-6 rounded-xl bg-card border border-border">
            <h3 className="text-lg font-semibold mb-6">Distribution par Type</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={temperatureData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}%`}
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
                    backgroundColor: "oklch(0.18 0.04 260)",
                    border: "1px solid oklch(0.25 0.08 260 / 0.3)",
                    borderRadius: "8px",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Simulations */}
        <div className="p-6 rounded-xl bg-card border border-border">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold">Simulations Récentes</h3>
            <div className="flex items-center gap-2">
              {refreshing && (
                <span className="text-xs text-muted-foreground">
                  Actualisation...
                </span>
              )}
              <Button 
                variant="ghost" 
                size="sm"
                onClick={handleRefresh}
                disabled={refreshing || loading}
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
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
              simulations.map((sim) => (
                <div
                  key={sim.id}
                  className="p-4 rounded-lg bg-background border border-border hover:border-primary/50 transition-smooth flex items-center justify-between cursor-pointer group"
                  onClick={() => setLocation(`/simulation/${sim.id}`)}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h4 className="font-semibold group-hover:text-primary transition-smooth">
                        {sim.name}
                      </h4>
                      <span className={`text-xs px-2 py-1 rounded-full capitalize ${
                        sim.status === 'completed' 
                          ? 'bg-green-500/10 text-green-500' 
                          : sim.status === 'running'
                          ? 'bg-blue-500/10 text-blue-500'
                          : 'bg-yellow-500/10 text-yellow-500'
                      }`}>
                        {sim.status === 'completed' ? 'Terminée' : 
                         sim.status === 'running' ? 'En cours' : 
                         sim.status === 'failed' ? 'Échouée' : 'En attente'}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{new Date(sim.created_at).toLocaleDateString()}</span>
                      <span>Durée: {sim.status === 'completed' ? 'Terminée' : 'En cours'}</span>
                      <span>Progression: {sim.progress}%</span>
                    </div>
                    <div className="mt-3 w-full bg-background rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${
                          sim.status === "completed"
                            ? "bg-primary"
                            : sim.status === "running"
                            ? "bg-blue-500"
                            : "bg-secondary"
                        }`}
                        style={{ width: `${sim.progress}%` }}
                      />
                    </div>
                  </div>
                  <div className="ml-4 text-right">
                    <div className="text-2xl font-bold text-primary">
                      {sim.progress}%
                    </div>
                    <span className="text-xs text-muted-foreground capitalize">
                      {sim.status === "completed" ? "Terminée" : 
                       sim.status === "running" ? "En cours" : 
                       sim.status === "failed" ? "Échouée" : "En attente"}
                    </span>
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
