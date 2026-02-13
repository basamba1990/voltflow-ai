import { createClient } from "npm:@supabase/supabase-js@2.38.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  let simId: string | null = null;
  let userId: string | null = null;

  try {
    // ✅ CORRECTION CRITIQUE: Lecture sécurisée du JSON pour éviter "Unexpected end of JSON input"
    const bodyText = await req.text();
    if (!bodyText) throw new Error("Empty request body");
    
    let body;
    try {
      body = JSON.parse(bodyText);
    } catch (e) {
      throw new Error("Invalid JSON input");
    }
    
    // Détection du type d'appel (Webhook Supabase ou Appel Direct)
    if (body.type === 'INSERT' && body.table === 'simulations') {
      simId = body.record.id;
      userId = body.record.user_id;
    } else {
      simId = body.simulation_id;
      userId = body.user_id;
    }

    if (!simId || !userId) throw new Error("Missing simulation_id or user_id");

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 1. Récupérer les données complètes
    const { data: sim, error: simError } = await supabase
      .from('simulations')
      .select('*, materials(*)')
      .eq('id', simId)
      .single();

    if (simError || !sim) throw new Error("Simulation not found");
    
    // Éviter les boucles infinies si déjà en cours (pour les webhooks)
    if (sim.status === 'completed' || sim.status === 'running') {
        if (body.type === 'INSERT') return new Response(JSON.stringify({ success: true, message: "Already processed" }), { headers: corsHeaders });
    }

    // 2. Mettre à jour le statut
    await supabase.from('simulations').update({ status: 'running', progress: 10 }).eq('id', simId);

    // 3. Appeler le backend externe (Render)
    const BACKEND_URL = Deno.env.get('BACKEND_URL') || "https://voltflow-ai.onrender.com";
    
    // ✅ CORRECTION CRITIQUE: Mapping des propriétés thermiques (thermal_conductivity vs conductivity)
    const fortranConfig = {
      conductivity: sim.materials?.thermal_conductivity || 50.0,
      density: sim.materials?.density || 2700.0,
      specific_heat: sim.materials?.specific_heat || 900.0,
      initial_temp: sim.boundary_conditions?.initial_temp || 1000.0,
      boundary_temp: sim.boundary_conditions?.ambient_temp || 25.0,
      heat_flux: sim.boundary_conditions?.heat_flux || 1000.0,
      nx: 100, ny: 1, nz: 1,
      geometry_type: sim.geometry_type === 'simple' ? '1d_rod' : '3d_complex'
    };

    console.log(`Calling backend: ${BACKEND_URL}/api/v1/simulate/fortran`);

    const response = await fetch(`${BACKEND_URL}/api/v1/simulate/fortran`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        simulation_id: simId,
        user_id: userId,
        fortran_config: fortranConfig
      })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Backend error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();

    // 4. Télécharger le fichier VTK depuis le backend et l'uploader sur Supabase Storage
    if (result.vtk_file_url) {
        // Construction de l'URL complète si relative
        const vtkUrl = result.vtk_file_url.startsWith('http') 
            ? result.vtk_file_url 
            : `${BACKEND_URL}${result.vtk_file_url}`;
            
        const vtkRes = await fetch(vtkUrl);
        if (!vtkRes.ok) throw new Error("Failed to download VTK result from backend");
        
        const vtkBlob = await vtkRes.blob();
        const filePath = `${userId}/${simId}_result.vtk`;
        
        const { error: uploadError } = await supabase.storage.from('simulation-files').upload(filePath, vtkBlob, {
            contentType: 'application/octet-stream',
            upsert: true
        });

        if (uploadError) throw new Error(`Storage upload error: ${uploadError.message}`);

        const { data: urlData } = supabase.storage.from('simulation-files').getPublicUrl(filePath);

        // 5. Sauvegarder les résultats
        const { error: insertError } = await supabase.from('simulation_results').insert({
            simulation_id: simId,
            user_id: userId,
            max_temperature: result.temperature_stats?.max || 0,
            min_temperature: result.temperature_stats?.min || 0,
            average_temperature: result.temperature_stats?.avg || 0,
            result_files: { vtk_url: urlData.publicUrl, source: 'fortran_solver' }
        });
        
        if (insertError) throw new Error(`Result insertion error: ${insertError.message}`);
    }

    // 6. Finaliser
    await supabase.from('simulations').update({
      status: 'completed',
      progress: 100,
      completed_at: new Date().toISOString()
    }).eq('id', simId);

    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });

  } catch (error: any) {
    console.error("Function Error:", error.message);
    if (simId) {
        const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
        await supabase.from('simulations').update({ 
            status: 'failed', 
            error_message: error.message 
        }).eq('id', simId);
    }
    return new Response(JSON.stringify({ success: false, error: error.message }), { 
        status: 500, 
        headers: corsHeaders 
    });
  }
});
