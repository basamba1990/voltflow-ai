import { supabase, handleSupabaseError } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'

export type Material = Database['public']['Tables']['materials']['Row']
export type MaterialInsert = Database['public']['Tables']['materials']['Insert']
export type MaterialUpdate = Database['public']['Tables']['materials']['Update']

export interface MaterialProperties {
  density: number;            // kg/m³
  conductivity: number;       // W/(m·K)
  specific_heat: number;      // J/(kg·K)
  youngs_modulus: number;     // GPa
  poisson_ratio: number;      // Dimensionless
  thermal_expansion: number;  // 10^-6/K
  emissivity: number;         // Dimensionless
}

export class MaterialService {
  private static cache = new Map<string, { data: Material[]; timestamp: number }>()
  private static CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

  static async getMaterials(options?: {
    refresh?: boolean;
    limit?: number;
    category?: string;
  }): Promise<Material[]> {
    const cacheKey = 'all_materials'
    const now = Date.now()
    
    // Vérifier le cache
    if (!options?.refresh && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!
      if (now - cached.timestamp < this.CACHE_DURATION) {
        return cached.data
      }
    }

    try {
      let query = supabase
        .from('materials')
        .select('*')
        .order('name', { ascending: true })
        .order('created_at', { ascending: false })

      if (options?.limit) {
        query = query.limit(options.limit)
      }

      if (options?.category) {
        query = query.eq('category', options.category)
      }

      const { data, error } = await query

      if (error) {
        const supabaseError = handleSupabaseError(error, 'getMaterials', options)
        throw new Error(supabaseError.userMessage || `Failed to fetch materials: ${error.message}`)
      }

      const materials = data || []
      
      // Mettre en cache
      this.cache.set(cacheKey, { data: materials, timestamp: now })
      
      // Mettre en cache individuellement
      materials.forEach(material => {
        this.cache.set(`material_${material.id}`, { 
          data: [material], 
          timestamp: now 
        })
      })

      return materials
    } catch (error: any) {
      console.error('❌ getMaterials error:', error)
      
      // En cas d'erreur, essayer de retourner le cache même si expiré
      if (this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey)!
        console.warn('⚠️ Returning cached materials due to error')
        return cached.data
      }
      
      throw error
    }
  }

  static async getMaterialById(id: string, options?: { refresh?: boolean }): Promise<Material> {
    const cacheKey = `material_${id}`
    const now = Date.now()
    
    // Vérifier le cache
    if (!options?.refresh && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!
      if (now - cached.timestamp < this.CACHE_DURATION) {
        return cached.data[0]
      }
    }

    try {
      const { data, error } = await supabase
        .from('materials')
        .select('*')
        .eq('id', id)
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          throw new Error(`Material with ID ${id} not found`)
        }
        const supabaseError = handleSupabaseError(error, 'getMaterialById', { id })
        throw new Error(supabaseError.userMessage || `Failed to fetch material: ${error.message}`)
      }

      // Mettre en cache
      this.cache.set(cacheKey, { data: [data], timestamp: now })
      
      return data
    } catch (error: any) {
      console.error(`❌ getMaterialById error for ${id}:`, error)
      
      // Essayer de retourner le cache même si expiré
      if (this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey)!
        console.warn('⚠️ Returning cached material due to error')
        return cached.data[0]
      }
      
      throw error
    }
  }

  static async getMaterialProperties(id: string): Promise<MaterialProperties> {
    const material = await this.getMaterialById(id)
    
    return {
      density: material.density || 7800, // Valeurs par défaut pour l'acier
      conductivity: material.conductivity || 50,
      specific_heat: material.specific_heat || 500,
      youngs_modulus: material.youngs_modulus || 210,
      poisson_ratio: material.poisson_ratio || 0.3,
      thermal_expansion: material.thermal_expansion || 12,
      emissivity: material.emissivity || 0.8,
    }
  }

  static async searchMaterials(query: string): Promise<Material[]> {
    try {
      const { data, error } = await supabase
        .from('materials')
        .select('*')
        .or(`name.ilike.%${query}%,description.ilike.%${query}%,category.ilike.%${query}%`)
        .order('name', { ascending: true })
        .limit(20)

      if (error) {
        const supabaseError = handleSupabaseError(error, 'searchMaterials', { query })
        throw new Error(supabaseError.userMessage || `Search failed: ${error.message}`)
      }

      return data || []
    } catch (error: any) {
      console.error('❌ searchMaterials error:', error)
      throw error
    }
  }

  static async getMaterialCategories(): Promise<string[]> {
    try {
      const { data, error } = await supabase
        .from('materials')
        .select('category')
        .not('category', 'is', null)
        .order('category', { ascending: true })

      if (error) {
        const supabaseError = handleSupabaseError(error, 'getMaterialCategories')
        throw new Error(supabaseError.userMessage || `Failed to fetch categories: ${error.message}`)
      }

      // Extraire les catégories uniques
      const categories = [...new Set(data?.map(item => item.category).filter(Boolean) as string[])]
      return categories
    } catch (error: any) {
      console.error('❌ getMaterialCategories error:', error)
      return []
    }
  }

  static async createMaterial(material: Omit<MaterialInsert, 'id' | 'created_at' | 'updated_at'>): Promise<Material> {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) throw new Error('Authentication required')

      // Validation
      if (!material.name?.trim()) throw new Error('Material name is required')
      if (!material.density || material.density <= 0) throw new Error('Valid density is required')
      if (!material.conductivity || material.conductivity <= 0) throw new Error('Valid conductivity is required')

      const newMaterial = {
        ...material,
        created_by: session.user.id,
        updated_by: session.user.id,
      }

      const { data, error } = await supabase
        .from('materials')
        .insert(newMaterial)
        .select()
        .single()

      if (error) {
        const supabaseError = handleSupabaseError(error, 'createMaterial', {
          name: material.name
        })
        throw new Error(supabaseError.userMessage || `Failed to create material: ${error.message}`)
      }

      // Invalider le cache
      this.cache.clear()

      return data
    } catch (error: any) {
      console.error('❌ createMaterial error:', error)
      throw error
    }
  }

  static async updateMaterial(id: string, updates: MaterialUpdate): Promise<Material> {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) throw new Error('Authentication required')

      const updateData = {
        ...updates,
        updated_by: session.user.id,
        updated_at: new Date().toISOString(),
      }

      const { data, error } = await supabase
        .from('materials')
        .update(updateData)
        .eq('id', id)
        .select()
        .single()

      if (error) {
        const supabaseError = handleSupabaseError(error, 'updateMaterial', { id })
        throw new Error(supabaseError.userMessage || `Failed to update material: ${error.message}`)
      }

      // Invalider le cache
      this.cache.clear()
      this.cache.delete(`material_${id}`)

      return data
    } catch (error: any) {
      console.error(`❌ updateMaterial error for ${id}:`, error)
      throw error
    }
  }

  static async deleteMaterial(id: string): Promise<void> {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) throw new Error('Authentication required')

      const { error } = await supabase
        .from('materials')
        .delete()
        .eq('id', id)

      if (error) {
        const supabaseError = handleSupabaseError(error, 'deleteMaterial', { id })
        throw new Error(supabaseError.userMessage || `Failed to delete material: ${error.message}`)
      }

      // Invalider le cache
      this.cache.clear()
      this.cache.delete(`material_${id}`)
    } catch (error: any) {
      console.error(`❌ deleteMaterial error for ${id}:`, error)
      throw error
    }
  }

  static clearCache(): void {
    this.cache.clear()
  }

  static async validateMaterialProperties(properties: Partial<MaterialProperties>): Promise<string[]> {
    const errors: string[] = []

    if (properties.density !== undefined && properties.density <= 0) {
      errors.push('Density must be positive')
    }

    if (properties.conductivity !== undefined && properties.conductivity <= 0) {
      errors.push('Conductivity must be positive')
    }

    if (properties.specific_heat !== undefined && properties.specific_heat <= 0) {
      errors.push('Specific heat must be positive')
    }

    if (properties.youngs_modulus !== undefined && properties.youngs_modulus <= 0) {
      errors.push("Young's modulus must be positive")
    }

    if (properties.poisson_ratio !== undefined && 
        (properties.poisson_ratio < -1 || properties.poisson_ratio > 0.5)) {
      errors.push("Poisson's ratio must be between -1 and 0.5")
    }

    if (properties.emissivity !== undefined && 
        (properties.emissivity < 0 || properties.emissivity > 1)) {
      errors.push('Emissivity must be between 0 and 1')
    }

    return errors
  }
}
