-- ============================================
-- SCRIPT DE RÉPARATION COMPLET POUR SUPABASE
-- VERSION SIMPLIFIÉE ET CORRIGÉE
-- ============================================

-- 1. DÉSACTIVER LES CONTRAINTES TEMPORAIREMENT
SET session_replication_role = 'replica';

-- 2. SUPPRIMER LA CONTRAINTE FK SI ELLE EXISTE
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints 
               WHERE constraint_name = 'simulations_material_id_fkey' 
               AND table_name = 'simulations'
               AND table_schema = 'public') THEN
        
        ALTER TABLE public.simulations DROP CONSTRAINT simulations_material_id_fkey;
        RAISE NOTICE 'Contrainte FK material_id supprimée';
    END IF;
END $$;

-- 3. GESTION DE LA TABLE materials - APPROCHE SIMPLIFIÉE
-- Supprimer la table materials si elle existe (nous allons la recréer proprement)
DROP TABLE IF EXISTS public.materials CASCADE;

-- 4. CRÉER LA NOUVELLE TABLE materials AVEC id TEXT
CREATE TABLE public.materials (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT,
    thermal_conductivity DECIMAL,
    specific_heat DECIMAL,
    density DECIMAL,
    melting_point DECIMAL,
    color_hex TEXT,
    is_public BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. INSÉRER LES MATÉRIAUX DE BASE
INSERT INTO public.materials (
    id,
    name,
    category,
    thermal_conductivity,
    specific_heat,
    density,
    melting_point,
    color_hex,
    is_public
) VALUES
('aluminum-6061', 'Aluminum 6061', 'metal', 167.0, 896.0, 2700.0, 582.0, '#CCCCCC', true),
('copper', 'Copper', 'metal', 401.0, 385.0, 8960.0, 1084.0, '#B87333', true),
('stainless-steel-304', 'Stainless Steel 304', 'metal', 16.2, 500.0, 8000.0, 1400.0, '#E0E0E0', true),
('titanium-grade-2', 'Titanium Grade 2', 'metal', 22.0, 522.0, 4510.0, 1668.0, '#878681', true),
('silicon-carbide', 'Silicon Carbide', 'ceramic', 120.0, 750.0, 3210.0, 2730.0, '#2F4F4F', true),
('polycarbonate', 'Polycarbonate', 'polymer', 0.2, 1200.0, 1200.0, 155.0, '#87CEEB', true),
('carbon-fiber-composite', 'Carbon Fiber Composite', 'composite', 5.0, 710.0, 1600.0, 3550.0, '#1C1C1C', true);

-- 6. CORRIGER LA COLONNE material_id DANS simulations
DO $$ 
BEGIN
    -- Vérifier si material_id existe dans simulations
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_schema = 'public' 
               AND table_name = 'simulations' 
               AND column_name = 'material_id') THEN
        
        -- Si material_id est UUID, le convertir en TEXT
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
        
    ELSE
        -- Ajouter la colonne material_id si elle n'existe pas
        ALTER TABLE public.simulations ADD COLUMN material_id TEXT DEFAULT 'aluminum-6061';
        RAISE NOTICE 'Colonne material_id ajoutée à simulations';
    END IF;
    
    -- S'assurer que toutes les simulations ont un material_id valide
    UPDATE public.simulations 
    SET material_id = 'aluminum-6061'
    WHERE material_id IS NULL 
       OR material_id = ''
       OR material_id NOT IN (SELECT id FROM public.materials);
    
END $$;

-- 7. CRÉER LA CONTRAINTE FK
ALTER TABLE public.simulations 
ADD CONSTRAINT simulations_material_id_fkey 
FOREIGN KEY (material_id) REFERENCES public.materials(id)
ON DELETE SET NULL;

