// backend/supabase/functions/simulate/index.ts
import { createClient } from "npm:@supabase/supabase-js@2.38.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
  'Access-Control-Allow-Credentials': 'true',
  'Vary': 'Origin'
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms))

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      status: 204, 
      headers: corsHeaders 
    })
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Method not allowed. Use POST.' 
      }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  let simulationId: string | undefined = undefined

  try {
    // Validate authorization
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing or invalid Authorization header' 
        }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const authToken = authHeader.replace(/^Bearer\s+/i, '')
    
    // Parse and validate request body
    let body: any
    try {
      body = await req.json()
    } catch {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid JSON body' 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const { simulationId: simId, config } = body
    simulationId = simId

    console.log(`[Simulate] Starting simulation ${simId}`)

    // Validate required fields
    if (!simId || !config) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing required fields: simulationId, config' 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Initialize Supabase clients
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing Supabase environment variables')
    }

    const supabaseUserClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${authToken}` } },
    })

    const supabaseServiceRoleClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Get user from token
    const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser()
    if (userError || !user) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Unauthorized' 
        }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const userId = user.id

    // Check user subscription and limits
    const { data: userData, error: userDataError } = await supabaseServiceRoleClient
      .from('users')
      .select('simulations_used, simulations_limit, subscription_status')
      .eq('id', userId)
      .single()

    if (userDataError || !userData) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'User not found' 
        }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    if (userData.subscription_status !== 'active') {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Subscription not active' 
        }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    if (userData.simulations_used >= userData.simulations_limit) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Monthly simulation limit reached' 
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Verify simulation exists and belongs to user
    const { data: simulation, error: simError } = await supabaseServiceRoleClient
      .from('simulations')
      .select('id, user_id, status')
      .eq('id', simId)
      .eq('user_id', userId)
      .single()

    if (simError || !simulation) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Simulation not found or unauthorized' 
        }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    if (simulation.status !== 'pending') {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Simulation already ${simulation.status}` 
        }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Update simulation status to running
    const { error: updateError } = await supabaseServiceRoleClient
      .from('simulations')
      .update({ 
        status: 'running', 
        progress: 0, 
        started_at: new Date().toISOString() 
      })
      .eq('id', simId)

    if (updateError) throw updateError

    // Start simulation process (simulated for now)
    console.log(`[Simulate] Processing simulation ${simId}`)
    
    const totalSteps = 10
    for (let step = 1; step <= totalSteps; step++) {
      await sleep(2000) // 2 seconds per step
      const progress = Math.round((step / totalSteps) * 100)

      // Update progress (fire and forget)
      supabaseServiceRoleClient
        .from('simulations')
        .update({ progress })
        .eq('id', simId)
        .then(({ error }) => {
          if (error) console.warn(`[Simulate] Progress update failed: ${error.message}`)
        })

      console.log(`[Simulate] Progress ${simId}: ${progress}%`)
    }

    // Generate simulation results
    const results = {
      max_temperature: 85.5 + Math.random() * 10,
      min_temperature: 25.0 + Math.random() * 5,
      pressure_drop: 2.3 + Math.random() * 1.5,
      thermal_efficiency: 0.75 + Math.random() * 0.15,
      temperature_data: Array.from({ length: 100 }, (_, i) => ({
        x: i,
        y: 25 + Math.random() * 60,
        z: Math.random() * 10
      })),
      convergence_metrics: { 
        iterations: 10000, 
        loss: 0.0012, 
        convergence_rate: 0.95 
      },
    }

    // Mark simulation as completed
    const { error: completeError } = await supabaseServiceRoleClient
      .from('simulations')
      .update({ 
        status: 'completed', 
        progress: 100, 
        completed_at: new Date().toISOString() 
      })
      .eq('id', simId)

    if (completeError) throw completeError

    // Save results
    const { error: resultsError } = await supabaseServiceRoleClient
      .from('simulation_results')
      .insert({ 
        simulation_id: simId, 
        ...results 
      })

    if (resultsError) throw resultsError

    // Increment simulations used counter
    try {
      await supabaseServiceRoleClient.rpc('increment_simulations_used', { 
        user_uuid: userId 
      })
    } catch (e) {
      console.warn(`[Simulate] Failed to increment counter: ${e}`)
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        simulationId: simId, 
        status: 'completed', 
        results,
        message: 'Simulation completed successfully' 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )

  } catch (error) {
    console.error(`[Simulate] Error: ${error.message}`)

    // Update simulation status to failed
    try {
      if (simulationId) {
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
        
        if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
          const supabaseServiceRoleClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
          await supabaseServiceRoleClient
            .from('simulations')
            .update({ 
              status: 'failed', 
              progress: 0 
            })
            .eq('id', simulationId)
        }
      }
    } catch (updateError) {
      console.error(`[Simulate] Failed to update status: ${updateError.message}`)
    }

    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
