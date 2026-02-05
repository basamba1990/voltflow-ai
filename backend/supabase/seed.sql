-- File: backend/supabase/seed.sql (ou nouvelle migration)

-- ============================================
-- SCRIPT DE RÉPARATION COMPLET POUR SUPABASE
-- VERSION CORRIGÉE ET SIMPLIFIÉE
-- ============================================

-- 1. DÉSACTIVER LES CONTRAINTES TEMPORAIREMENT
SET session_replication_role = 'replica';

-- 2. SUPPRIMER LES POLITIQUES EXISTANTES POUR ÉVITER LES CONFLITS
-- (Assurez-vous que ces DROP POLICY sont exécutés avant de recréer)
DROP POLICY IF EXISTS "Users can upload geometry files" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own geometry files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own geometry files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own geometry files" ON storage.objects;
DROP POLICY IF EXISTS "Service role can upload geometry files for users" ON storage.objects;
DROP POLICY IF EXISTS "Users and service role can view own geometry files" ON storage.objects;
DROP POLICY IF EXISTS "Users and service role can update own geometry files" ON storage.objects;
DROP POLICY IF EXISTS "Users and service role can delete own geometry files" ON storage.objects;

-- 3. MISE À JOUR DU BUCKET 'geometries' POUR INCLURE TOUS LES MIME TYPES REQUIS
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/octet-stream',  -- Format générique pour fichiers binaires
  'application/sla',           -- STL ASCII
  'model/stl',                 -- STL binaire
  'application/step',          -- STEP
  'application/stp',           -- STP
  'application/iges',          -- IGES
  'application/igs',           -- IGS
  'model/obj',                 -- OBJ
  'application/ply',           -- PLY
  'application/vtk',           -- VTK
  'application/vnd.kitware.vtp', -- VTP
  'application/vnd.kitware.vti', -- VTI
  'text/plain',                -- Fichiers texte
  'application/json',          -- Fichiers JSON
  'application/xml',           -- XML (STEP/VTK)
  'text/xml'                   -- XML (STEP/VTK)
]
WHERE id = 'geometries';

-- 4. POLITIQUE D'UPLOAD CORRIGÉE ET SÉCURISÉE
-- Permet au service_role d'uploader pour le compte de l'utilisateur
CREATE POLICY "Service role can upload geometry files for users"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'geometries'
    AND (
      -- L'utilisateur peut uploader ses propres fichiers
      auth.uid()::text = (storage.foldername(name))[1]
      -- OU le service_role peut uploader pour n'importe quel utilisateur (vérifié dans l'Edge Function)
      OR auth.role() = 'service_role'
    )
    AND (
      -- Extensions à 3 caractères
      LOWER(RIGHT(name, 4)) IN ('.stl', '.obj', '.igs', '.vtp', '.vti', '.ply', '.vtk')
      -- Extensions à 4 caractères
      OR LOWER(RIGHT(name, 5)) IN ('.step', '.stp', '.iges')
    )
  );

-- 5. POLITIQUE DE LECTURE (pour l'Edge Function et l'utilisateur)
CREATE POLICY "Users and service role can view own geometry files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'geometries'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR auth.role() = 'service_role'
    )
  );

-- 6. POLITIQUE DE MISE À JOUR (si nécessaire)
CREATE POLICY "Users and service role can update own geometry files"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'geometries'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR auth.role() = 'service_role'
    )
  );

-- 7. POLITIQUE DE SUPPRESSION (pour le nettoyage)
CREATE POLICY "Users and service role can delete own geometry files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'geometries'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR auth.role() = 'service_role'
    )
  );

-- 8. ACTIVER RLS SUR LA TABLE storage.objects (s'assurer qu'il est activé)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 9. VÉRIFICATION DES AUTORISATIONS POUR LE BUCKET
UPDATE storage.buckets
SET public = false,
    file_size_limit = 52428800, -- 50MB
    allowed_mime_types = allowed_mime_types
WHERE id = 'geometries';

-- 10. CORRECTION DE LA COLONNE material_id DANS simulations
-- S'assurer que material_id est de type TEXT et a une FK valide
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public'
               AND table_name = 'simulations'
               AND column_name = 'material_id'
               AND data_type = 'uuid') THEN

        -- Mettre à jour toutes les valeurs material_id vers 'aluminum-6061' (valeur par défaut)
        UPDATE public.simulations
        SET material_id = 'aluminum-6061'
        WHERE material_id IS NOT NULL;

        -- Changer le type de la colonne de UUID à TEXT
        ALTER TABLE public.simulations
        ALTER COLUMN material_id TYPE TEXT USING material_id::text;

        RAISE NOTICE 'Colonne simulations.material_id convertie de UUID à TEXT';

    END IF;

    -- S'assurer que toutes les simulations ont un material_id valide
    UPDATE public.simulations
    SET material_id = 'aluminum-6061'
    WHERE material_id IS NULL
       OR material_id = ''
       OR material_id NOT IN (SELECT id FROM public.materials);

END $$;

-- 11. Assurer la cohérence des IDs de matériaux dans la table materials
-- Les IDs doivent être en minuscules et avec des tirets pour correspondre au frontend
UPDATE public.materials
SET id = LOWER(REPLACE(name, ' ', '-'))
WHERE id IS DISTINCT FROM LOWER(REPLACE(name, ' ', '-'));

-- 12. Recréer la FK si elle a été supprimée ou n'existe pas
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                   WHERE constraint_name = 'simulations_material_id_fkey'
                   AND table_name = 'simulations'
                   AND table_schema = 'public') THEN
        ALTER TABLE public.simulations
        ADD CONSTRAINT simulations_material_id_fkey
        FOREIGN KEY (material_id) REFERENCES public.materials(id)
        ON DELETE SET NULL;
        RAISE NOTICE 'Contrainte FK simulations_material_id_fkey recréée';
    END IF;
END $$;

-- 13. Mettre à jour la politique RLS pour simulations pour permettre au service_role de mettre à jour
DROP POLICY IF EXISTS "Edge Function can update anything" ON public.simulations;
CREATE POLICY "Edge Function can update simulations"
ON public.simulations FOR UPDATE
USING (auth.role() = 'service_role' OR auth.uid() = user_id);

-- 14. Mettre à jour la politique RLS pour simulation_results pour permettre au service_role d'insérer
DROP POLICY IF EXISTS "Edge Function can insert simulation results" ON public.simulation_results;
CREATE POLICY "Edge Function can insert simulation results"
ON public.simulation_results FOR INSERT WITH CHECK (auth.role() = 'service_role' OR auth.uid() = user_id);

-- 15. RÉACTIVER LES CONTRAINTES
SET session_replication_role = 'origin';

-- Message de confirmation
DO $$
BEGIN
  RAISE NOTICE '✅ Politiques RLS corrigées avec succès pour le bucket "geometries"';
  RAISE NOTICE '✅ Formats supportés: STL, STEP, STP, OBJ, IGES, IGS, VTP, VTI, PLY, VTK';
  RAISE NOTICE '✅ Structure de dossiers: user_id/timestamp_filename.ext';
  RAISE NOTICE '✅ Taille maximale: 50MB';
  RAISE NOTICE '✅ material_id corrigé et FK recréée';
  RAISE NOTICE '✅ Politiques RLS pour simulations et simulation_results mises à jour';
END $$;
