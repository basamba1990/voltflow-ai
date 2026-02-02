import { createClient } from "npm:@supabase/supabase-js@2.38.0"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Max-Age": "86400",
}

Deno.serve(async (req: Request) => {
  console.log(`[SIMULATE] ${req.method} ${req.url}`)

  // ===== CORS PREFLIGHT =====
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "POST only" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }

  const authHeader = req.headers.get("Authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ success: false, error: "Missing Authorization header" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: "Invalid JSON body" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }

  const { simulationId } = body
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!simulationId || !uuidRegex.test(simulationId)) {
    return new Response(
      JSON.stringify({ success: false, error: "Invalid simulationId (UUID required)" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return new Response(
      JSON.stringify({ success: false, error: "Missing env vars" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const token = authHeader.replace("Bearer ", "")

  const { data: authData, error: authError } = await supabase.auth.getUser(token)
  if (authError || !authData?.user) {
    return new Response(
      JSON.stringify({ success: false, error: "Authentication failed" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }

  const userId = authData.user.id

  const { data: simulation, error: simError } = await supabase
    .from("simulations")
    .select("id, user_id, status, geometry_config")
    .eq("id", simulationId)
    .single()

  if (simError || !simulation) {
    return new Response(
      JSON.stringify({ success: false, error: "Simulation not found" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }

  if (simulation.user_id !== userId) {
    return new Response(
      JSON.stringify({ success: false, error: "Forbidden" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }

  if (simulation.status === "running") {
    return new Response(
      JSON.stringify({ success: false, error: "Simulation already running" }),
      { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }

  await supabase.from("simulations").update({
    status: "running",
    progress: 10,
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }).eq("id", simulationId)

  // ==== SIMULATION FAKE ====
  await new Promise(r => setTimeout(r, 3000))

  const results = {
    max_temperature: 210.5,
    min_temperature: 25,
    average_temperature: 96.3,
    vtk_url: simulation.geometry_config?.file_url ?? null,
    mesh_points: 27000,
    elements: 25000
  }

  await supabase.from("simulation_results").upsert({
    simulation_id: simulationId,
    user_id: userId,
    temperature_data: results,
    max_temperature: results.max_temperature,
    min_temperature: results.min_temperature,
    average_temperature: results.average_temperature,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }, { onConflict: "simulation_id" })

  await supabase.from("simulations").update({
    status: "completed",
    progress: 100,
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }).eq("id", simulationId)

  return new Response(
    JSON.stringify({
      success: true,
      simulation_id: simulationId,
      status: "completed",
      results
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  )
})
