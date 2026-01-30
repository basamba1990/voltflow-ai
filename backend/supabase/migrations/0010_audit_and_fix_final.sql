-- =============================================================================
-- VOLTFLOW-AI : AUDIT & CORRECTION FINALE (INTÉGRITÉ SCIENTIFIQUE)
-- =============================================================================

-- 1. Nettoyage et Standardisation des Statuts
ALTER TABLE public.simulations 
DROP CONSTRAINT IF EXISTS check_simulation_status;

ALTER TABLE public.simulations 
ADD CONSTRAINT check_simulation_status 
CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled'));

-- 2. Correction de la table simulation_results (Ajout user_id et contraintes)
ALTER TABLE public.simulation_results 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Migration des données user_id manquantes
UPDATE public.simulation_results sr
SET user_id = s.user_id
FROM public.simulations s
WHERE sr.simulation_id = s.id
AND sr.user_id IS NULL;

-- Rendre user_id obligatoire pour la traçabilité
ALTER TABLE public.simulation_results 
ALTER COLUMN user_id SET NOT NULL;

-- 3. Sécurisation RLS (Row Level Security)
ALTER TABLE public.simulation_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can only view results for their simulations" ON public.simulation_results;
DROP POLICY IF EXISTS "Users can only insert results for their simulations" ON public.simulation_results;
DROP POLICY IF EXISTS "Service role can manage all results" ON public.simulation_results;

-- Politique de lecture : Propriétaire uniquement
CREATE POLICY "Users can only view results for their simulations" 
ON public.simulation_results FOR SELECT 
USING (auth.uid() = user_id);

-- Politique d'insertion : Authentifié (via Edge Function ou direct si autorisé)
CREATE POLICY "Users can only insert results for their simulations" 
ON public.simulation_results FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Politique Service Role (pour les Edge Functions utilisant la clé de service)
CREATE POLICY "Service role can manage all results" 
ON public.simulation_results FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- 4. Optimisation des Index pour la performance
CREATE INDEX IF NOT EXISTS idx_simulation_results_user_id_sim_id 
ON public.simulation_results(user_id, simulation_id);

-- 5. Audit & Traçabilité (Table mesh_data si elle existe)
DO $$ 
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'mesh_data') THEN
        ALTER TABLE public.mesh_data ENABLE ROW LEVEL SECURITY;
        
        DROP POLICY IF EXISTS "Users can manage own mesh data" ON public.mesh_data;
        CREATE POLICY "Users can manage own mesh data" 
        ON public.mesh_data FOR ALL 
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;

-- 6. Correction Storage (Bucket simulation-files)
-- S'assurer que le bucket est public pour la visualisation VTK si nécessaire
UPDATE storage.buckets SET public = true WHERE id = 'simulation-files';

-- Politiques Storage robustes
DROP POLICY IF EXISTS "simfiles_insert_auth" ON storage.objects;
CREATE POLICY "simfiles_insert_auth"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'simulation-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "simfiles_select_public" ON storage.objects;
CREATE POLICY "simfiles_select_public"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'simulation-files');
