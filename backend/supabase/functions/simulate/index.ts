import { createClient } from "npm:@supabase/supabase-js@2.38.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

console.info('Simulation function starting');

Deno.serve(async (req: Request) => {
  console.log('Simulation function called:', req.method);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let simulationId: string | undefined = undefined;

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const authToken = authHeader.replace(/^Bearer\s+/i, '') || null;

    const body = await req.json().catch(() => ({}));
    const { simulationId: simId, userId, config } = body;
    simulationId = simId;

    console.log('Request data:', { simulationId: simId, userId, configKeys: config ? Object.keys(config) : undefined });

    if (!simId || !userId || !config || !authToken) {
      return new Response(JSON.stringify({ error: 'Missing required fields: simulationId, userId, config, or Authorization header' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!SUPABASE_URL) {
      throw new Error('SUPABASE_URL is not set in environment');
    }

    if (!SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set in environment');
    }

    const supabaseUserClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authToken ? `Bearer ${authToken}` : '' } },
    });

    const supabaseServiceRoleClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: user, error: userError } = await supabaseUserClient
      .from('users')
      .select('simulations_used, simulations_limit, subscription_status')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      throw new Error('User not found or unauthorized');
    }

    if (user.subscription_status !== 'active') {
      throw new Error('Subscription not active');
    }

    if (user.simulations_used >= user.simulations_limit) {
      throw new Error('Monthly simulation limit reached');
    }

    const { error: updateError } = await supabaseServiceRoleClient
      .from('simulations')
      .update({ status: 'running', progress: 0, started_at: new Date().toISOString() })
      .eq('id', simId);

    if (updateError) throw updateError;

    // Long running simulation - run sequentially but keep response open.
    console.log('Starting simulation processing...');

    const totalSteps = 10;
    for (let step = 1; step <= totalSteps; step++) {
      await sleep(1000);
      const progress = Math.round((step / totalSteps) * 100);

      // best-effort update, don't fail the whole run on transient error
      supabaseServiceRoleClient.from('simulations').update({ progress }).eq('id', simId).then(({ error }) => {
        if (error) console.warn('Progress update failed:', error);
      });

      console.log(`Simulation ${simId} progress: ${progress}%`);
    }

    const results = {
      max_temperature: 85.5 + Math.random() * 10,
      min_temperature: 25.0 + Math.random() * 5,
      pressure_drop: 2.3 + Math.random() * 1.5,
      thermal_efficiency: 0.75 + Math.random() * 0.15,
      temperature_data: Array.from({ length: 100 }, (_, i) => ({ x: i, y: 25 + Math.random() * 60, z: Math.random() * 10 })),
      convergence_metrics: { iterations: 10000, loss: 0.0012, convergence_rate: 0.95 },
    };

    const { error: completeError } = await supabaseServiceRoleClient
      .from('simulations')
      .update({ status: 'completed', progress: 100, completed_at: new Date().toISOString() })
      .eq('id', simId);

    if (completeError) throw completeError;

    const { error: resultsError } = await supabaseServiceRoleClient.from('simulation_results').insert({ simulation_id: simId, ...results });
    if (resultsError) throw resultsError;

    // Fire-and-forget increment using waitUntil if available
    try {
      const p = supabaseServiceRoleClient.rpc('increment_simulations_used', { user_uuid: userId });
      // @ts-ignore - EdgeRuntime available at runtime; call waitUntil if present
      if (typeof (globalThis as any).EdgeRuntime !== 'undefined' && typeof (globalThis as any).EdgeRuntime.waitUntil === 'function') {
        (globalThis as any).EdgeRuntime.waitUntil(p);
      }
    } catch (e) {
      console.warn('Failed to enqueue increment:', e);
    }

    return new Response(JSON.stringify({ success: true, simulationId: simId, status: 'completed', results, message: 'Simulation completed successfully' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in simulation function:', error);

    try {
      if (simulationId) {
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
        const supabaseServiceRoleClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        await supabaseServiceRoleClient.from('simulations').update({ status: 'failed', progress: 0 }).eq('id', simulationId);
      }
    } catch (updateError) {
      console.error('Failed to update simulation status:', updateError);
    }

    return new Response(JSON.stringify({ success: false, error: (error as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
