import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

// Type de base pour un Matériau
export type Material = Database['public']['Tables']['materials']['Row'];

/**
 * Service pour interagir avec la table 'materials' de Supabase.
 */
export class MaterialService {
  /**
   * Récupère tous les matériaux disponibles, triés par nom.
   * @returns Une promesse qui résout en un tableau de matériaux.
   * @throws Une erreur si la récupération échoue.
   */
  static async getMaterials(): Promise<Material[]> {
    const { data, error } = await supabase
      .from('materials')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching materials:', error);
      throw new Error(`Failed to fetch materials: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Récupère un matériau spécifique par son ID.
   * @param id L'ID du matériau.
   * @returns Une promesse qui résout en le matériau trouvé.
   * @throws Une erreur si le matériau n'est pas trouvé ou si la requête échoue.
   */
  static async getMaterialById(id: string): Promise<Material> {
    const { data, error } = await supabase
      .from('materials')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error(`Error fetching material with ID ${id}:`, error);
      throw new Error(`Failed to fetch material: ${error.message}`);
    }

    return data;
  }
}
