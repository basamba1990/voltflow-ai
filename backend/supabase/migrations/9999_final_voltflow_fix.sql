-- =============================================================================
-- VOLTFLOW-AI FINAL FIX SCRIPT
-- Purpose: Consolidate all RLS policies, fix storage permissions, and ensure
--          compatibility between Edge Functions and Database.
-- =============================================================================

-- 1. CLEANUP REDUNDANT POLICIES
-- Simulations
DROP POLICY IF EXISTS "Simulations: user insert" ON public.simulations;
DROP POLICY IF EXISTS "Users can insert own simulations" ON public.simulations;
DROP POLICY IF EXISTS "simulations_update_policy" ON public.simulations;
DROP POLICY IF EXISTS "Users can view own simulations" ON public.simulations;
DROP POLICY IF EXISTS "Users can update own simulations" ON public.simulations;
DROP POLICY IF EXISTS "Users can delete own simulations" ON public.simulations;
DROP POLICY IF EXISTS "Users can manage their own simulations" ON public.simulations;

-- Simulation Results
DROP POLICY IF EXISTS "Users can only insert results for their simulations" ON public.simulation_results;
DROP POLICY IF EXISTS "Users can view results of their simulations" ON public.simulation_results;
DROP POLICY IF EXISTS "Users can view own simulation results" ON public.simulation_results;
DROP POLICY IF EXISTS "Users can insert own simulation results" ON public.simulation_results;

-- 2. CREATE CONSOLIDATED POLICIES FOR TABLES
-- Simulations: Allow authenticated users to manage their own data
CREATE POLICY "Users can manage their own simulations" 
ON public.simulations 
FOR ALL 
TO authenticated 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

-- Simulations: Allow service_role (Edge Functions) to manage everything
CREATE POLICY "Service role can manage everything" 
ON public.simulations 
FOR ALL 
TO service_role 
USING (true)
WITH CHECK (true);

-- Simulation Results: Allow users to view results of their simulations
CREATE POLICY "Users can view results of their simulations" 
ON public.simulation_results 
FOR SELECT 
TO authenticated 
USING (auth.uid() = user_id);

-- Simulation Results: Allow service_role (Edge Functions) to insert/update results
CREATE POLICY "Service role can manage results" 
ON public.simulation_results 
FOR ALL 
TO service_role 
USING (true)
WITH CHECK (true);

-- 3. FIX STORAGE BUCKETS AND POLICIES
-- Ensure buckets exist
INSERT INTO storage.buckets (id, name, public) 
VALUES ('geometries', 'geometries', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('simulation-files', 'simulation-files', true)
ON CONFLICT (id) DO NOTHING;

-- Cleanup storage policies
DROP POLICY IF EXISTS "storage_insert_geometries 3demxc_0" ON storage.objects;
DROP POLICY IF EXISTS "storage_select_geometries 3demxc_0" ON storage.objects;
DROP POLICY IF EXISTS "storage_update_geometries 3demxc_0" ON storage.objects;
DROP POLICY IF EXISTS "storage_delete_geometries 3demxc_0" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own geometry files" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own geometry files" ON storage.objects;
DROP POLICY IF EXISTS "read_own_simulation_files" ON storage.objects;
DROP POLICY IF EXISTS "upload_own_simulation_files" ON storage.objects;
DROP POLICY IF EXISTS "update_own_simulation_files" ON storage.objects;
DROP POLICY IF EXISTS "delete_own_simulation_files" ON storage.objects;

-- Unified Storage Policies for 'geometries'
CREATE POLICY "Users can manage their own geometries"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'geometries' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'geometries' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Unified Storage Policies for 'simulation-files'
CREATE POLICY "Users can manage their own simulation files"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'simulation-files' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'simulation-files' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Service role access for storage (for Edge Functions)
CREATE POLICY "Service role can manage all storage objects"
ON storage.objects FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 4. FINAL DATA INTEGRITY CHECK
-- Ensure all simulations have a valid material_id
UPDATE public.simulations 
SET material_id = 'aluminum-6061'
WHERE material_id IS NULL 
   OR material_id NOT IN (SELECT id FROM public.materials);
