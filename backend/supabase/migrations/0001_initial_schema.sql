-- ============================================
-- INITIAL SETUP FOR VOLTFLOW AI
-- ============================================

-- 1. ENABLE EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- 2. CREATE STORAGE BUCKET FOR GEOMETRIES
INSERT INTO storage.buckets (id, name, public, avif_autodetection, file_size_limit, allowed_mime_types)
VALUES (
  'geometries',
  'geometries',
  false,
  false,
  52428800, -- 50MB
  ARRAY[
    'model/stl',
    'application/sla',
    'application/step',
    'application/vnd.step',
    'model/obj',
    'application/x-tgif',
    'model/iges',
    'application/iges',
    'application/octet-stream'
  ]
) ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 3. ENABLE ROW LEVEL SECURITY ON ALL TABLES
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulation_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulation_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

-- 4. POLICIES FOR USERS TABLE
CREATE POLICY "Users can view own profile"
  ON users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Service role can manage all users"
  ON users FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- 5. POLICIES FOR SIMULATIONS TABLE
CREATE POLICY "Users can view own simulations"
  ON simulations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create simulations"
  ON simulations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own simulations"
  ON simulations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own simulations"
  ON simulations FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all simulations"
  ON simulations FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- 6. POLICIES FOR SIMULATION_RESULTS TABLE
CREATE POLICY "Users can view own simulation results"
  ON simulation_results FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM simulations
      WHERE simulations.id = simulation_results.simulation_id
      AND simulations.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can insert simulation results"
  ON simulation_results FOR INSERT
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- 7. POLICIES FOR MATERIALS TABLE
CREATE POLICY "Everyone can view public materials"
  ON materials FOR SELECT
  USING (is_public = true OR created_by = auth.uid());

CREATE POLICY "Users can manage own materials"
  ON materials FOR ALL
  USING (created_by = auth.uid());

CREATE POLICY "Service role can manage all materials"
  ON materials FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- 8. POLICIES FOR STORAGE.GEOMETRIES BUCKET
CREATE POLICY "Users can view own geometry files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'geometries'
    AND (auth.uid()::text = (storage.foldername(name))[1])
  );

CREATE POLICY "Users can upload geometry files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'geometries'
    AND auth.role() = 'authenticated'
    AND auth.uid()::text = (storage.foldername(name))[1]
    AND (
      LOWER(RIGHT(name, 4)) IN ('.stl', '.obj', '.igs', '.iges')
      OR LOWER(RIGHT(name, 5)) IN ('.step', '.stp')
    )
  );

CREATE POLICY "Users can update own geometry files"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'geometries'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete own geometry files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'geometries'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Service role full access to geometries"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'geometries'
    AND auth.jwt() ->> 'role' = 'service_role'
  );

-- 9. CREATE FUNCTION TO INCREMENT SIMULATIONS USED
CREATE OR REPLACE FUNCTION increment_simulations_used(user_uuid UUID)
RETURNS void AS $$
BEGIN
  UPDATE users
  SET 
    simulations_used = simulations_used + 1,
    updated_at = NOW()
  WHERE id = user_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. CREATE FUNCTION TO RESET MONTHLY LIMITS (SCHEDULE WITH PG_CRON)
CREATE OR REPLACE FUNCTION reset_monthly_limits()
RETURNS void AS $$
BEGIN
  UPDATE users
  SET 
    simulations_used = 0,
    updated_at = NOW()
  WHERE subscription_plan IN ('starter', 'professional');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11. CREATE INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_simulations_user_id ON simulations(user_id);
CREATE INDEX IF NOT EXISTS idx_simulations_status ON simulations(status);
CREATE INDEX IF NOT EXISTS idx_simulations_created_at ON simulations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_simulation_results_simulation_id ON simulation_results(simulation_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_materials_category ON materials(category);
CREATE INDEX IF NOT EXISTS idx_storage_objects_user_folder ON storage.objects((storage.foldername(name))[1]) WHERE bucket_id = 'geometries';

-- 12. SET DEFAULT VALUES FOR NEW USERS
ALTER TABLE users 
ALTER COLUMN role SET DEFAULT 'user',
ALTER COLUMN subscription_plan SET DEFAULT 'starter',
ALTER COLUMN subscription_status SET DEFAULT 'active',
ALTER COLUMN simulations_used SET DEFAULT 0,
ALTER COLUMN simulations_limit SET DEFAULT 10,
ALTER COLUMN created_at SET DEFAULT NOW(),
ALTER COLUMN updated_at SET DEFAULT NOW();

-- 13. CREATE TRIGGER FOR UPDATED_AT
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_simulations_updated_at BEFORE UPDATE ON simulations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 14. INSERT DEFAULT MATERIALS
INSERT INTO materials (id, name, category, thermal_conductivity, specific_heat, density, melting_point, color_hex, is_public)
VALUES
  ('aluminum-6061', 'Aluminum 6061', 'metal', 167, 897, 2700, 582, '#A0A0A0', true),
  ('copper', 'Copper', 'metal', 401, 385, 8960, 1085, '#B87333', true),
  ('stainless-304', 'Stainless Steel 304', 'metal', 16.2, 500, 8000, 1400, '#E0E0E0', true),
  ('water', 'Water', 'liquid', 0.6, 4182, 997, 0, '#6495ED', true),
  ('air', 'Air', 'gas', 0.026, 1005, 1.2, NULL, '#87CEEB', true)
ON CONFLICT (id) DO NOTHING;

-- 15. CREATE VIEW FOR USER STATS
CREATE OR REPLACE VIEW user_simulation_stats AS
SELECT 
  u.id as user_id,
  u.email,
  u.subscription_plan,
  u.simulations_used,
  u.simulations_limit,
  COUNT(s.id) as total_simulations,
  COUNT(CASE WHEN s.status = 'completed' THEN 1 END) as completed_simulations,
  COUNT(CASE WHEN s.status = 'failed' THEN 1 END) as failed_simulations,
  AVG(CASE WHEN s.status = 'completed' THEN EXTRACT(EPOCH FROM (s.completed_at - s.started_at)) END) as avg_duration_seconds
FROM users u
LEFT JOIN simulations s ON u.id = s.user_id
GROUP BY u.id, u.email, u.subscription_plan, u.simulations_used, u.simulations_limit;

-- 16. GRANT PERMISSIONS TO AUTHENTICATED USERS
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;

-- 17. SET UP REALTIME FOR SIMULATIONS TABLE
alter publication supabase_realtime add table simulations;
