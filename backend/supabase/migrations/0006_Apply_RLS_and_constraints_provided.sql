-- Apply RLS and constraints provided
-- 1. Enable RLS on simulations
ALTER TABLE public.simulations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can only insert their own simulations" ON public.simulations;
DROP POLICY IF EXISTS "Users can only view their own simulations" ON public.simulations;
DROP POLICY IF EXISTS "Users can only update their own simulations" ON public.simulations;
DROP POLICY IF EXISTS "Users can only delete their own simulations" ON public.simulations;

CREATE POLICY "Users can only insert their own simulations" 
ON public.simulations FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can only view their own simulations" 
ON public.simulations FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can only update their own simulations" 
ON public.simulations FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can only delete their own simulations" 
ON public.simulations FOR DELETE 
USING (auth.uid() = user_id);

-- 2. Constraint status
ALTER TABLE public.simulations 
DROP CONSTRAINT IF EXISTS check_simulation_status;

ALTER TABLE public.simulations 
ADD CONSTRAINT check_simulation_status 
CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled'));

-- 3. Secure simulation_results
ALTER TABLE public.simulation_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can only insert results for their simulations" ON public.simulation_results;
DROP POLICY IF EXISTS "Users can only view results for their simulations" ON public.simulation_results;
DROP POLICY IF EXISTS "Users can only delete results for their simulations" ON public.simulation_results;

ALTER TABLE public.simulation_results 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

UPDATE public.simulation_results sr
SET user_id = s.user_id
FROM public.simulations s
WHERE sr.simulation_id = s.id
AND sr.user_id IS NULL;

CREATE POLICY "Users can only insert results for their simulations" 
ON public.simulation_results FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.simulations s 
    WHERE s.id = simulation_id 
    AND s.user_id = auth.uid()
  )
  OR auth.uid() = user_id
);

CREATE POLICY "Users can only view results for their simulations" 
ON public.simulation_results FOR SELECT 
USING (
  user_id = auth.uid() OR
  EXISTS (
    SELECT 1 FROM public.simulations s 
    WHERE s.id = simulation_id 
    AND s.user_id = auth.uid()
  )
);

CREATE POLICY "Users can only delete results for their simulations" 
ON public.simulation_results FOR DELETE 
USING (
  user_id = auth.uid() OR
  EXISTS (
    SELECT 1 FROM public.simulations s 
    WHERE s.id = simulation_id 
    AND s.user_id = auth.uid()
  )
);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_simulations_user_id ON public.simulations(user_id);
CREATE INDEX IF NOT EXISTS idx_simulations_status ON public.simulations(status);
CREATE INDEX IF NOT EXISTS idx_simulations_created_at ON public.simulations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_simulation_results_simulation_id ON public.simulation_results(simulation_id);
CREATE INDEX IF NOT EXISTS idx_simulation_results_user_id ON public.simulation_results(user_id);

-- 5. Integrity constraints
ALTER TABLE public.simulations 
ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE public.simulations 
ADD CONSTRAINT IF NOT EXISTS check_progress_range 
CHECK (progress >= 0 AND progress <= 100);

-- 7. Audit function and trigger
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  user_id uuid,
  action text,
  table_name text,
  record_id uuid,
  old_value text,
  new_value text,
  created_at timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION log_simulation_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO audit_logs (user_id, action, table_name, record_id, old_value, new_value)
    VALUES (
      NEW.user_id,
      'status_update',
      'simulations',
      NEW.id,
      OLD.status,
      NEW.status
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS simulation_status_change_trigger ON public.simulations;
CREATE TRIGGER simulation_status_change_trigger
AFTER UPDATE OF status ON public.simulations
FOR EACH ROW
EXECUTE FUNCTION log_simulation_status_change();
