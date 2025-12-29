import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  console.log('Simulation function called:', req.method)

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    })
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { simulationId, userId, config, authToken } = await req.json()
    
    console.log('Request data:', { simulationId, userId, config: Object.keys(config) })

    // Validate required fields
    if (!simulationId || !userId || !config || !authToken) {
      throw new Error('Missing required fields: simulationId, userId, config, or authToken')
    }

    // Verify user can run simulation
    const { data: user, error: userError } = await supabaseClient
      .from('users')
      .select('simulations_used, simulations_limit, subscription_status')
      .eq('id', userId)
      .single()

    if (userError || !user) {
      throw new Error('User not found or unauthorized')
    }

    if (user.subscription_status !== 'active') {
      throw new Error('Subscription not active')
    }

    if (user.simulations_used >= user.simulations_limit) {
      throw new Error('Monthly simulation limit reached')
    }

    // Update simulation status to running
    const { error: updateError } = await supabaseClient
      .from('simulations')
      .update({
        status: 'running',
        progress: 0,
        started_at: new Date().toISOString(),
      })
      .eq('id', simulationId)

    if (updateError) throw updateError

    // Simulate PINN/OpenFOAM processing
    console.log('Starting simulation processing...')
    
    // This would be replaced with actual PINN/OpenFOAM integration
    // For now, simulate with progress updates
    const totalSteps = 10
    for (let step = 1; step <= totalSteps; step++) {
      await new Promise(resolve => setTimeout(resolve, 1000)) // Simulate work
      
      const progress = Math.round((step / totalSteps) * 100)
      
      // Update progress
      await supabaseClient
        .from('simulations')
        .update({ progress })
        .eq('id', simulationId)
      
      console.log(`Simulation ${simulationId} progress: ${progress}%`)
    }

    // Generate results
    const results = {
      max_temperature: 85.5 + Math.random() * 10,
      min_temperature: 25.0 + Math.random() * 5,
      pressure_drop: 2.3 + Math.random() * 1.5,
      thermal_efficiency: 0.75 + Math.random() * 0.15,
      temperature_data: Array.from({ length: 100 }, (_, i) => ({
        x: i,
        y: 25 + Math.random() * 60,
        z: Math.random() * 10,
      })),
      convergence_metrics: {
        iterations: 10000,
        loss: 0.0012,
        convergence_rate: 0.95,
      },
    }

    // Update simulation as completed
    const { error: completeError } = await supabaseClient
      .from('simulations')
      .update({
        status: 'completed',
        progress: 100,
        completed_at: new Date().toISOString(),
      })
      .eq('id', simulationId)

    if (completeError) throw completeError

    // Store results
    const { error: resultsError } = await supabaseClient
      .from('simulation_results')
      .insert({
        simulation_id: simulationId,
        ...results,
      })

    if (resultsError) throw resultsError

    // Increment user's simulation count
    const { error: incrementError } = await supabaseClient
      .rpc('increment_simulations_used', { user_uuid: userId })

    if (incrementError) console.error('Failed to increment count:', incrementError)

    return new Response(
      JSON.stringify({
        success: true,
        simulationId,
        status: 'completed',
        results,
        message: 'Simulation completed successfully',
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )

  } catch (error) {
    console.error('Error in simulation function:', error)
    
    // Try to update simulation as failed
    try {
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      )
      
      await supabaseClient
        .from('simulations')
        .update({
          status: 'failed',
          progress: 0,
        })
        .eq('id', simulationId)
    } catch (updateError) {
      console.error('Failed to update simulation status:', updateError)
    }

    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message,
        details: error.stack 
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
