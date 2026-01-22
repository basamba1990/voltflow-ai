import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import SimulationService from '@/services/simulation.service'; // Import du service

interface UseSimulationOptions {
  realtime?: boolean;
  autoRefresh?: boolean;
  onProgress?: (progress: number, status: string) => void;
}

export const useSimulation = (simulationId: string, options: UseSimulationOptions = {}) => {
  const [simulation, setSimulation] = useState<any>(null);
  const [results, setResults] = useState<any>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const fetchSimulation = useCallback(async () => {
    if (!simulationId) return;
    
    try {
      // Utilisation du service pour récupérer la simulation
      const data = await SimulationService.getSimulationById(simulationId);

      if (!data) {
        setSimulation(null);
        setResults(null);
        setIsRunning(false);
        return;
      }

      setSimulation(data);
      
      if (data.simulation_results && data.simulation_results.length > 0) {
        setResults(data.simulation_results[0]);
      } else {
        setResults(null);
      }

      setIsRunning(data.status === 'running');
      
      if (data.status === 'running' && data.progress) {
        setProgress(data.progress);
        if (options.onProgress) {
          options.onProgress(data.progress, data.status);
        }
      }
    } catch (err: any) {
      setError(err.message);
      console.error('Failed to fetch simulation:', err);
    }
  }, [simulationId, options]);

  const startSimulation = useCallback(async () => {
    if (!simulationId) return;
    try {
      setIsRunning(true);
      setProgress(0);
      
      // Utilisation du service pour lancer la simulation
      await SimulationService.startSimulation(simulationId);

      toast.success('Simulation lancée');
    } catch (err: any) {
      setError(err.message);
      toast.error(`Échec du lancement: ${err.message}`);
      setIsRunning(false);
      fetchSimulation(); // Rafraîchir pour obtenir le statut d'erreur
    }
  }, [simulationId, fetchSimulation]);

  const cancelSimulation = useCallback(async () => {
    if (!simulationId) return;
    try {
      // Le service de simulation ne gère pas directement l'annulation, on utilise Supabase
      const { error } = await supabase
        .from('simulations')
        .update({ status: 'cancelled' })
        .eq('id', simulationId);

      if (error) throw error;

      setIsRunning(false);
      toast.info('Simulation annulée');
      fetchSimulation();
    } catch (err: any) {
      setError(err.message);
      toast.error('Échec de l\'annulation de la simulation');
    }
  }, [simulationId, fetchSimulation]);

  const deleteSimulation = useCallback(async () => {
    if (!simulationId) return;
    try {
      await SimulationService.deleteSimulation(simulationId);
      toast.success('Simulation supprimée');
      // Réinitialiser l'état après la suppression
      setSimulation(null);
      setResults(null);
      setIsRunning(false);
      setProgress(0);
    } catch (err: any) {
      setError(err.message);
      toast.error(`Échec de la suppression: ${err.message}`);
      throw err; // Propager l'erreur pour que l'éditeur puisse gérer la redirection
    }
  }, [simulationId]);

  useEffect(() => {
    if (!options.realtime || !simulationId) return;

    const channel = SimulationService.subscribeToSimulation(simulationId, (payload) => {
      const newData = payload.new || payload.record;
      
      if (payload.table === 'simulations') {
        setSimulation((prev: any) => ({ ...prev, ...newData }));
        
        if (newData.status === 'running') {
          setIsRunning(true);
          setProgress(newData.progress || 0);
          if (options.onProgress) {
            options.onProgress(newData.progress, newData.status);
          }
        } else {
          setIsRunning(false);
        }

        if (newData.status === 'completed') {
          toast.success('Simulation terminée');
          fetchSimulation();
        } else if (newData.status === 'failed') {
          toast.error(`Simulation échouée: ${newData.error_message}`);
        }
      } else if (payload.table === 'simulation_results' && payload.eventType === 'INSERT') {
        setResults(newData);
      }
    });

    return () => {
      SimulationService.unsubscribeFromChannel(channel);
    };
  }, [simulationId, options.realtime, options.onProgress, fetchSimulation]);

  useEffect(() => {
    fetchSimulation();
  }, [fetchSimulation]);

  return {
    simulation,
    results,
    isRunning,
    progress,
    error,
    startSimulation,
    cancelSimulation,
    deleteSimulation, // Ajout de la fonction de suppression
    refresh: fetchSimulation,
  };
};
