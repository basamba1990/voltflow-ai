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

    if (!fileName || !fileData || !userId || !simulationId) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Missing required fields: fileName, fileData, userId, simulationId' 
      }), {
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

    // 4. INITIALISATION CLIENT SUPABASE
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Variables d\'environnement manquantes')
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // 5. DÉCODAGE BASE64 → BINARY
    const binaryString = atob(fileData)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }

    // 6. GÉNÉRATION CHEMIN UNIQUE
    const timestamp = Date.now()
    const uniqueId = Math.random().toString(36).substring(2, 9)
    const uniquePath = `${userId}/${timestamp}_${uniqueId}_${fileName}`

    // 7. UPLOAD VERS simulation-files (BUCKET UNIFIÉ)
    const fileBlob = new Blob([bytes], { type: 'application/octet-stream' })
    
    const { error: uploadError } = await supabase.storage
      .from('simulation-files')
      .upload(uniquePath, fileBlob, {
        contentType: 'application/octet-stream',
        upsert: false,
        cacheControl: '3600'
      })

    if (uploadError) {
      console.error('❌ Erreur Storage:', uploadError)
      throw new Error(`Erreur Storage: ${uploadError.message}`)
    }

    // 8. GÉNÉRATION URL PUBLIQUE
    const { data: urlData } = supabase.storage
      .from('simulation-files')
      .getPublicUrl(uniquePath)

    const fileUrl = urlData.publicUrl

    // 9. MISE À JOUR SIMULATION (CORRIGÉ)
    const { error: updateError } = await supabase
      .from('simulations')
      .update({
        geometry_config: {
          ...(geometry_config || {}),  // ✅ CORRECTION CRITIQUE
          file_url: fileUrl,
          file_path: uniquePath,
          file_name: fileName,
          file_size: bytes.length,
          uploaded_at: new Date().toISOString(),
          file_type: 'application/octet-stream'
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', simulationId)  // ✅ SUPPRIMÉ .eq('user_id', userId)

    if (updateError) {
      console.error('❌ Erreur mise à jour simulation:', updateError)
      throw new Error(`Erreur DB: ${updateError.message}`)
    }

    // 10. RÉPONSE SUCCÈS
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
    console.error('[UploadGeometry] Erreur:', error.message)
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
