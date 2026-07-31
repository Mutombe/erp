import { useQuery } from '@tanstack/react-query'
import { portalApi } from '@/services/api'
import type { PortalContext } from '@/types/portal'

/**
 * Loads the signed-in family member's portal context (profile, school and the
 * student cards they can see). Shared cache key so the shell and every inner
 * page read a single fetch.
 */
export function usePortalContext() {
  return useQuery({
    queryKey: ['portal', 'context'],
    queryFn: () => portalApi.context().then((r) => r.data as PortalContext),
    staleTime: 5 * 60 * 1000,
  })
}
