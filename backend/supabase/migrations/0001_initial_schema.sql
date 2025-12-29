-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users table (extends Supabase Auth)
CREATE TABLE public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin', 'engineer')),
    subscription_plan TEXT DEFAULT 'starter' CHECK (subscription_plan IN ('starter', 'professional', 'enterprise')),
    simulations_used INTEGER DEFAULT 0,
    simulations_limit INTEGER DEFAULT 10,
    stripe_customer_id TEXT UNIQUE,
    stripe_subscription_id TEXT UNIQUE,
    subscription_status TEXT DEFAULT 'inactive',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Materials library
CREATE TABLE public.materials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('metal', 'ceramic', 'polymer', 'composite')),
    thermal_conductivity DECIMAL(10, 4) NOT NULL,
    specific_heat DECIMAL(10, 4) NOT NULL,
    density DECIMAL(10, 4) NOT NULL,
    melting_point DECIMAL(10, 2),
    color_hex TEXT DEFAULT '#808080',
    is_public BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES public.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Simulations
CREATE TABLE public.simulations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    geometry_type TEXT NOT NULL CHECK (geometry_type IN ('tube', 'plate', 'coil', 'custom')),
    geometry_config JSONB NOT NULL DEFAULT '{}',
    material_id UUID REFERENCES public.materials(id),
    boundary_conditions JSONB NOT NULL DEFAULT '{}',
    mesh_density TEXT DEFAULT 'medium' CHECK (mesh_density IN ('low', 'medium', 'high')),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    estimated_duration INTEGER,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Simulation results
CREATE TABLE public.simulation_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    simulation_id UUID NOT NULL REFERENCES public.simulations(id) ON DELETE CASCADE,
    temperature_data JSONB NOT NULL DEFAULT '[]',
    pressure_data JSONB NOT NULL DEFAULT '[]',
    velocity_data JSONB NOT NULL DEFAULT '[]',
    max_temperature DECIMAL(10, 2),
    min_temperature DECIMAL(10, 2),
    pressure_drop DECIMAL(10, 2),
    thermal_efficiency DECIMAL(5, 2),
    convergence_metrics JSONB,
    result_files JSONB,
    visualization_config JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Simulation metrics
CREATE TABLE public.simulation_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    simulation_id UUID REFERENCES public.simulations(id) ON DELETE CASCADE,
    metric_type TEXT NOT NULL CHECK (metric_type IN ('cpu_usage', 'memory_usage', 'gpu_usage', 'execution_time')),
    value DECIMAL(10, 2) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Support tickets
CREATE TABLE public.support_tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('billing', 'technical', 'feature', 'bug')),
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    assigned_to UUID REFERENCES public.users(id),
    resolution TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE
);

-- Row Level Security Policies
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.simulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.simulation_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Users can view own profile" ON public.users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.users
    FOR UPDATE USING (auth.uid() = id);

-- Materials policies
CREATE POLICY "Public materials are viewable by all" ON public.materials
    FOR SELECT USING (is_public = TRUE OR created_by = auth.uid());

CREATE POLICY "Users can create materials" ON public.materials
    FOR INSERT WITH CHECK (auth.uid() = created_by);

-- Simulations policies
CREATE POLICY "Users can view own simulations" ON public.simulations
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create simulations" ON public.simulations
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own simulations" ON public.simulations
    FOR UPDATE USING (user_id = auth.uid());

-- Simulation results policies
CREATE POLICY "Users can view own simulation results" ON public.simulation_results
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.simulations 
            WHERE simulations.id = simulation_results.simulation_id 
            AND simulations.user_id = auth.uid()
        )
    );

-- Support tickets policies
CREATE POLICY "Users can view own tickets" ON public.support_tickets
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create tickets" ON public.support_tickets
    FOR INSERT WITH CHECK (user_id = auth.uid());

-- Functions
CREATE OR REPLACE FUNCTION public.increment_simulations_used(user_uuid UUID)
RETURNS void AS $$
BEGIN
    UPDATE public.users 
    SET simulations_used = simulations_used + 1,
        updated_at = NOW()
    WHERE id = user_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_support_tickets_updated_at BEFORE UPDATE ON public.support_tickets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
