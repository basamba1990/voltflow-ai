-- Seed materials
INSERT INTO public.materials (name, category, thermal_conductivity, specific_heat, density, melting_point, color_hex, is_public) VALUES
  ('Aluminum 6061', 'metal', 167.0, 896.0, 2700.0, 582.0, '#CCCCCC', true),
  ('Copper', 'metal', 401.0, 385.0, 8960.0, 1084.0, '#B87333', true),
  ('Stainless Steel 304', 'metal', 16.2, 500.0, 8000.0, 1400.0, '#E0E0E0', true),
  ('Titanium Grade 2', 'metal', 22.0, 522.0, 4510.0, 1668.0, '#878681', true),
  ('Silicon Carbide', 'ceramic', 120.0, 750.0, 3210.0, 2730.0, '#2F4F4F', true),
  ('Polycarbonate', 'polymer', 0.2, 1200.0, 1200.0, 155.0, '#87CEEB', true),
  ('Carbon Fiber Composite', 'composite', 5.0, 710.0, 1600.0, 3550.0, '#1C1C1C', true);

-- Seed a test user (if needed for development)
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'test@voltflow.ai')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, full_name, role, subscription_plan, simulations_limit) VALUES
  ('11111111-1111-1111-1111-111111111111', 'test@voltflow.ai', 'Test Engineer', 'engineer', 'professional', 100)
ON CONFLICT (id) DO NOTHING;
