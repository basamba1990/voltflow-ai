-- ============================================
-- FIX SIMULATION RESULTS CONSTRAINTS
-- ============================================

-- 1. Ajout d'une contrainte unique sur simulation_id pour permettre le upsert
-- On vérifie d'abord si elle existe pour éviter les erreurs
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'simulation_results_simulation_id_key'
    ) THEN
        ALTER TABLE public.simulation_results 
        ADD CONSTRAINT simulation_results_simulation_id_key UNIQUE (simulation_id);
    END IF;
END $$;

-- 2. Ajout de la colonne error_message à la table simulations si elle n'existe pas
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'simulations' 
        AND column_name = 'error_message'
    ) THEN
        ALTER TABLE public.simulations ADD COLUMN error_message TEXT;
    END IF;
END $$;
