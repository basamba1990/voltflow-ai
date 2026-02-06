-- Enable RLS on simulations and simulation_results if not already enabled
ALTER TABLE IF EXISTS public.simulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.simulation_results ENABLE ROW LEVEL SECURITY;

-- Drop policies with same names if they exist (ensure idempotence)
DROP POLICY IF EXISTS "Simulations: user select" ON public.simulations;
DROP POLICY IF EXISTS "Simulations: user insert" ON public.simulations;
DROP POLICY IF EXISTS "Simulations: user update" ON public.simulations;
DROP POLICY IF EXISTS "Simulations: user delete" ON public.simulations;

DROP POLICY IF EXISTS "SimResults: user select" ON public.simulation_results;
DROP POLICY IF EXISTS "SimResults: user insert" ON public.simulation_results;
DROP POLICY IF EXISTS "SimResults: user update" ON public.simulation_results;
DROP POLICY IF EXISTS "SimResults: user delete" ON public.simulation_results;

-- Create policies for simulations (user owns by user_id)
CREATE POLICY "Simulations: user select" ON public.simulations
  FOR SELECT
  TO authenticated
  USING ((select auth.uid())::uuid = user_id);

CREATE POLICY "Simulations: user insert" ON public.simulations
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid())::uuid = user_id);

CREATE POLICY "Simulations: user update" ON public.simulations
  FOR UPDATE
  TO authenticated
  USING ((select auth.uid())::uuid = user_id)
  WITH CHECK ((select auth.uid())::uuid = user_id);

CREATE POLICY "Simulations: user delete" ON public.simulations
  FOR DELETE
  TO authenticated
  USING ((select auth.uid())::uuid = user_id);

-- Create policies for simulation_results (user owns by user_id)
CREATE POLICY "SimResults: user select" ON public.simulation_results
  FOR SELECT
  TO authenticated
  USING ((select auth.uid())::uuid = user_id);

CREATE POLICY "SimResults: user insert" ON public.simulation_results
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid())::uuid = user_id);

CREATE POLICY "SimResults: user update" ON public.simulation_results
  FOR UPDATE
  TO authenticated
  USING ((select auth.uid())::uuid = user_id)
  WITH CHECK ((select auth.uid())::uuid = user_id);

CREATE POLICY "SimResults: user delete" ON public.simulation_results
  FOR DELETE
  TO authenticated
  USING ((select auth.uid())::uuid = user_id);

-- Brief validation: list policies created
SELECT pol.polname, n.nspname::text || '.' || c.relname AS table_name
FROM pg_policy pol
JOIN pg_class c ON pol.polrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public' AND c.relname IN ('simulations','simulation_results');
