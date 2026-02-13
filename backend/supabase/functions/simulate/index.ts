import { createClient } from "npm:@supabase/supabase-js@2.38.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  try {
    // -------------------------------------------------------------------------
    // OPTIONS -> CORS preflight
    // -------------------------------------------------------------------------
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    // -------------------------------------------------------------------------
    // GET -> simple info
    // -------------------------------------------------------------------------
    if (req.method === "GET") {
      return new Response(
        JSON.stringify({
          success: true,
          message: "Use POST with JSON { simulation_id, user_id } to run a simulation",
        }),
        { headers: corsHeaders }
      );
    }

    // -------------------------------------------------------------------------
    // POST -> process simulation
    // -------------------------------------------------------------------------
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ success: false, error: "Only POST supported" }),
        { status: 405, headers: corsHeaders }
      );
    }

    // -------------------------------------------------------------------------
    // Parse body safely
    // -------------------------------------------------------------------------
    const bodyText = await req.text();
    if (!bodyText) throw new Error("Empty request body");

    let body;
    try {
      body = JSON.parse(bodyText);
    } catch {
      throw new Error("Invalid JSON input");
    }

    const simId = body.simulation_id || body.record?.id;
    const userId = body.user_id || body.record?.user_id;

    if (!simId || !userId) {
      throw new Error("Missing simulation_id or user_id");
    }

    console.log(`🚀 Starting simulation ${simId}`);

    // -------------------------------------------------------------------------
    // Supabase client (service role)
    // -------------------------------------------------------------------------
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // -------------------------------------------------------------------------
    // Fetch simulation + material
    // -------------------------------------------------------------------------
    const { data: sim, error: simError } = await supabase
      .from("simulations")
      .select("*, materials(*)")
      .eq("id", simId)
      .single();

    if (simError || !sim) throw new Error("Simulation not found");

    if (sim.status === "running" || sim.status === "completed") {
      console.log("⚠️ Already processed");
      return new Response(
        JSON.stringify({ success: true, message: "Already processed" }),
        { headers: corsHeaders }
      );
    }

    // -------------------------------------------------------------------------
    // Update simulation status -> running
    // -------------------------------------------------------------------------
    await supabase.from("simulations").update({
      status: "running",
      progress: 20,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", simId);

    // -------------------------------------------------------------------------
    // Prepare backend config
    // -------------------------------------------------------------------------
    const fortranConfig = {
      conductivity: sim.materials?.thermal_conductivity ?? 50.0,
      density: sim.materials?.density ?? 2700.0,
      specific_heat: sim.materials?.specific_heat ?? 900.0,
      initial_temp: sim.boundary_conditions?.initial_temp ?? 1000.0,
      boundary_temp: sim.boundary_conditions?.ambient_temp ?? 25.0,
      heat_flux: sim.boundary_conditions?.heat_flux ?? 1000.0,
      nx: 100,
      ny: 1,
      nz: 1,
      geometry_type: sim.geometry_type === "simple" ? "1d_rod" : "3d_complex",
    };

    const BACKEND_URL = Deno.env.get("BACKEND_URL") || "https://voltflow-ai.onrender.com";

    console.log(`📡 Calling backend: ${BACKEND_URL}/api/v1/simulate/fortran`);

    // -------------------------------------------------------------------------
    // Call backend (timeout safe, AbortController removed for large files)
    // -------------------------------------------------------------------------
    const response = await fetch(`${BACKEND_URL}/api/v1/simulate/fortran`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        simulation_id: simId,
        user_id: userId,
        fortran_config: fortranConfig,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Backend error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log("✅ Backend result received");

    // -------------------------------------------------------------------------
    // Upload VTK/STL/VTU to Supabase Storage
    // -------------------------------------------------------------------------
    let publicUrl: string | null = null;

    if (result.vtk_file_url) {
      const fileUrl = result.vtk_file_url.startsWith("http")
        ? result.vtk_file_url
        : `${BACKEND_URL}${result.vtk_file_url}`;

      const vtkRes = await fetch(fileUrl);
      if (!vtkRes.ok) throw new Error("Failed to download VTK file from backend");

      const vtkBlob = await vtkRes.blob();
      const fileExt = fileUrl.split(".").pop() || "vtk";
      const storagePath = `${userId}/${simId}_result.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("simulation-files")
        .upload(storagePath, vtkBlob, { contentType: "application/octet-stream", upsert: true });

      if (uploadError) throw new Error(`Storage upload error: ${uploadError.message}`);

      const { data: urlData } = supabase.storage.from("simulation-files").getPublicUrl(storagePath);
      publicUrl = urlData.publicUrl;
    }

    // -------------------------------------------------------------------------
    // Save results
    // -------------------------------------------------------------------------
    const { error: insertError } = await supabase
      .from("simulation_results")
      .insert({
        simulation_id: simId,
        user_id: userId,
        max_temperature: result.temperature_stats?.max ?? 0,
        min_temperature: result.temperature_stats?.min ?? 0,
        average_temperature: result.temperature_stats?.avg ?? 0,
        computation_time: result.computation_time ?? null,
        methodology: "fortran_fem",
        vtk_file_url: publicUrl,
        result_files: { source: "fortran_solver", external_backend: true },
        created_at: new Date().toISOString(),
      });

    if (insertError) throw new Error(`Result insertion error: ${insertError.message}`);

    // -------------------------------------------------------------------------
    // Mark simulation completed
    // -------------------------------------------------------------------------
    await supabase
      .from("simulations")
      .update({
        status: "completed",
        progress: 100,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", simId);

    console.log("🎉 Simulation completed");

    return new Response(
      JSON.stringify({
        success: true,
        status: "completed",
        simulation_id: simId,
        vtk_file_url: publicUrl,
      }),
      { headers: corsHeaders }
    );

  } catch (error: any) {
    console.error("💥 Function Error:", error.message);

    // Update simulation as failed
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (simId) {
      await supabase.from("simulations").update({
        status: "failed",
        error_message: error.message.substring(0, 500),
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", simId);
    }

    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: corsHeaders }
    );
  }
});
