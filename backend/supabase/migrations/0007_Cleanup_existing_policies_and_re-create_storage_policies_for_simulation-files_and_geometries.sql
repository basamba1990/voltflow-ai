-- Cleanup existing policies and re-create storage policies for simulation-files and geometries
DO $$
BEGIN
  -- Remove known policy names (safe even if some don't exist)
  PERFORM 1;
END $$;

-- Ensure RLS is enabled on storage.objects (it should be already)
-- Create policies only if they don't already exist by first dropping with IF EXISTS

-- Drop conflicting policies first
DROP POLICY IF EXISTS "simfiles_insert_auth" ON storage.objects;
DROP POLICY IF EXISTS "simfiles_select_public" ON storage.objects;
DROP POLICY IF EXISTS "simfiles_delete_owner" ON storage.objects;
DROP POLICY IF EXISTS "geometries_insert_auth" ON storage.objects;
DROP POLICY IF EXISTS "geometries_select_owner" ON storage.objects;
DROP POLICY IF EXISTS "geometries_update_owner" ON storage.objects;
DROP POLICY IF EXISTS "geometries_delete_owner" ON storage.objects;
DROP POLICY IF EXISTS "service_role_all" ON storage.objects;

-- Update bucket visibility
UPDATE storage.buckets SET public = true WHERE id = 'simulation-files';
UPDATE storage.buckets SET public = false WHERE id = 'geometries';

-- Create policies for simulation-files
CREATE POLICY "simfiles_insert_auth"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'simulation-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "simfiles_select_public"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'simulation-files');

CREATE POLICY "simfiles_delete_owner"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'simulation-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Create policies for geometries
CREATE POLICY "geometries_insert_auth"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'geometries'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "geometries_select_owner"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'geometries'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "geometries_update_owner"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'geometries'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "geometries_delete_owner"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'geometries'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Service role full access
CREATE POLICY "service_role_all"
ON storage.objects FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Final check
SELECT id, name, public FROM storage.buckets WHERE id IN ('simulation-files','geometries');
