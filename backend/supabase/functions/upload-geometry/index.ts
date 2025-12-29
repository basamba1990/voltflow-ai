import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import * as base64 from 'https://deno.land/std@0.168.0/encoding/base64.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  console.log('Geometry upload function called')

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    const { fileName, fileData, fileType, userId, simulationId } = await req.json()
    
    if (!fileName || !fileData || !userId) {
      throw new Error('Missing required fields: fileName, fileData, or userId')
    }

    // Validate file type
    const allowedTypes = ['stl', 'step', 'stp', 'obj', 'iges', 'igs']
    const fileExtension = fileName.split('.').pop()?.toLowerCase()
    
    if (!fileExtension || !allowedTypes.includes(fileExtension)) {
      throw new Error(`Invalid file type. Allowed: ${allowedTypes.join(', ')}`)
    }

    // Validate file size (max 50MB)
    const fileSize = (fileData.length * 3) / 4 - (fileData.endsWith('==') ? 2 : fileData.endsWith('=') ? 1 : 0)
    if (fileSize > 50 * 1024 * 1024) {
      throw new Error('File size exceeds 50MB limit')
    }

    // Decode base64 data
    const fileBytes = base64.decode(fileData)
    
    // Generate unique filename
    const uniqueFileName = `${userId}/${Date.now()}_${fileName}`
    
    // Upload to Supabase Storage
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    
    const uploadResponse = await fetch(`${supabaseUrl}/storage/v1/object/geometries/${uniqueFileName}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/octet-stream',
      },
      body: fileBytes,
    })

    if (!uploadResponse.ok) {
      const error = await uploadResponse.text()
      throw new Error(`Storage upload failed: ${error}`)
    }

    const fileUrl = `${supabaseUrl}/storage/v1/object/public/geometries/${uniqueFileName}`

    return new Response(
      JSON.stringify({
        success: true,
        fileName,
        fileUrl,
        fileSize,
        message: 'File uploaded successfully',
        path: uniqueFileName,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )

  } catch (error) {
    console.error('Error in upload function:', error)
    
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
