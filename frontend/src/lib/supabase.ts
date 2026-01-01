import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env file.')
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? localStorage : undefined,
  },
  global: {
    headers: {
      'X-Client-Info': 'voltflow-ai-web/v1.0.0',
    },
  },
  db: {
    schema: 'public',
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
})

// Types helpers
export type Tables<T extends keyof Database['public']['Tables']> = 
  Database['public']['Tables'][T]['Row']

export type InsertTables<T extends keyof Database['public']['Tables']> = 
  Database['public']['Tables'][T]['Insert']

export type UpdateTables<T extends keyof Database['public']['Tables']> = 
  Database['public']['Tables'][T]['Update']

// API helpers with error handling
export const getCurrentUser = async () => {
  try {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error) throw error
    return user
  } catch (error) {
    console.error('Error getting current user:', error)
    return null
  }
}

export const getUserProfile = async (userId: string) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') {
        // User profile doesn't exist, create it
        return await createUserProfile(userId)
      }
      throw error
    }
    
    return data
  } catch (error) {
    console.error('Error getting user profile:', error)
    throw error
  }
}

const createUserProfile = async (userId: string) => {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('No user found')

    const { data, error } = await supabase
      .from('users')
      .insert({
        id: userId,
        email: user.email || '',
        full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
        role: 'user',
        subscription_plan: 'starter',
        subscription_status: 'active',
        simulations_used: 0,
        simulations_limit: 10,
      })
      .select()
      .single()

    if (error) throw error
    return data
  } catch (error) {
    console.error('Error creating user profile:', error)
    throw error
  }
}

export const createSimulation = async (data: {
  name: string
  description?: string
  geometry_type: string
  geometry_config: any
  material_id?: string
  boundary_conditions: any
  mesh_density?: string
}) => {
  try {
    const user = await getCurrentUser()
    if (!user) throw new Error('Not authenticated')

    const { data: simulation, error } = await supabase
      .from('simulations')
      .insert({
        user_id: user.id,
        ...data,
        status: 'pending',
        progress: 0,
      })
      .select()
      .single()

    if (error) throw error
    
    // Increment simulations used count
    await supabase.rpc('increment_simulations_used', { user_uuid: user.id })
    
    return simulation
  } catch (error) {
    console.error('Error creating simulation:', error)
    throw error
  }
}

export const runSimulation = async (simulationId: string, config: any) => {
  try {
    const user = await getCurrentUser()
    if (!user) throw new Error('Not authenticated')

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('No active session')

    // Verify simulation exists and belongs to user
    const { data: simulation, error: simError } = await supabase
      .from('simulations')
      .select('id, user_id')
      .eq('id', simulationId)
      .eq('user_id', user.id)
      .single()

    if (simError || !simulation) {
      throw new Error('Simulation not found or unauthorized')
    }

    // Call edge function
    const { data, error } = await supabase.functions.invoke('simulate', {
      method: 'POST',
      body: {
        simulationId,
        config,
      },
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    })

    if (error) {
      // Update simulation status to failed
      await supabase
        .from('simulations')
        .update({ status: 'failed', progress: 0 })
        .eq('id', simulationId)
      
      throw new Error(`Simulation failed: ${error.message}`)
    }

    return data
  } catch (error) {
    console.error('Error running simulation:', error)
    throw error
  }
}

export const getSimulations = async (filters?: {
  status?: string
  limit?: number
  offset?: number
  orderBy?: string
  ascending?: boolean
}) => {
  try {
    const user = await getCurrentUser()
    if (!user) throw new Error('Not authenticated')

    let query = supabase
      .from('simulations')
      .select(`
        *,
        simulation_results (*),
        materials (*)
      `)
      .eq('user_id', user.id)

    if (filters?.status) {
      query = query.eq('status', filters.status)
    }

    if (filters?.limit) {
      query = query.limit(filters.limit)
    }

    if (filters?.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1)
    }

    if (filters?.orderBy) {
      query = query.order(filters.orderBy, { 
        ascending: filters.ascending !== false 
      })
    } else {
      query = query.order('created_at', { ascending: false })
    }

    const { data, error } = await query

    if (error) throw error
    return data || []
  } catch (error) {
    console.error('Error getting simulations:', error)
    throw error
  }
}

export const uploadGeometryFile = async (file: File, simulationId?: string) => {
  try {
    const user = await getCurrentUser()
    if (!user) throw new Error('Not authenticated')

    // Convert file to base64
    const arrayBuffer = await file.arrayBuffer()
    const base64String = btoa(
      String.fromCharCode(...new Uint8Array(arrayBuffer))
    )

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('No active session')

    const { data, error } = await supabase.functions.invoke('upload-geometry', {
      method: 'POST',
      body: {
        fileName: file.name,
        fileData: base64String,
        fileType: file.type,
        userId: user.id,
        simulationId,
      },
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    })

    if (error) throw error
    return data
  } catch (error) {
    console.error('Error uploading geometry:', error)
    throw error
  }
}

// Real-time subscriptions
export const subscribeToSimulation = (simulationId: string, callback: (payload: any) => void) => {
  return supabase
    .channel(`simulation-${simulationId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'simulations',
        filter: `id=eq.${simulationId}`,
      },
      callback
    )
    .subscribe()
}

export const unsubscribeFromChannel = (channel: any) => {
  supabase.removeChannel(channel)
}
