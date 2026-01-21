import { supabase } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'

export type Material = Database['public']['Tables']['materials']['Row']

export class MaterialService {
  static async getMaterials() {
    const { data, error } = await supabase
      .from('materials')
      .select('*')
      .order('name', { ascending: true })

    if (error) throw new Error(`Failed to fetch materials: ${error.message}`)
    return data || []
  }

  static async getMaterialById(id: string) {
    const { data, error } = await supabase
      .from('materials')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw new Error(`Failed to fetch material: ${error.message}`)
    return data
  }
}
