import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

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
      const { data, error } = await supabase
        .from('simulations')
        .select(`
          *,
          simulation_results (*),
          materials (*)
        `)
        .eq('id', simulationId)
        .single();

      if (error) throw error;

      setSimulation(data);
      
      if (data.simulation_results && data.simulation_results.length > 0) {
        setResults(data.simulation_results[0]);
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
    try {
      setIsRunning(true);
      setProgress(0);
      
      const { error } = await supabase.functions.invoke('simulate-complex', {
        body: {
          simulation_id: simulationId,
          config: simulation?.geometry_config || {},
        },
      });

      if (error) throw error;

      toast.success('Simulation started');
    } catch (err: any) {
      setError(err.message);
      toast.error('Failed to start simulation');
      setIsRunning(false);
    }
  }, [simulationId, simulation]);

  const cancelSimulation = useCallback(async () => {
    try {
      const { error } = await supabase
        .from('simulations')
        .update({ status: 'cancelled' })
        .eq('id', simulationId);

      if (error) throw error;

      setIsRunning(false);
      toast.info('Simulation cancelled');
    } catch (err: any) {
      setError(err.message);
      toast.error('Failed to cancel simulation');
    }
  }, [simulationId]);

  useEffect(() => {
    if (!options.realtime || !simulationId) return;

    const channel = supabase
      .channel(`simulation-${simulationId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'simulations',
          filter: `id=eq.${simulationId}`,
        },
        (payload) => {
          const newData = payload.new;
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
            toast.success('Simulation completed');
            fetchSimulation();
          } else if (newData.status === 'failed') {
            toast.error(`Simulation failed: ${newData.error_message}`);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
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
    refresh: fetchSimulation,
  };
};
