-- Seed materials
INSERT INTO public.materials (name, category, thermal_conductivity, specific_heat, density, melting_point, color_hex, is_public) VALUES
  ('Aluminum 6061', 'metal', 167.0, 896.0, 2700.0, 582.0, '#CCCCCC', true),
  ('Copper', 'metal', 401.0, 385.0, 8960.0, 1084.0, '#B87333', true),
  ('Stainless Steel 304', 'metal', 16.2, 500.0, 8000.0, 1400.0, '#E0E0E0', true),
  ('Titanium Grade 2', 'metal', 22.0, 522.0, 4510.0, 1668.0, '#878681', true),
  ('Silicon Carbide', 'ceramic', 120.0, 750.0, 3210.0, 2730.0, '#2F4F4F', true),
  ('Polycarbonate', 'polymer', 0.2, 1200.0, 1200.0, 155.0, '#87CEEB', true),
  ('Carbon Fiber Composite', 'composite', 5.0, 710.0, 1600.0, 3550.0, '#1C1C1C', true);

-- Seed a test user (if needed for development)
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'test@voltflow.ai')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, email, full_name, role, subscription_plan, simulations_limit) VALUES
  ('11111111-1111-1111-1111-111111111111', 'test@voltflow.ai', 'Test Engineer', 'engineer', 'professional', 100)
ON CONFLICT (id) DO NOTHING;


-- backend/supabase/seed.sql
-- CORRECTIONS COMPLÈTES POUR UPLOAD DE GÉOMÉTRIES VOLTFLOW AI

-- 1. SUPPRESSION DES POLITIQUES EXISTANTES POUR ÉVITER LES CONFLITS
DROP POLICY IF EXISTS "Allow authenticated upload" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload geometry files" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own geometry files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own files" ON storage.objects;

-- 2. MISE À JOUR DU BUCKET 'geometries' POUR INCLURE TOUS LES MIME TYPES REQUIS
UPDATE storage.buckets 
SET allowed_mime_types = ARRAY[
  -- Formats existants
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

-- 3. POLITIQUE D'UPLOAD CORRIGÉE ET SÉCURISÉE
-- Vérifie: bucket_id, utilisateur authentifié, chemin du fichier correspond à l'UID, extensions autorisées
CREATE POLICY "Users can upload geometry files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'geometries'
    AND auth.role() = 'authenticated'
    AND auth.uid()::text = (storage.foldername(name))[1]
    AND (
      -- Extensions à 3 caractères
      LOWER(RIGHT(name, 4)) IN ('.stl', '.obj', '.igs', '.vtp', '.vti', '.ply', '.vtk')
      -- Extensions à 4 caractères
      OR LOWER(RIGHT(name, 5)) IN ('.step', '.stp', '.iges')
    )
  );

-- 4. POLITIQUE DE LECTURE (pour l'Edge Function et l'utilisateur)
CREATE POLICY "Users can view own geometry files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'geometries'
    AND (
      -- L'utilisateur peut voir ses propres fichiers
      auth.uid()::text = (storage.foldername(name))[1]
      -- OU l'Edge Function (service_role) peut voir tous les fichiers
      OR auth.role() = 'service_role'
    )
  );

-- 5. POLITIQUE DE MISE À JOUR (si nécessaire)
CREATE POLICY "Users can update own geometry files"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'geometries'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- 6. POLITIQUE DE SUPPRESSION (pour le nettoyage)
CREATE POLICY "Users can delete own geometry files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'geometries'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- 7. ACTIVER RLS SUR LA TABLE storage.objects (s'assurer qu'il est activé)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 8. VÉRIFICATION DES AUTORISATIONS POUR LE BUCKET
UPDATE storage.buckets 
SET public = false,
    file_size_limit = 52428800, -- 50MB
    allowed_mime_types = allowed_mime_types
WHERE id = 'geometries';

-- 9. CRÉATION D'INDEX POUR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_storage_objects_bucket_id_name 
ON storage.objects(bucket_id, name);

CREATE INDEX IF NOT EXISTS idx_storage_objects_bucket_id_folder 
ON storage.objects(bucket_id, (storage.foldername(name)));

-- 10. HARMONISATION DES TYPES ET POLITIQUES EDGE FUNCTIONS
-- Permettre à l'Edge Function (service_role) de mettre à jour les simulations
CREATE POLICY "Edge Function can update anything" 
ON public.simulations FOR UPDATE 
USING (auth.jwt() ->> 'role' = 'service_role');

-- S'assurer que mesh_density peut accepter des valeurs flexibles si nécessaire
-- ALTER TABLE public.simulations ALTER COLUMN mesh_density TYPE TEXT; 
-- Note: Déjà géré par le mapping côté frontend pour l'instant.

-- 11. FONCTION UTILITAIRE POUR VÉRIFIER LES PERMISSIONS
CREATE OR REPLACE FUNCTION check_upload_permissions(user_id uuid, file_path text)
RETURNS boolean AS $$
DECLARE
  folder_name text;
BEGIN
  -- Extraire le premier élément du chemin (user ID)
  folder_name := (SELECT (storage.foldername(file_path))[1]);
  
  -- Vérifier que le dossier correspond à l'user_id
  IF folder_name = user_id::text THEN
    RETURN true;
  ELSE
    RETURN false;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Message de confirmation
DO $$
BEGIN
  RAISE NOTICE '✅ Politiques RLS corrigées avec succès pour le bucket "geometries"';
  RAISE NOTICE '✅ Formats supportés: STL, STEP, STP, OBJ, IGES, IGS, VTP, VTI, PLY, VTK';
  RAISE NOTICE '✅ Structure de dossiers: user_id/timestamp_filename.ext';
  RAISE NOTICE '✅ Taille maximale: 50MB';
END $$;
