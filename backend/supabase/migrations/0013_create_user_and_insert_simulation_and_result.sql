WITH new_user AS (
  INSERT INTO public.users (id, email, created_at)
  VALUES (gen_random_uuid(), 'test.user+repair@example.com', now())
  RETURNING id
),
ins_mat AS (
  INSERT INTO public.materials (id, name, thermal_conductivity, specific_heat, density, melting_point, color_hex, is_public)
  VALUES ('aluminum-6061', 'Aluminum 6061', 167, 896, 2700, 582, '#CCCCCC', true)
  ON CONFLICT (id) DO NOTHING
  RETURNING id
),
ins_sim AS (
  INSERT INTO public.simulations (
    id, user_id, name, description, geometry_type, geometry_config, boundary_conditions, material_id, mesh_density, solver_type, status, progress, error_message, created_at, updated_at
  )
  SELECT
    gen_random_uuid(), nu.id, 'Simulation de Test - Réparation', 'Ceci est une simulation de test créée par le script de réparation', 'simple',
    jsonb_build_object('file_name','test_cube.stl','file_size_mb',0,'storage_bucket','geometries'),
    jsonb_build_object('temperature_source',1000,'ambient_temperature',25,'convection','natural'),
    'aluminum-6061','medium','fem_fortran','failed',10,'Simulation failed. Check logs for details.', now(), now()
  FROM new_user nu
  RETURNING id, user_id
)
INSERT INTO public.simulation_results (
  simulation_id, user_id, temperature_data, max_temperature, min_temperature, computation_time, uncertainty_score, convergence_metrics, result_files, created_at, updated_at
)
SELECT
  s.id, s.user_id,
  jsonb_build_object('nodes',8,'elements',12,'note','Données factices pour test UI'),
  312.5, 26.0, 1.37, 0.12,
  jsonb_build_object('iterations',12,'residual',0.0003),
  jsonb_build_array(jsonb_build_object('file_name','result.vtk','url','/storage/results/result.vtk')),
  now(), now()
FROM ins_sim s
RETURNING simulation_id;
