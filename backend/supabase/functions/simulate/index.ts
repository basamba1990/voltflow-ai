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
    
    // Mapping correct des propriétés du matériau depuis la table materials
    const fortranConfig = {
      conductivity: sim.materials?.thermal_conductivity ?? bc.conductivity ?? 50.0,
      density: sim.materials?.density ?? bc.density ?? 2700.0,
      specific_heat: sim.materials?.specific_heat ?? bc.specific_heat ?? 900.0,
      initial_temp: bc.initial_temp ?? 1000.0,
      boundary_temp: bc.ambient_temp ?? 25.0,
      heat_flux: bc.heat_flux ?? 1000.0,
      nx: sim.nx || 50,
      ny: sim.ny || 50,
      nz: sim.nz || 50,
      geometry_type: sim.geometry_type,
      mesh_file: gc.file_url || null,
      solver_type: sim.solver_type || "fem_fortran"
    };

    const BACKEND_URL = Deno.env.get("BACKEND_URL") || "https://voltflow-ai.onrender.com";
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 300s (5 min) pour les simulations lourdes

    console.log(`📡 Sending request to backend: ${BACKEND_URL}/api/v1/simulate/fortran`);
    
    const response = await fetch(`${BACKEND_URL}/api/v1/simulate/fortran`, {
      signal: controller.signal,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        simulation_id: simId,
        user_id: userId,
        fortran_config: fortranConfig,
      }),
    });

    console.log(`📡 Backend response status: ${response.status}`);
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Backend error body: ${errorText}`);
      throw new Error(`Backend error: ${response.status} - ${errorText}`);
    }
    clearTimeout(timeoutId);

    const result = await response.json();
    
    let publicUrl = null;
    if (result.vtk_file_url) {
      console.log(`📥 Downloading VTK from: ${result.vtk_file_url}`);
      const vtkRes = await fetch(result.vtk_file_url);
      if (vtkRes.ok) {
        const vtkBlob = await vtkRes.blob();
        const storagePath = `${userId}/${simId}_result.vtk`;
        const { error: uploadError } = await supabase.storage.from("simulation-files").upload(storagePath, vtkBlob, { upsert: true });
        
        if (uploadError) {
            console.error(`❌ Storage upload error: ${uploadError.message}`);
        } else {
            const { data: urlData } = supabase.storage.from("simulation-files").getPublicUrl(storagePath);
            publicUrl = urlData.publicUrl;
            console.log(`✅ VTK uploaded to Supabase: ${publicUrl}`);
        }
      } else {
          console.error(`❌ Failed to download VTK from backend: ${vtkRes.status}`);
      }
    }

    // Insertion des résultats
    const { error: insertError } = await supabase.from("simulation_results").insert({
      simulation_id: simId,
      user_id: userId,
      max_temperature: result.temperature_stats?.max ?? 0,
      min_temperature: result.temperature_stats?.min ?? 0,
      average_temperature: result.temperature_stats?.avg ?? 0,
      temperature_data: result.temperature_field || {},
      methodology: sim.solver_type,
      result_files: { vtk_url: publicUrl, execution_time: result.execution_time },
      convergence_metrics: { iterations: result.iterations, final_residual: result.final_residual }
    });

    if (insertError) {
        console.error(`❌ Error inserting results: ${insertError.message}`);
    }

    // Mise à jour finale du statut
    await supabase.from("simulations").update({
      status: "completed",
      progress: 100,
      completed_at: new Date().toISOString()
    }).eq("id", simId);

    return new Response(JSON.stringify({ success: true, simulation_id: simId, vtk_url: publicUrl }), { headers: corsHeaders });

  } catch (error: any) {
    console.error(`❌ Function error: ${error.message}`);
    // En cas d'erreur, mettre à jour le statut de la simulation
    try {
        const body = await req.clone().json();
        const simId = body.simulation_id || body.record?.id;
        if (simId) {
            const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
            await supabase.from("simulations").update({ 
                status: "failed", 
                error_message: error.message 
            }).eq("id", simId);
        }
    } catch (e) {}

    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: corsHeaders });
  }
});
