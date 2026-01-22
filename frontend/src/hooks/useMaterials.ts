import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MaterialService, Material } from '@/services/materialService';

export function useMaterials() {
  const queryClient = useQueryClient();
  
  return useQuery<Material[], Error>({
    queryKey: ['materials'],
    queryFn: async () => {
      try {
        const materials = await MaterialService.getMaterials();
        // Pré-cache les matériaux individuels pour les accès futurs
        materials.forEach(material => {
          queryClient.setQueryData(['material', material.id], material);
        });
        return materials;
      } catch (error) {
        console.error('Erreur lors du chargement des matériaux:', error);
        throw error;
      }
    },
    staleTime: 60 * 60 * 1000, // 1 heure
    gcTime: 5 * 60 * 1000, // 5 minutes (anciennement cacheTime)
    retry: 2,
    retryDelay: 1000,
  });
}

export function useMaterial(id: string) {
  return useQuery<Material | null, Error>({
    queryKey: ['material', id],
    queryFn: async () => {
      if (!id) return null;
      return await MaterialService.getMaterialById(id);
    },
    enabled: !!id,
    staleTime: 30 * 60 * 1000, // 30 minutes
  });
}
