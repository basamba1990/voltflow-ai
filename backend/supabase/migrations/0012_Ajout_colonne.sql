-- 1. AJOUT COLONNES MANQUANTES
ALTER TABLE public.simulations
ADD COLUMN IF NOT EXISTS description text,
ADD COLUMN IF NOT EXISTS geometry_config jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS boundary_conditions jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS material_id uuid,
ADD COLUMN IF NOT EXISTS mesh_density text DEFAULT 'medium',
ADD COLUMN IF NOT EXISTS solver_type text DEFAULT 'fem_fortran',
ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS progress integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS error_message text,
ADD COLUMN IF NOT EXISTS started_at timestamptz,
ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- 2. MISE À JOUR VALEURS PAR DÉFAUT POUR LES LIGNES EXISTANTES
UPDATE public.simulations 
SET 
  geometry_config = COALESCE(geometry_config, '{}'::jsonb),
  boundary_conditions = COALESCE(boundary_conditions, '{}'::jsonb),
  mesh_density = COALESCE(mesh_density, 'medium'),
  solver_type = COALESCE(solver_type, 'fem_fortran'),
  status = COALESCE(status, 'pending'),
  progress = COALESCE(progress, 0)
WHERE 
  geometry_config IS NULL 
  OR boundary_conditions IS NULL 
  OR mesh_density IS NULL 
  OR solver_type IS NULL 
  OR status IS NULL 
  OR progress IS NULL;

-- 3. CRÉATION INDEX POUR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_simulations_user_status ON simulations(user_id, status);
CREATE INDEX IF NOT EXISTS idx_simulations_created_at ON simulations(created_at DESC);
