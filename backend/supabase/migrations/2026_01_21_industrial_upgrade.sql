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

-- Index pour performances
CREATE INDEX IF NOT EXISTS idx_simulations_solver_type ON public.simulations(solver_type);
CREATE INDEX IF NOT EXISTS idx_mesh_data_simulation_id ON public.mesh_data(simulation_id);
CREATE INDEX IF NOT EXISTS idx_visualization_data_simulation_id ON public.visualization_data(simulation_id);

-- Vue pour les rapports de simulation
CREATE OR REPLACE VIEW simulation_reports AS
SELECT 
    s.id,
    s.name,
    s.status,
    s.created_at,
    sr.max_temperature,
    sr.min_temperature,
    sr.thermal_efficiency,
    sr.uncertainty_score,
    m.element_count,
    m.quality_metric,
    v.vtk_file_url
FROM simulations s
LEFT JOIN simulation_results sr ON s.id = sr.simulation_id
LEFT JOIN mesh_data m ON s.id = m.simulation_id
LEFT JOIN visualization_data v ON s.id = v.simulation_id;
