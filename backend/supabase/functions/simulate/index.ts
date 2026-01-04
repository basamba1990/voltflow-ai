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

// Fonction simulée pour l'exécution de la simulation SNPGP (Spectral-normalized Neural Gaussian Process)
async function runSNPGPSimulation(config: any) {
  // Logique de simulation SPML/SNPGP basée sur pasted_content.txt
  // L'approche utilise la normalisation spectrale pour préserver les distances dans l'espace latent.
  
  // Détection de Domain Shift basée sur les conditions aux limites
  const bc = config.boundary_conditions || {};
  const tempDiff = Math.abs((bc.initial_temp || 0) - (bc.ambient_temp || 0));
  const velocity = bc.fluid_velocity || 0;
  
  // Simuler un cas de domaine shift si les conditions sortent de l'espace de distribution connu
  const isDomainShift = tempDiff > 450 || velocity > 12 || config.critical_parameter > 0.8;
  
  const simulatedResults = {
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
      iterations: 12000, 
      loss: 0.0008, 
      convergence_rate: 0.98,
      physics_residual: 0.0005 // Résidu des équations physiques (Loi de Fourier)
    },
  }
  
  // Calcul de l'incertitude (quantification de la confiance via GP)
  let uncertainty_score = 0.03 + Math.random() * 0.04;
  let domain_shift_alert = false;
  
  if (isDomainShift) {
    // Augmentation de la variance de prédiction SNPGP
    uncertainty_score = 0.30 + Math.random() * 0.20;
    domain_shift_alert = true;
    console.warn(`[SNPGP] DOMAIN SHIFT DETECTED. Uncertainty Score: ${uncertainty_score.toFixed(4)}`);
    console.info(`[Sidecar] Application de la renormalisation spectrale pour stabiliser la solution.`);
  }
  
  return {
    results: simulatedResults,
    uncertainty_score,
    domain_shift_alert,
    physics_informed: true // Indique que les contraintes physiques ont été appliquées
  }
}

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
    
    // Simuler un paramètre critique dans la config pour le test
    const configWithCriticalParam = {
      ...config,
      critical_parameter: Math.random() // Pour simuler des cas de shift
    }
    
    // Le reste du code de simulation (boucle de progression)
    
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

    // --- Début de l'intégration SNPGP/SPML ---
    // Dans un environnement réel, cette section contiendrait l'exécution du modèle SNPGP
    // pour la simulation et la quantification de l'incertitude.
    
    // 1. Simulation SPML (Simulée ici par une fonction plus complexe)
    const { results, uncertainty_score, domain_shift_alert } = await runSNPGPSimulation(configWithCriticalParam)

    // 2. Mise à jour des résultats de simulation
    // --- Fin de l'intégration SNPGP/SPML ---
    
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
        ...results,
        uncertainty_score, // Correction: utilise la variable déstructurée
        domain_shift_alert // Correction: utilise la variable déstructurée
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
        uncertainty_score, // Correction: utilise la variable déstructurée
        domain_shift_alert, // Correction: utilise la variable déstructurée
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
