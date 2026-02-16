import { createClient } from "npm:@supabase/supabase-js@2.38.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const simId = body.simulation_id || body.record?.id;
    const userId = body.user_id || body.record?.user_id;

    if (!simId || !userId) throw new Error("Missing simulation_id or user_id");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: sim, error: simError } = await supabase
      .from("simulations")
      .select("*, materials(*)")
      .eq("id", simId)
      .single();

    if (simError || !sim) throw new Error("Simulation not found");

    await supabase.from("simulations").update({ status: "running", progress: 20 }).eq("id", simId);

    const bc = sim.boundary_conditions || {};
    const gc = sim.geometry_config || {};
    
    const fortranConfig = {
      conductivity: sim.materials?.thermal_conductivity ?? 50.0,
      density: sim.materials?.density ?? 2700.0,
      specific_heat: sim.materials?.specific_heat ?? 900.0,
      initial_temp: bc.initial_temp ?? 1000.0,
      boundary_temp: bc.ambient_temp ?? 25.0,
      heat_flux: bc.heat_flux ?? 1000.0,
      nx: sim.nx || 50,
      ny: sim.ny || 50,
      nz: sim.nz || 50,
      geometry_type: sim.geometry_type,
      mesh_file: gc.file_url || null, // URL du fichier STL pour la voxelisation
      solver_type: sim.solver_type || "fem_fortran"
    };

    const BACKEND_URL = Deno.env.get("BACKEND_URL") || "https://voltflow-ai.onrender.com";
    const response = await fetch(`${BACKEND_URL}/api/v1/simulate/fortran`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        simulation_id: simId,
        user_id: userId,
        fortran_config: fortranConfig,
      }),
    });

    if (!response.ok) throw new Error(`Backend error: ${response.status}`);

    const result = await response.json();
    
    let publicUrl = null;
    if (result.vtk_file_url) {
      const vtkRes = await fetch(`${BACKEND_URL}${result.vtk_file_url}`);
      if (vtkRes.ok) {
        const vtkBlob = await vtkRes.blob();
        const storagePath = `${userId}/${simId}_result.vtk`;
        await supabase.storage.from("simulation-files").upload(storagePath, vtkBlob, { upsert: true });
        const { data: urlData } = supabase.storage.from("simulation-files").getPublicUrl(storagePath);
        publicUrl = urlData.publicUrl;
      }
    }

    await supabase.from("simulation_results").insert({
      simulation_id: simId,
      user_id: userId,
      max_temperature: result.temperature_stats?.max ?? 0,
      min_temperature: result.temperature_stats?.min ?? 0,
      average_temperature: result.temperature_stats?.avg ?? 0,
      temperature_data: result.temperature_field,
      methodology: sim.solver_type,
      result_files: { vtk_url: publicUrl, execution_time: result.execution_time }
    });

    await supabase.from("simulations").update({
      status: "completed",
      progress: 100,
      completed_at: new Date().toISOString()
    }).eq("id", simId);

    return new Response(JSON.stringify({ success: true, simulation_id: simId }), { headers: corsHeaders });

  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: corsHeaders });
  }
});
