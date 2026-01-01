// backend/supabase/functions/upload-geometry/index.ts
import { createClient } from "npm:@supabase/supabase-js@2.38.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Credentials': 'true',
  'Vary': 'Origin'
}

Deno.serve(async (req: Request) => {
  console.log('[UploadGeometry] Function called')

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

    // Parse request body
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

    const { fileName, fileData, fileType, userId, simulationId } = body
    
    // Validate required fields
    if (!fileName || !fileData || !userId) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing required fields: fileName, fileData, userId' 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Validate file type
    const allowedTypes = ['stl', 'step', 'stp', 'obj', 'iges', 'igs']
    const fileExtension = fileName.toLowerCase().split('.').pop()
    
    if (!fileExtension || !allowedTypes.includes(fileExtension)) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Invalid file type. Allowed: ${allowedTypes.join(', ')}` 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Validate file size (max 50MB)
    const fileSize = (fileData.length * 3) / 4 - 
      (fileData.endsWith('==') ? 2 : fileData.endsWith('=') ? 1 : 0)
    
    if (fileSize > 50 * 1024 * 1024) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'File size exceeds 50MB limit' 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Initialize Supabase client
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing Supabase environment variables')
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Verify user exists
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .single()

    if (userError || !user) {
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

    // Decode base64 data
    const binaryString = atob(fileData)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }

    // Generate unique filename
    const timestamp = Date.now()
    const uniqueId = Math.random().toString(36).substring(2, 9)
    const uniqueFileName = `${userId}/${timestamp}_${uniqueId}_${fileName}`

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase
      .storage
      .from('geometries')
      .upload(uniqueFileName, bytes, {
        contentType: 'application/octet-stream',
        upsert: false
      })

    if (uploadError) {
      console.error(`[UploadGeometry] Storage upload failed: ${uploadError.message}`)
      throw new Error(`Storage upload failed: ${uploadError.message}`)
    }

    // Get public URL
    const { data: { publicUrl } } = supabase
      .storage
      .from('geometries')
      .getPublicUrl(uniqueFileName)

    // Update simulation with geometry info if simulationId provided
    if (simulationId) {
      try {
        await supabase
          .from('simulations')
          .update({
            geometry_config: {
              ...body.geometry_config,
              file_url: publicUrl,
              file_name: fileName,
              file_size: fileSize
            }
          })
          .eq('id', simulationId)
          .eq('user_id', userId)
      } catch (updateError) {
        console.warn(`[UploadGeometry] Failed to update simulation: ${updateError.message}`)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        fileName,
        fileUrl: publicUrl,
        fileSize,
        path: uniqueFileName,
        message: 'File uploaded successfully',
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )

  } catch (error) {
    console.error(`[UploadGeometry] Error: ${error.message}`)
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message,
        details: error.stack 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
