import { useQuery } from '@tanstack/react-query'
import { MaterialService, Material } from '../services/materialService'

export function useMaterials() {
  return useQuery<Material[], Error>({
    queryKey: ['materials'],
    queryFn: async () => {
      return await MaterialService.getMaterials()
    },
    staleTime: 60 * 60 * 1000, // 1 heure
  })
}
