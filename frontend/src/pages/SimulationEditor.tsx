import { Button } from "@/components/ui/button";
import {
  Play,
  Save,
  RotateCcw,
  Download,
  Settings,
  Eye,
  Code,
  ArrowLeft,
} from "lucide-react";
import { useState } from "react";

/**
 * VoltFlow AI - Simulation Editor
 * Design: Interface professionnelle avec prévisualisation 3D
 */

export default function SimulationEditor() {
  const [activeTab, setActiveTab] = useState<"config" | "preview" | "code">(
    "config"
  );
  const [simulationRunning, setSimulationRunning] = useState(false);
  const [simulationProgress, setSimulationProgress] = useState(0);

  const handleRunSimulation = () => {
    setSimulationRunning(true);
    setSimulationProgress(0);

    // Simulate progress
    const interval = setInterval(() => {
      setSimulationProgress((prev) => {
        if (prev >= 100) {
          setSimulationRunning(false);
          clearInterval(interval);
          return 100;
        }
        return prev + Math.random() * 30;
      });
    }, 500);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-md">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="font-bold text-lg">Échangeur Thermique - Prototype A</h1>
              <p className="text-xs text-muted-foreground">
                Créé le 15 janvier 2025
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-2">
              <Save className="w-4 h-4" />
              Enregistrer
            </Button>
            <Button
              size="sm"
              className={`gap-2 ${
                simulationRunning
                  ? "bg-secondary hover:bg-secondary/90"
                  : "bg-primary hover:bg-primary/90"
              }`}
              onClick={handleRunSimulation}
              disabled={simulationRunning}
            >
              <Play className="w-4 h-4" />
              {simulationRunning ? "Simulation..." : "Exécuter"}
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left Panel - Configuration */}
          <div className="lg:col-span-1">
            <div className="p-6 rounded-xl bg-card border border-border sticky top-24">
              <h2 className="text-lg font-semibold mb-6">Configuration</h2>

              <div className="space-y-6">
                {/* Geometry */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Géométrie
                  </label>
                  <select className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:border-primary outline-none">
                    <option>Tube cylindrique</option>
                    <option>Plaque plane</option>
                    <option>Serpentin</option>
                    <option>Personnalisé</option>
                  </select>
                </div>

                {/* Material */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Matériau
                  </label>
                  <select className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:border-primary outline-none">
                    <option>Aluminium 6061</option>
                    <option>Cuivre</option>
                    <option>Acier inoxydable</option>
                    <option>Titane</option>
                  </select>
                </div>

                {/* Inlet Temperature */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Température d'entrée (°C)
                  </label>
                  <input
                    type="number"
                    defaultValue="25"
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:border-primary outline-none"
                  />
                </div>

                {/* Flow Rate */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Débit (L/min)
                  </label>
                  <input
                    type="number"
                    defaultValue="10"
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:border-primary outline-none"
                  />
                </div>

                {/* Mesh Density */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Densité du maillage
                  </label>
                  <div className="flex gap-2">
                    {["Faible", "Moyen", "Élevé"].map((level) => (
                      <button
                        key={level}
                        className="flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-smooth hover:border-primary bg-background border-border"
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Advanced Options */}
                <div className="pt-6 border-t border-border">
                  <button className="w-full flex items-center justify-between text-sm font-medium hover:text-primary transition-smooth">
                    <span>Options avancées</span>
                    <Settings className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel - Preview & Results */}
          <div className="lg:col-span-2">
            {/* Tabs */}
            <div className="flex gap-2 mb-6 border-b border-border">
              {(["config", "preview", "code"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-smooth ${
                    activeTab === tab
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab === "config" && "Configuration"}
                  {tab === "preview" && (
                    <span className="flex items-center gap-2">
                      <Eye className="w-4 h-4" />
                      Aperçu 3D
                    </span>
                  )}
                  {tab === "code" && (
                    <span className="flex items-center gap-2">
                      <Code className="w-4 h-4" />
                      Code
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Content */}
            {activeTab === "preview" && (
              <div className="p-8 rounded-xl bg-card border border-border">
                {simulationRunning ? (
                  <div className="flex flex-col items-center justify-center py-20">
                    <div className="mb-6 w-16 h-16 rounded-full border-4 border-border border-t-primary animate-spin" />
                    <h3 className="text-lg font-semibold mb-2">
                      Simulation en cours...
                    </h3>
                    <p className="text-muted-foreground mb-6">
                      {Math.round(simulationProgress)}% complété
                    </p>
                    <div className="w-full max-w-xs bg-background rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-primary to-secondary transition-all duration-300"
                        style={{ width: `${simulationProgress}%` }}
                      />
                    </div>
                  </div>
                ) : simulationProgress === 100 ? (
                  <div className="space-y-6">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="p-4 rounded-lg bg-background border border-border">
                        <p className="text-xs text-muted-foreground mb-1">
                          Température max
                        </p>
                        <p className="text-3xl font-bold text-primary">85.5°C</p>
                      </div>
                      <div className="p-4 rounded-lg bg-background border border-border">
                        <p className="text-xs text-muted-foreground mb-1">
                          Chute de pression
                        </p>
                        <p className="text-3xl font-bold text-secondary">
                          2.3 kPa
                        </p>
                      </div>
                    </div>
                    <div className="p-4 rounded-lg bg-background border border-border">
                      <p className="text-xs text-muted-foreground mb-3">
                        Efficacité thermique
                      </p>
                      <div className="w-full bg-background rounded-full h-3 overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-primary to-secondary w-4/5" />
                      </div>
                      <p className="text-sm font-semibold mt-2">82%</p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1 gap-2"
                        onClick={() => setSimulationProgress(0)}
                      >
                        <RotateCcw className="w-4 h-4" />
                        Réinitialiser
                      </Button>
                      <Button className="flex-1 bg-primary hover:bg-primary/90 gap-2">
                        <Download className="w-4 h-4" />
                        Exporter
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-20">
                    <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center mb-6">
                      <Eye className="w-10 h-10 text-primary" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">
                      Aperçu 3D
                    </h3>
                    <p className="text-muted-foreground text-center">
                      Exécutez la simulation pour voir les résultats
                      en temps réel
                    </p>
                  </div>
                )}
              </div>
            )}

            {activeTab === "code" && (
              <div className="p-6 rounded-xl bg-card border border-border">
                <pre className="text-xs overflow-auto max-h-96 text-muted-foreground">
                  {`{
  "geometry": "tube_cylindrique",
  "material": "aluminium_6061",
  "inlet_temperature": 25,
  "flow_rate": 10,
  "mesh_density": "high",
  "solver": {
    "type": "PINN",
    "iterations": 10000,
    "learning_rate": 0.001
  },
  "boundary_conditions": {
    "inlet": "dirichlet",
    "outlet": "neumann",
    "walls": "adiabatic"
  }
}`}
                </pre>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
