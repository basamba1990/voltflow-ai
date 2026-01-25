import { createClient } from "npm:@supabase/supabase-js@2.38.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Credentials': 'true',
  'Vary': 'Origin'
}

Deno.serve(async (req: Request) => {
  // 1. GESTION CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    // 2. VALIDATION AUTHENTIFICATION
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const authToken = authHeader.replace(/^Bearer\s+/i, '')
    const body = await req.json()
    const { fileName, fileData, userId, simulationId, geometry_config } = body

    if (!fileName || !fileData || !userId) {
      return new Response(JSON.stringify({ success: false, error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 3. VALIDATION EXTENSIONS (COMPLÈTE : STL, STEP, OBJ, VTP, VTI, PLY, VTK)
    const allowedTypes = ['stl', 'step', 'stp', 'obj', 'iges', 'igs', 'vtp', 'vti', 'ply', 'vtk']
    const fileExtension = fileName.toLowerCase().split('.').pop()
    
    if (!fileExtension || !allowedTypes.includes(fileExtension)) {
      return new Response(JSON.stringify({ success: false, error: `Format non supporté : ${fileExtension}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 4. INITIALISATION CLIENT SUPABASE (SERVICE ROLE)
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Variables d\'environnement manquantes')

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // 5. DÉCODAGE DES DONNÉES BINAIRES (BASE64)
    const binaryString = atob(fileData)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }

    // 6. GÉNÉRATION DU CHEMIN UNIQUE (STRUCTURE : userId/timestamp_id_filename)
    const timestamp = Date.now()
    const uniqueId = Math.random().toString(36).substring(2, 9)
    const uniquePath = `${userId}/${timestamp}_${uniqueId}_${fileName}`

    // 7. UPLOAD VERS STORAGE (BUCKET PRIVÉ)
    const { error: uploadError } = await supabase.storage
      .from('geometries')
      .upload(uniquePath, bytes, {
        contentType: 'application/octet-stream',
        upsert: false
      })

    if (uploadError) throw new Error(`Erreur Storage : ${uploadError.message}`)

    // 8. GÉNÉRATION D'UNE URL SIGNÉE (CAR BUCKET PRIVÉ)
    // On génère une URL valide pour 1 an (31536000 secondes) pour la simulation
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('geometries')
      .createSignedUrl(uniquePath, 31536000)

    if (signedUrlError) throw new Error(`Erreur URL signée : ${signedUrlError.message}`)
    const fileUrl = signedUrlData.signedUrl

    // 9. MISE À JOUR DE LA SIMULATION
    if (simulationId) {
      const { error: updateError } = await supabase.from('simulations').update({
        geometry_config: {
          ...geometry_config,
          file_url: fileUrl,
          file_path: uniquePath, // On stocke aussi le chemin brut pour référence
          file_name: fileName,
          file_size: bytes.length,
          uploaded_at: new Date().toISOString()
        }
      }).eq('id', simulationId).eq('user_id', userId)

      if (updateError) console.warn(`[Upload] Erreur update simulation: ${updateError.message}`)
    }

    // 10. RÉPONSE SUCCÈS
    return new Response(JSON.stringify({
      success: true,
      fileUrl: fileUrl,
      path: uniquePath,
      message: 'Fichier uploadé avec succès dans le bucket privé'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error: any) {
    console.error(`[UploadGeometry] Erreur critique : ${error.message}`)
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
