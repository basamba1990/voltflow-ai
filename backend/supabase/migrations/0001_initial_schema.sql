-- ============================================
-- INITIAL SETUP FOR VOLTFLOW AI (FIXED)
-- ============================================

-- 1. ENABLE EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. CREATE TABLES
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    role TEXT DEFAULT 'user',
    subscription_plan TEXT DEFAULT 'starter',
    subscription_status TEXT DEFAULT 'active',
    simulations_used INTEGER DEFAULT 0,
    simulations_limit INTEGER DEFAULT 10,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.materials (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    thermal_conductivity REAL NOT NULL,
    specific_heat REAL NOT NULL,
    density REAL NOT NULL,
    melting_point REAL,
    color_hex TEXT,
    is_public BOOLEAN DEFAULT true,
    created_by UUID REFERENCES public.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.simulations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    geometry_type TEXT NOT NULL,
    geometry_config JSONB DEFAULT '{}'::jsonb,
    material_id TEXT REFERENCES public.materials(id),
    boundary_conditions JSONB DEFAULT '{}'::jsonb,
    mesh_density TEXT DEFAULT 'medium',
    status TEXT DEFAULT 'pending',
    progress INTEGER DEFAULT 0,
    estimated_duration INTEGER,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.simulation_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    simulation_id UUID NOT NULL REFERENCES public.simulations(id) ON DELETE CASCADE,
    temperature_data JSONB DEFAULT '{}'::jsonb,
    pressure_data JSONB DEFAULT '{}'::jsonb,
    velocity_data JSONB DEFAULT '{}'::jsonb,
    max_temperature REAL,
    min_temperature REAL,
    pressure_drop REAL,
    thermal_efficiency REAL,
    convergence_metrics JSONB DEFAULT '{}'::jsonb,
    result_files JSONB DEFAULT '{}'::jsonb,
    visualization_config JSONB DEFAULT '{}'::jsonb,
    uncertainty_score REAL,
    domain_shift_alert BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.simulation_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    simulation_id UUID REFERENCES public.simulations(id) ON DELETE CASCADE,
    metric_type TEXT NOT NULL,
    value REAL NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.support_tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    status TEXT DEFAULT 'open',
    priority TEXT DEFAULT 'medium',
    assigned_to UUID REFERENCES public.users(id),
    resolution TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

-- 3. ENABLE ROW LEVEL SECURITY
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.simulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.simulation_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.simulation_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- 4. POLICIES
CREATE POLICY "Users can view own profile" ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Service role can manage all users" ON public.users FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Users can view own simulations" ON public.simulations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create simulations" ON public.simulations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own simulations" ON public.simulations FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own simulations" ON public.simulations FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Service role can manage all simulations" ON public.simulations FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Users can view own simulation results" ON public.simulation_results FOR SELECT USING (EXISTS (SELECT 1 FROM public.simulations WHERE simulations.id = simulation_results.simulation_id AND simulations.user_id = auth.uid()));
CREATE POLICY "Service role can insert simulation results" ON public.simulation_results FOR INSERT WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Everyone can view public materials" ON public.materials FOR SELECT USING (is_public = true OR created_by = auth.uid());
CREATE POLICY "Users can manage own materials" ON public.materials FOR ALL USING (created_by = auth.uid());

-- 5. FUNCTIONS & TRIGGERS
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_simulations_updated_at BEFORE UPDATE ON public.simulations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 6. STORAGE
INSERT INTO storage.buckets (id, name, public) VALUES ('geometries', 'geometries', false) ON CONFLICT (id) DO NOTHING;
CREATE POLICY "Users can manage own geometry files" ON storage.objects FOR ALL USING (bucket_id = 'geometries' AND (auth.uid()::text = (storage.foldername(name))[1]));
