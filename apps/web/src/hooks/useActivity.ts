import { useQuery } from '@tanstack/react-query'
import { activityService } from '../services/activityService'

export function useActivity() {
  return useQuery({ queryKey: ['activity'], queryFn: activityService.list })
}
