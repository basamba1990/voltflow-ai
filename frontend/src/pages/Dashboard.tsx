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
} from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getSimulations } from "@/lib/supabase";
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

  useEffect(() => {
    loadSimulations()
  }, [])

  const loadSimulations = async () => {
    try {
      setLoading(true)
      const data = await getSimulations({ limit: 5 })
      setSimulations(data)
    } catch (error) {
      console.error('Error loading simulations:', error)
      toast.error('Erreur lors du chargement des simulations')
    } finally {
      setLoading(false)
    }
  }

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
            >
              <Plus className="w-4 h-4" />
              Nouvelle Simulation
            </Button>
            <Button variant="ghost" size="icon">
              <Settings className="w-5 h-5" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={handleSignOut}
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
            return (
              <div
                key={idx}
                className="p-6 rounded-xl bg-card border border-border hover:border-primary/50 transition-smooth"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="p-2 rounded-lg bg-primary/20">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-xs font-semibold text-primary">
                    {stat.trend}
                  </span>
                </div>
                <div className="text-2xl font-bold mb-1">{stat.value}</div>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
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
            <Button 
              variant="ghost" 
              size="sm"
              onClick={loadSimulations}
            >
              {loading ? 'Chargement...' : 'Actualiser'}
            </Button>
          </div>

          <div className="space-y-4">
            {simulations.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Aucune simulation pour le moment
              </div>
            ) : (
              simulations.map((sim) => (
                <div
                  key={sim.id}
                  className="p-4 rounded-lg bg-background border border-border hover:border-primary/50 transition-smooth flex items-center justify-between cursor-pointer"
                  onClick={() => setLocation(`/simulation/${sim.id}`)}
                >
                  <div className="flex-1">
                    <h4 className="font-semibold mb-2">{sim.name}</h4>
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
                      {sim.status === "completed" ? "Terminée" : "En cours"}
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