-- 8. CRÉER LES TABLES MANQUANTES SI NÉCESSAIRE
CREATE TABLE IF NOT EXISTS public.simulations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    geometry_type TEXT,
    geometry_config JSONB DEFAULT '{}'::jsonb,
    boundary_conditions JSONB DEFAULT '{}'::jsonb,
    material_id TEXT DEFAULT 'aluminum-6061',
    mesh_density TEXT DEFAULT 'medium',
    solver_type TEXT DEFAULT 'fem_fortran',
    status TEXT DEFAULT 'pending',
    progress INTEGER DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.simulation_results (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    simulation_id UUID NOT NULL REFERENCES public.simulations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    temperature_data JSONB DEFAULT '{}'::jsonb,
    max_temperature DECIMAL,
    min_temperature DECIMAL,
    average_temperature DECIMAL,
    uncertainty_score DECIMAL,
    result_files JSONB DEFAULT '{}'::jsonb,
    methodology TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(simulation_id)
);

-- 9. AJOUTER LES COLONNES MANQUANTES À simulations
DO $$ 
BEGIN
    -- Liste des colonnes à vérifier/ajouter
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'simulations' 
                   AND column_name = 'description') THEN
        ALTER TABLE public.simulations ADD COLUMN description TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'simulations' 
                   AND column_name = 'boundary_conditions') THEN
        ALTER TABLE public.simulations ADD COLUMN boundary_conditions JSONB DEFAULT '{}'::jsonb;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'simulations' 
                   AND column_name = 'geometry_config') THEN
        ALTER TABLE public.simulations ADD COLUMN geometry_config JSONB DEFAULT '{}'::jsonb;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'simulations' 
                   AND column_name = 'status') THEN
        ALTER TABLE public.simulations ADD COLUMN status TEXT DEFAULT 'pending';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'simulations' 
                   AND column_name = 'progress') THEN
        ALTER TABLE public.simulations ADD COLUMN progress INTEGER DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'simulations' 
                   AND column_name = 'material_id') THEN
        ALTER TABLE public.simulations ADD COLUMN material_id TEXT DEFAULT 'aluminum-6061';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'simulations' 
                   AND column_name = 'updated_at') THEN
        ALTER TABLE public.simulations ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
    
END $$;

-- 10. NETTOYER LES DONNÉES
-- Supprimer les UUID invalides
DELETE FROM public.simulations 
WHERE id::text = 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa' 
   OR user_id::text = 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa';

-- Mettre à jour les données existantes
UPDATE public.simulations 
SET 
    material_id = COALESCE(material_id, 'aluminum-6061'),
    boundary_conditions = COALESCE(boundary_conditions, '{"initial_temp": 1000, "ambient_temp": 25, "cooling_type": "natural_convection", "convection_coeff": 80, "fluid_type": "air", "fluid_velocity": 0}'::jsonb),
    geometry_config = COALESCE(geometry_config, '{"type": "stl"}'::jsonb),
    mesh_density = COALESCE(mesh_density, 'medium'),
    solver_type = COALESCE(solver_type, 'fem_fortran'),
    status = COALESCE(status, 'pending'),
    progress = COALESCE(progress, 0),
    updated_at = COALESCE(updated_at, NOW())
WHERE 
    material_id IS NULL 
    OR boundary_conditions IS NULL 
    OR geometry_config IS NULL 
    OR status IS NULL;

-- 11. CRÉER LES INDEX
CREATE INDEX IF NOT EXISTS idx_simulations_user_id ON public.simulations(user_id);
CREATE INDEX IF NOT EXISTS idx_simulations_status ON public.simulations(status);
CREATE INDEX IF NOT EXISTS idx_simulations_material_id ON public.simulations(material_id);
CREATE INDEX IF NOT EXISTS idx_simulation_results_simulation_id ON public.simulation_results(simulation_id);
CREATE INDEX IF NOT EXISTS idx_simulation_results_user_id ON public.simulation_results(user_id);

