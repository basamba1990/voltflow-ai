// Dans simulation.service.ts - Fonction startSimulation corrigée
export const startSimulation = async (simulationId: string): Promise<StartSimulationResponse> => {
  if (!simulationId) {
    return {
      success: false,
      simulation_id: simulationId,
      status: 'failed',
      error: 'Invalid simulation ID',
      timestamp: new Date().toISOString()
    }
  }

  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) {
    return {
      success: false,
      simulation_id: simulationId,
      status: 'failed',
      error: 'Authentication required',
      timestamp: new Date().toISOString()
    }
  }

  try {
    // Timeout de 300 secondes pour les longues simulations
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 300000)

    const { data, error } = await supabase.functions.invoke('simulate', {
      body: { simulationId },
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'x-client-info': 'voltflow-web/1.0'
      }
    })

    clearTimeout(timeoutId)

    if (error) {
      console.error('[SimulationService] Edge Function error:', error)
      
      // Mettre à jour le statut en cas d'erreur
      await supabase
        .from('simulations')
        .update({ 
          status: 'failed', 
          error_message: error.message,
          updated_at: new Date().toISOString()
        })
        .eq('id', simulationId)
        .eq('user_id', session.user.id)

      return {
        success: false,
        simulation_id: simulationId,
        status: 'failed',
        error: error.message,
        timestamp: new Date().toISOString()
      }
    }

    // Valider la réponse
    if (!data || typeof data.success !== 'boolean') {
      throw new Error('Invalid response from simulation service')
    }

    return {
      ...data,
      timestamp: new Date().toISOString()
    }

  } catch (error: any) {
    console.error('[SimulationService] Network error:', error)
    
    return {
      success: false,
      simulation_id: simulationId,
      status: 'failed',
      error: error.name === 'AbortError' 
        ? 'Simulation timeout (5 minutes)' 
        : error.message || 'Network error',
      timestamp: new Date().toISOString()
    }
  }
}

// Fonction d'upload DIRECT au storage (SANS Edge Function)
export const uploadGeometry = async (params: { 
  file: File; 
  simulationId?: string;
  onProgress?: (progress: number) => void;
}): Promise<UploadGeometryResponse> => {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) {
    return {
      success: false,
      fileUrl: '',
      fileName: params.file.name,
      error: 'You must be logged in to upload files',
      timestamp: new Date().toISOString()
    }
  }

  // Validation stricte
  const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
  const ALLOWED_EXTENSIONS = ['stl', 'step', 'stp', 'obj', 'vtp', 'vti', 'ply', 'vtk', 'iges', 'igs']

  if (params.file.size > MAX_FILE_SIZE) {
    return {
      success: false,
      fileUrl: '',
      fileName: params.file.name,
      error: `File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`,
      timestamp: new Date().toISOString()
    }
  }

  const fileExt = params.file.name.toLowerCase().split('.').pop() || ''
  if (!ALLOWED_EXTENSIONS.includes(fileExt)) {
    return {
      success: false,
      fileUrl: '',
      fileName: params.file.name,
      error: `Unsupported file format: .${fileExt}. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`,
      timestamp: new Date().toISOString()
    }
  }

  try {
    // Nom de fichier sécurisé
    const timestamp = Date.now()
    const safeName = params.file.name
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .substring(0, 100)
    
    const filePath = `${session.user.id}/${timestamp}_${safeName}`

    // Upload direct avec progression
    const { data, error } = await supabase.storage
      .from('simulation-files')
      .upload(filePath, params.file, {
        cacheControl: '3600',
        upsert: false,
        contentType: 'application/octet-stream'
      })

    if (error) throw error

    // URL publique
    const { data: { publicUrl } } = supabase.storage
      .from('simulation-files')
      .getPublicUrl(filePath)

    // Mise à jour de la simulation si ID fourni
    if (params.simulationId) {
      await supabase
        .from('simulations')
        .update({
          geometry_config: {
            file_url: publicUrl,
            file_name: params.file.name,
            file_size: params.file.size,
            file_path: filePath,
            type: fileExt,
            uploaded_at: new Date().toISOString(),
            validated: true
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', params.simulationId)
        .eq('user_id', session.user.id)
    }

    return {
      success: true,
      fileUrl: publicUrl,
      fileName: params.file.name,
      fileSize: params.file.size,
      path: filePath,
      timestamp: new Date().toISOString()
    }

  } catch (error: any) {
    console.error('[SimulationService] Upload failed:', error)
    
    return {
      success: false,
      fileUrl: '',
      fileName: params.file.name,
      error: error.message || 'Upload failed',
      timestamp: new Date().toISOString()
    }
  }
}
