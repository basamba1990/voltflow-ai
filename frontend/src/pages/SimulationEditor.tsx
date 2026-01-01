import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from "@/components/ui/button";
import { Play, Eye, Code, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export default function SimulationEditor() {
  const [simulationRunning, setSimulationRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [simulationId, setSimulationId] = useState<string | null>(null);

  // Écoute en temps réel des changements de progression
  useEffect(() => {
    if (!simulationId) return;

    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'simulations', filter: `id=eq.${simulationId}` },
        (payload) => {
          const newProgress = payload.new.progress;
          setProgress(newProgress);
          if (payload.new.status === 'completed') {
            setSimulationRunning(false);
            toast.success("Simulation terminée avec succès !");
          }
          if (payload.new.status === 'failed') {
            setSimulationRunning(false);
            toast.error("La simulation a échoué.");
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [simulationId]);

  const handleRunSimulation = async () => {
    try {
      setSimulationRunning(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");

      // 1. Créer l'entrée de simulation
      const { data: sim, error: simError } = await supabase
        .from('simulations')
        .insert({
          user_id: user.id,
          name: "Nouvelle Simulation",
          status: 'pending'
        })
        .select()
        .single();

      if (simError) throw simError;
      setSimulationId(sim.id);

      // 2. Appeler l'Edge Function
      const { error: funcError } = await supabase.functions.invoke('simulate', {
        body: { simulationId: sim.id, userId: user.id, config: {} }
      });

      if (funcError) throw funcError;

    } catch (error: any) {
      toast.error(error.message);
      setSimulationRunning(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">Éditeur de Simulation</h1>
        <Button 
          onClick={handleRunSimulation} 
          disabled={simulationRunning}
          className="gap-2"
        >
          <Play className="w-4 h-4" />
          {simulationRunning ? `Calcul en cours (${progress}%)` : "Lancer la Simulation"}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-card p-6 rounded-xl border border-border">
          <h2 className="font-semibold mb-4 flex items-center gap-2"><Code className="w-4 h-4"/> Configuration</h2>
          <div className="space-y-4 opacity-70">
            <p className="text-sm">Paramètres PINN : Adam Optimizer</p>
            <p className="text-sm">Itérations : 10,000</p>
          </div>
        </div>

        <div className="bg-card p-6 rounded-xl border border-border flex flex-col items-center justify-center min-h-[200px]">
          {simulationRunning ? (
            <div className="w-full space-y-4">
              <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                <div className="bg-primary h-full transition-all duration-500" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-center text-sm animate-pulse">Résolution des équations de Navier-Stokes...</p>
            </div>
          ) : (
            <div className="text-center text-muted-foreground">
              <Eye className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>Prêt pour l'analyse thermique</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