-- 12. RÉACTIVER LES CONTRAINTES
SET session_replication_role = 'origin';

-- 13. CRÉER UNE SIMULATION DE TEST
INSERT INTO public.simulations (
    id,
    user_id,
    name,
    description,
    geometry_type,
    geometry_config,
    boundary_conditions,
    material_id,
    mesh_density,
    solver_type,
    status,
    created_at,
    updated_at
) VALUES (
    gen_random_uuid(),
    'e0f72d33-7e94-4cba-bffc-9959be7a30d7',
    'Test Simulation',
    'Test de réparation',
    'stl',
    '{"type": "stl", "file_name": "test.stl"}'::jsonb,
    '{"initial_temp": 1000, "ambient_temp": 25, "cooling_type": "natural_convection", "convection_coeff": 80, "fluid_type": "air", "fluid_velocity": 0}'::jsonb,
    'aluminum-6061',
    'medium',
    'fem_fortran',
    'pending',
    NOW(),
    NOW()
) ON CONFLICT (id) DO NOTHING;

-- 14. CONFIGURER RLS (Row Level Security)
ALTER TABLE public.simulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.simulation_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;

-- Politique pour materials (lecture publique)
DROP POLICY IF EXISTS "Materials are viewable by everyone" ON public.materials;
CREATE POLICY "Materials are viewable by everyone"
ON public.materials FOR SELECT USING (true);

-- Politique pour simulations (utilisateurs voient seulement leurs propres simulations)
DROP POLICY IF EXISTS "Users can view own simulations" ON public.simulations;
CREATE POLICY "Users can view own simulations"
ON public.simulations FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own simulations" ON public.simulations;
CREATE POLICY "Users can insert own simulations"
ON public.simulations FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own simulations" ON public.simulations;
CREATE POLICY "Users can update own simulations"
ON public.simulations FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own simulations" ON public.simulations;
CREATE POLICY "Users can delete own simulations"
ON public.simulations FOR DELETE USING (auth.uid() = user_id);

-- Politique pour simulation_results
DROP POLICY IF EXISTS "Users can view own simulation results" ON public.simulation_results;
CREATE POLICY "Users can view own simulation results"
ON public.simulation_results FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own simulation results" ON public.simulation_results;
CREATE POLICY "Users can insert own simulation results"
ON public.simulation_results FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 15. VÉRIFICATION FINALE
SELECT '=== VÉRIFICATION DE LA STRUCTURE ===' as info;

-- Vérifier les tables
SELECT 
    table_name,
    COUNT(*) as colonnes
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name IN ('simulations', 'simulation_results', 'materials')
GROUP BY table_name
ORDER BY table_name;

-- Vérifier les types de colonnes
SELECT 
    table_name,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name IN ('materials', 'simulations')
AND column_name IN ('id', 'material_id')
ORDER BY table_name, column_name;

-- Compter les enregistrements
SELECT 
    'materials' as table_name,
    COUNT(*) as count,
    string_agg(id, ', ') as sample_ids
FROM public.materials
UNION ALL
SELECT 
    'simulations' as table_name,
    COUNT(*) as count,
    string_agg(DISTINCT material_id, ', ') as used_materials
FROM public.simulations;

-- 16. MESSAGE DE CONFIRMATION
DO $$ 
BEGIN
    RAISE NOTICE '============================================';
    RAISE NOTICE 'SCRIPT DE RÉPARATION TERMINÉ AVEC SUCCÈS';
    RAISE NOTICE '============================================';
    RAISE NOTICE '1. Table materials créée avec id TEXT';
    RAISE NOTICE '2. simulations.material_id en TEXT avec FK';
    RAISE NOTICE '3. 7 matériaux insérés';
    RAISE NOTICE '4. Données nettoyées';
    RAISE NOTICE '5. RLS policies configurées';
    RAISE NOTICE '6. Simulation de test créée';
    RAISE NOTICE '============================================';
END $$;
