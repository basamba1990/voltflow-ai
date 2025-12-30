import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: localStorage,
  },
  global: {
    headers: {
      'X-Client-Info': 'voltflow-ai-web',
    },
  },
})

// Types helpers
export type Tables<T extends keyof Database['public']['Tables']> = 
  Database['public']['Tables'][T]['Row']

export type Enums<T extends keyof Database['public']['Enums']> = 
  Database['public']['Enums'][T]

// API helpers
export const getCurrentUser = async () => {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export const getUserProfile = async (userId: string) => {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single()
  
  if (error) throw error
  return data
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
  return simulation
}

export const runSimulation = async (simulationId: string, config: any) => {
  const user = await getCurrentUser()
  if (!user) throw new Error('Not authenticated')

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('No active session')

  const { data, error } = await supabase.functions.invoke('simulate', {
    body: {
      simulationId,
      userId: user.id,
      config,
    },
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  })

  if (error) throw error
  return data
}

export const getSimulations = async (filters?: {
  status?: string
  limit?: number
  offset?: number
}) => {
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
    .order('created_at', { ascending: false })

  if (filters?.status) {
    query = query.eq('status', filters.status)
  }

  if (filters?.limit) {
    query = query.limit(filters.limit)
  }

  if (filters?.offset) {
    query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1)
  }

  const { data, error } = await query

  if (error) throw error
  return data
}

export const uploadGeometryFile = async (file: File, simulationId?: string) => {
  const user = await getCurrentUser()
  if (!user) throw new Error('Not authenticated')

  // Convert file to base64
  const reader = new FileReader()
  const fileData = await new Promise<string>((resolve, reject) => {
    reader.onload = () => {
      const result = reader.result as string
      const base64String = result.includes(',') ? result.split(',')[1] : result
      resolve(base64String)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('No active session')

  const { data, error } = await supabase.functions.invoke('upload-geometry', {
    body: {
      fileName: file.name,
      fileData,
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
}
