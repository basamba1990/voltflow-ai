import { createClient } from "npm:@supabase/supabase-js@2.38.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization')!;
    const body = await req.json();
    const { simulationId, userId, config } = body;

    if (!simulationId || !userId) throw new Error('Missing simulationId or userId');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 1. Vérification de l'utilisateur et quota
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('simulations_used, simulations_limit, subscription_status')
      .eq('id', userId)
      .single();

    if (userError || !user) throw new Error('User not found');
    if (user.subscription_status !== 'active') throw new Error('Subscription inactive');
    if (user.simulations_used >= user.simulations_limit) throw new Error('Quota exceeded');

    // 2. Mise à jour statut : Running
    await supabase.from('simulations').update({ status: 'running', progress: 10 }).eq('id', simulationId);

    // 3. Simulation (Mock PINN Solver)
    console.log(`Processing simulation ${simulationId}...`);
    for (let i = 20; i <= 90; i += 20) {
      await new Promise(r => setTimeout(r, 1000));
      await supabase.from('simulations').update({ progress: i }).eq('id', simulationId);
    }

    // 4. Finalisation et résultats
    const results = {
      max_temp: 85.5,
      efficiency: 0.82,
      timestamp: new Date().toISOString()
    };

    await supabase.from('simulations').update({ 
      status: 'completed', 
      progress: 100 
    }).eq('id', simulationId);

    await supabase.rpc('increment_simulations_used', { user_uuid: userId });

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
