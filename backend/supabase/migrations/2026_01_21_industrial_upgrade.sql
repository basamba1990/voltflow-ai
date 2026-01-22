-- Extension pour les données 3D
CREATE EXTENSION IF NOT EXISTS postgis;

-- Table améliorée pour les maillages complexes
CREATE TABLE IF NOT EXISTS public.mesh_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    simulation_id UUID REFERENCES public.simulations(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_size BIGINT,
    mesh_type TEXT DEFAULT 'tetrahedral',
    element_count INTEGER,
    node_count INTEGER,
    quality_metric REAL,
    bounds JSONB, -- {x: [min, max], y: [min, max], z: [min, max]}
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table pour les visualisations VTK
CREATE TABLE IF NOT EXISTS public.visualization_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    simulation_id UUID REFERENCES public.simulations(id) ON DELETE CASCADE,
    vtk_file_url TEXT,
    png_preview_url TEXT,
    animation_url TEXT,
    camera_angles JSONB DEFAULT '[]',
    color_map TEXT DEFAULT 'thermal',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table pour l'historique d'optimisation ARTEMIS
CREATE TABLE IF NOT EXISTS public.optimization_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    simulation_id UUID REFERENCES public.simulations(id) ON DELETE CASCADE,
    generation INTEGER NOT NULL,
    best_fitness REAL NOT NULL,
    average_fitness REAL NOT NULL,
    mutation_count INTEGER DEFAULT 0,
    hyperparameters JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Mise à jour de la table simulations
ALTER TABLE public.simulations
    ADD COLUMN IF NOT EXISTS mesh_density_level TEXT DEFAULT 'high',
    ADD COLUMN IF NOT EXISTS solver_type TEXT DEFAULT 'fem_fortran',
    ADD COLUMN IF NOT EXISTS optimization_enabled BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS vtk_visualization_enabled BOOLEAN DEFAULT true;

-- Mise à jour de la table simulation_results pour inclure les données VTK
ALTER TABLE public.simulation_results
    ADD COLUMN IF NOT EXISTS vtk_file_url TEXT,
    ADD COLUMN IF NOT EXISTS temperature_field JSONB,
    ADD COLUMN IF NOT EXISTS mesh_metadata JSONB,
    ADD COLUMN IF NOT EXISTS mesh_points INTEGER;

-- Index pour performances
CREATE INDEX IF NOT EXISTS idx_simulations_solver_type ON public.simulations(solver_type);
CREATE INDEX IF NOT EXISTS idx_mesh_data_simulation_id ON public.mesh_data(simulation_id);
CREATE INDEX IF NOT EXISTS idx_visualization_data_simulation_id ON public.visualization_data(simulation_id);
CREATE INDEX IF NOT EXISTS idx_simulation_results_vtk_url ON public.simulation_results(vtk_file_url);

-- Si une vue simulation_reports existe avec une définition incompatible, la supprimer d'abord
DROP VIEW IF EXISTS public.simulation_reports;

-- Vue pour les rapports de simulation avec données VTK
CREATE VIEW public.simulation_reports (
    simulation_id,
    simulation_name,
    simulation_status,
    simulation_created_at,
    result_max_temperature,
    result_min_temperature,
    result_thermal_efficiency,
    result_uncertainty_score,
    result_vtk_file_url,
    mesh_element_count,
    mesh_quality_metric,
    visualization_color_map,
    visualization_camera_angles
) AS
SELECT 
    s.id AS simulation_id,
    s.name AS simulation_name,
    s.status AS simulation_status,
    s.created_at AS simulation_created_at,
    sr.max_temperature AS result_max_temperature,
    sr.min_temperature AS result_min_temperature,
    sr.thermal_efficiency AS result_thermal_efficiency,
    sr.uncertainty_score AS result_uncertainty_score,
    sr.vtk_file_url AS result_vtk_file_url,
    m.element_count AS mesh_element_count,
    m.quality_metric AS mesh_quality_metric,
    v.color_map AS visualization_color_map,
    v.camera_angles AS visualization_camera_angles
FROM public.simulations s
LEFT JOIN public.simulation_results sr ON s.id = sr.simulation_id
LEFT JOIN public.mesh_data m ON s.id = m.simulation_id
LEFT JOIN public.visualization_data v ON s.id = v.simulation_id;

-- Fonction pour compter les maillages par type
CREATE OR REPLACE FUNCTION public.count_mesh_by_type()
RETURNS TABLE(mesh_type TEXT, count BIGINT) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(md.mesh_type, 'unknown') as mesh_type,
        COUNT(*)::BIGINT as count
    FROM public.mesh_data md
    GROUP BY md.mesh_type
    ORDER BY count DESC;
END;
$$ LANGUAGE plpgsql;

-- Trigger pour mettre à jour la date de modification
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Créer le trigger seulement si la colonne updated_at existe dans simulations
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'simulations' AND column_name = 'updated_at'
    ) THEN
        -- Supprimer l'ancien trigger s'il existe pour éviter doublons
        IF EXISTS (
            SELECT 1 FROM pg_trigger t
            JOIN pg_class c ON t.tgrelid = c.oid
            WHERE t.tgname = 'update_simulations_updated_at' AND c.relname = 'simulations'
        ) THEN
            DROP TRIGGER IF EXISTS update_simulations_updated_at ON public.simulations;
        END IF;

        CREATE TRIGGER update_simulations_updated_at 
            BEFORE UPDATE ON public.simulations 
            FOR EACH ROW 
            EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Fonction pour nettoyer les fichiers obsolètes
CREATE OR REPLACE FUNCTION public.cleanup_old_simulation_files(days_old INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Supprimer les simulations terminées depuis plus de X jours
    DELETE FROM public.simulations 
    WHERE status IN ('completed', 'failed', 'cancelled')
      AND completed_at IS NOT NULL
      AND completed_at < NOW() - (days_old || ' days')::interval;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Note: Les fichiers de stockage devraient être nettoyés séparément
    -- par un script cron qui utilise l'API de stockage
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Vue pour les statistiques de simulation
DROP VIEW IF EXISTS public.simulation_statistics;

CREATE VIEW public.simulation_statistics AS
SELECT 
    DATE_TRUNC('day', s.created_at) as date,
    COUNT(*) as total_simulations,
    COUNT(CASE WHEN s.status = 'completed' THEN 1 END) as completed,
    COUNT(CASE WHEN s.status = 'failed' THEN 1 END) as failed,
    COUNT(CASE WHEN s.status = 'running' THEN 1 END) as running,
    AVG(sr.computation_time) as avg_computation_time,
    AVG(sr.max_temperature) as avg_max_temp,
    AVG(sr.min_temperature) as avg_min_temp
FROM public.simulations s
LEFT JOIN public.simulation_results sr ON s.id = sr.simulation_id
GROUP BY DATE_TRUNC('day', s.created_at)
ORDER BY date DESC;

-- Index supplémentaires pour les performances
CREATE INDEX IF NOT EXISTS idx_simulations_created_at ON public.simulations(created_at);
CREATE INDEX IF NOT EXISTS idx_simulations_user_status ON public.simulations(user_id, status);
CREATE INDEX IF NOT EXISTS idx_mesh_data_type ON public.mesh_data(mesh_type);
CREATE INDEX IF NOT EXISTS idx_simulation_results_temp ON public.simulation_results(max_temperature, min_temperature);
