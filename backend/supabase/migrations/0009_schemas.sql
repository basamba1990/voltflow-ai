CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DROP TABLE IF EXISTS public.materials CASCADE;

CREATE TABLE public.materials (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  thermal_conductivity DOUBLE PRECISION,
  specific_heat DOUBLE PRECISION,
  density DOUBLE PRECISION,
  melting_point DOUBLE PRECISION,
  color_hex TEXT,
  is_public BOOLEAN DEFAULT true
);

DROP TABLE IF EXISTS public.simulations CASCADE;

CREATE TABLE public.simulations (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  material_id UUID NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT simulations_material_id_fkey
    FOREIGN KEY (material_id)
    REFERENCES public.materials(id)
    ON DELETE RESTRICT
);

INSERT INTO public.materials
(id, name, category, thermal_conductivity, specific_heat, density, melting_point, color_hex, is_public)
VALUES
('11111111-aaaa-1111-aaaa-111111111111', 'Aluminum 6061', 'metal', 167.0, 896.0, 2700.0, 582.0, '#CCCCCC', true),
('22222222-bbbb-2222-bbbb-222222222222', 'Copper', 'metal', 401.0, 385.0, 8960.0, 1084.0, '#B87333', true),
('33333333-cccc-3333-cccc-333333333333', 'Stainless Steel 304', 'metal', 16.2, 500.0, 8000.0, 1400.0, '#E0E0E0', true),
('44444444-dddd-4444-dddd-444444444444', 'Titanium Ti-6Al-4V', 'metal', 6.7, 526.0, 4430.0, 1660.0, '#B0B0B0', true),
('55555555-eeee-5555-eeee-555555555555', 'ABS Plastic', 'polymer', 0.18, 1300.0, 1040.0, 105.0, '#F5F5F5', true),
('66666666-ffff-6666-ffff-666666666666', 'PLA Plastic', 'polymer', 0.13, 1800.0, 1240.0, 160.0, '#EFEFEF', true),
('77777777-aaaa-7777-aaaa-777777777777', 'Carbon Fiber Composite', 'composite', 5.0, 710.0, 1600.0, 3550.0, '#1C1C1C', true)
ON CONFLICT (id) DO NOTHING;


DROP TABLE IF EXISTS public.simulations CASCADE;

CREATE TABLE public.simulations (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,

  geometry_type TEXT NOT NULL DEFAULT 'solid', -- ✅ FIX CRITIQUE

  geometry_params JSONB DEFAULT '{}'::jsonb,
  simulation_params JSONB DEFAULT '{}'::jsonb,

  material_id UUID NOT NULL,

  mesh_params JSONB DEFAULT '{}'::jsonb,
  mesh_quality TEXT DEFAULT 'medium',

  status TEXT DEFAULT 'pending',
  progress INTEGER DEFAULT 0,

  result_summary JSONB,
  result_files JSONB,

  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,

  priority TEXT DEFAULT 'normal',
  solver TEXT DEFAULT 'fem_fortran',

  is_public BOOLEAN DEFAULT false,
  is_archived BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT simulations_material_id_fkey
    FOREIGN KEY (material_id)
    REFERENCES public.materials(id)
    ON DELETE RESTRICT
);



INSERT INTO public.simulations
(id, user_id, material_id, name)
VALUES
(
  'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa',
  '00000000-0000-0000-0000-000000000001',
  '11111111-aaaa-1111-aaaa-111111111111',
  'Simulation Aluminum'
);
