-- =============================================================================
-- VOLTFLOW-AI — SCRIPT DE CONSOLIDATION ULTIME (MANUS + CHATGPT)
-- =============================================================================
-- Ce script combine les corrections de structure de base de données (Manus)
-- et les optimisations de stockage/sécurité (ChatGPT).

BEGIN;

-- -------------------------------------------------------------------------
-- 1. STRUCTURE DES DONNÉES (Correction Manus)
-- -------------------------------------------------------------------------

-- Nettoyage des résultats orphelins
DELETE FROM public.simulation_results sr
WHERE NOT EXISTS (SELECT 1 FROM public.simulations s WHERE s.id = sr.simulation_id);

-- Clé étrangère avec suppression en cascade
ALTER TABLE public.simulation_results
DROP CONSTRAINT IF EXISTS simulation_results_simulation_id_fkey;

ALTER TABLE public.simulation_results
ADD CONSTRAINT simulation_results_simulation_id_fkey
FOREIGN KEY (simulation_id)
REFERENCES public.simulations(id)
ON DELETE CASCADE;

-- Ajout et remplissage de user_id pour le RLS des résultats
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'simulation_results' AND column_name = 'user_id') THEN
    ALTER TABLE public.simulation_results ADD COLUMN user_id UUID;
  END IF;
END $$;

UPDATE public.simulation_results sr
SET user_id = s.user_id
FROM public.simulations s
WHERE sr.simulation_id = s.id AND sr.user_id IS NULL;

-- -------------------------------------------------------------------------
-- 2. CONFIGURATION STORAGE (Optimisation ChatGPT)
-- -------------------------------------------------------------------------

-- Configuration des buckets (Public = true pour éviter les erreurs d'accès aux fichiers 3D)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('geometries', 'geometries', true, 52428800, '{application/octet-stream,model/stl,application/sla,application/step,application/stp,application/iges,application/igs,model/obj,application/vnd.kitware.vtp,application/vnd.kitware.vti,application/ply,application/vtk,text/plain,text/vtk,model/mesh,application/cgns}'),
  ('simulation-files', 'simulation-files', true, 52428800, '{application/octet-stream,application/xml,text/xml,model/stl,application/sla,application/step,application/stp,application/iges,application/igs,model/obj,application/vnd.kitware.vtp,application/vnd.kitware.vti,application/ply,application/vtk,text/plain,text/vtk,model/mesh,application/cgns}')
ON CONFLICT (id) DO UPDATE SET 
  public = true,
  file_size_limit = 52428800,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- -------------------------------------------------------------------------
-- 3. POLITIQUES RLS UNIFIÉES (Sécurité Maximale)
-- -------------------------------------------------------------------------

-- RLS Table: simulation_results
ALTER TABLE public.simulation_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can only view results for their simulations" ON public.simulation_results;
DROP POLICY IF EXISTS "Users can only insert results for their simulations" ON public.simulation_results;
DROP POLICY IF EXISTS "Service role can manage all results" ON public.simulation_results;

CREATE POLICY "Users can only view results for their simulations" ON public.simulation_results FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can only insert results for their simulations" ON public.simulation_results FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role can manage all results" ON public.simulation_results FOR ALL TO service_role USING (true) WITH CHECK (true);

-- RLS Storage: objects
DROP POLICY IF EXISTS "upload_own_files" ON storage.objects;
DROP POLICY IF EXISTS "read_own_files" ON storage.objects;
DROP POLICY IF EXISTS "update_own_files" ON storage.objects;
DROP POLICY IF EXISTS "delete_own_files" ON storage.objects;

-- Politique d'Upload (Dossier = user_id ou 'anonymous')
CREATE POLICY "upload_own_files" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id IN ('geometries', 'simulation-files') AND (
    (auth.role() = 'authenticated' AND auth.uid()::text = (storage.foldername(name))[1]) OR
    (auth.role() = 'anon' AND (storage.foldername(name))[1] = 'anonymous')
  )
);

-- Politique de Lecture (Public car bucket public, mais RLS pour l'API)
CREATE POLICY "read_own_files" ON storage.objects FOR SELECT USING (
  bucket_id IN ('geometries', 'simulation-files') AND (
    (auth.role() = 'authenticated' AND auth.uid()::text = (storage.foldername(name))[1]) OR
    (auth.role() = 'anon' AND (storage.foldername(name))[1] = 'anonymous') OR
    (name LIKE '%.emptyFolderPlaceholder%')
  )
);

-- Politiques de Gestion (Update/Delete)
CREATE POLICY "manage_own_files" ON storage.objects FOR ALL USING (
  bucket_id IN ('geometries', 'simulation-files') AND (
    (auth.role() = 'authenticated' AND auth.uid()::text = (storage.foldername(name))[1]) OR
    (auth.role() = 'anon' AND (storage.foldername(name))[1] = 'anonymous')
  )
);

COMMIT;
