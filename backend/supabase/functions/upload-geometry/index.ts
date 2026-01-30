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

    const body = await req.json()
    const { fileName, fileData, userId, simulationId, geometry_config } = body

    if (!fileName || !fileData || !userId) {
      return new Response(JSON.stringify({ success: false, error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 3. VALIDATION EXTENSIONS
    const allowedTypes = ['stl', 'step', 'stp', 'obj', 'iges', 'igs', 'vtp', 'vti', 'ply', 'vtk']
    const fileExtension = fileName.toLowerCase().split('.').pop()
    
    if (!fileExtension || !allowedTypes.includes(fileExtension)) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: `Format non supporté: ${fileExtension}. Formats acceptés: ${allowedTypes.join(', ')}` 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 4. INITIALISATION CLIENT SUPABASE (SERVICE ROLE)
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Variables d\'environnement manquantes')
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // 5. DÉCODAGE DES DONNÉES BINAIRES (BASE64)
    const binaryString = atob(fileData)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }

    // 6. GÉNÉRATION DU CHEMIN UNIQUE
    const timestamp = Date.now()
    const uniqueId = Math.random().toString(36).substring(2, 9)
    const uniquePath = `${userId}/${timestamp}_${uniqueId}_${fileName}`

    // 7. 🔥 CORRECTION CRITIQUE: Forcer owner pour contourner RLS
    const fileBlob = new Blob([bytes], { type: 'application/octet-stream' })
    
    // 🔥 Utiliser form-data pour passer owner explicitement
    const formData = new FormData()
    formData.append('file', fileBlob, fileName)
    
    // Upload avec metadata owner
    const { error: uploadError } = await supabase.storage
      .from('simulation-files')  // 🔥 Changé de 'geometries' à 'simulation-files'
      .upload(uniquePath, fileBlob, {
        contentType: 'application/octet-stream',
        upsert: false,
        // 🔥 Metadata pour owner
        metadata: {
          owner: userId,
          uploaded_by: userId,
          simulation_id: simulationId || 'none'
        }
      })

    if (uploadError) {
      console.error('❌ Erreur Storage:', uploadError)
      throw new Error(`Erreur Storage: ${uploadError.message}`)
    }

    // 8. GÉNÉRATION D'UNE URL PUBLIQUE (bucket public)
    const { data: urlData, error: urlError } = await supabase.storage
      .from('simulation-files')
      .getPublicUrl(uniquePath)

    if (urlError) {
      throw new Error(`Erreur URL: ${urlError.message}`)
    }

    const fileUrl = urlData.publicUrl

    // 9. MISE À JOUR DE LA SIMULATION
    if (simulationId) {
      const { error: updateError } = await supabase
        .from('simulations')
        .update({
          geometry_config: {
            ...geometry_config,
            file_url: fileUrl,
            file_path: uniquePath,
            file_name: fileName,
            file_size: bytes.length,
            uploaded_at: new Date().toISOString(),
            file_type: 'application/octet-stream'
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', simulationId)
        .eq('user_id', userId)

      if (updateError) {
        console.warn(`[Upload] Erreur update simulation: ${updateError.message}`)
      }
    }

    // 10. CRÉATION DU RECORD mesh_data
    try {
      await supabase
        .from('mesh_data')
        .insert({
          simulation_id: simulationId || null,
          user_id: userId,
          file_name: uniquePath,
          file_url: fileUrl,
          file_size: bytes.length,
          mesh_type: 'unstructured',
          original_filename: fileName,
          created_at: new Date().toISOString()
        })
    } catch (meshError: any) {
      console.warn(`[Upload] Erreur création mesh_data: ${meshError.message}`)
    }

    // 11. RÉPONSE SUCCÈS
    return new Response(JSON.stringify({
      success: true,
      fileUrl: fileUrl,
      fileName: fileName,
      fileSize: bytes.length,
      path: uniquePath,
      message: 'Fichier uploadé avec succès'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error: any) {
    console.error(`[UploadGeometry] Erreur critique: ${error.message}`)
    
    // 🔥 Retourner des informations détaillées pour le débogage
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
