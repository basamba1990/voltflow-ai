-- ============================================
-- FIX CONSTRAINTS AND TYPES FOR VOLTFLOW AI
-- ============================================

-- 1. Ajout des contraintes CHECK pour la table simulations
ALTER TABLE public.simulations 
ADD CONSTRAINT simulations_status_check 
CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled'));

ALTER TABLE public.simulations 
ADD CONSTRAINT simulations_mesh_density_check 
CHECK (mesh_density IN ('low', 'medium', 'high'));

-- 2. Ajout des contraintes CHECK pour la table simulation_results
ALTER TABLE public.simulation_results 
ADD CONSTRAINT simulation_results_uncertainty_check 
CHECK (uncertainty_score >= 0 AND uncertainty_score <= 1);

-- 3. Mise à jour des types pour plus de précision scientifique (REAL -> DOUBLE PRECISION)
ALTER TABLE public.materials ALTER COLUMN thermal_conductivity TYPE DOUBLE PRECISION;
ALTER TABLE public.materials ALTER COLUMN specific_heat TYPE DOUBLE PRECISION;
ALTER TABLE public.materials ALTER COLUMN density TYPE DOUBLE PRECISION;
ALTER TABLE public.materials ALTER COLUMN melting_point TYPE DOUBLE PRECISION;

ALTER TABLE public.simulation_results ALTER COLUMN max_temperature TYPE DOUBLE PRECISION;
ALTER TABLE public.simulation_results ALTER COLUMN min_temperature TYPE DOUBLE PRECISION;
ALTER TABLE public.simulation_results ALTER COLUMN pressure_drop TYPE DOUBLE PRECISION;
ALTER TABLE public.simulation_results ALTER COLUMN thermal_efficiency TYPE DOUBLE PRECISION;
ALTER TABLE public.simulation_results ALTER COLUMN uncertainty_score TYPE DOUBLE PRECISION;

ALTER TABLE public.simulation_metrics ALTER COLUMN value TYPE DOUBLE PRECISION;

-- 4. Indexation pour la performance
CREATE INDEX IF NOT EXISTS idx_simulations_user_id ON public.simulations(user_id);
CREATE INDEX IF NOT EXISTS idx_simulations_status ON public.simulations(status);
CREATE INDEX IF NOT EXISTS idx_simulation_results_simulation_id ON public.simulation_results(simulation_id);
