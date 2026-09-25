import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { userService } from '../services/userService'

export function useUsers() {
  return useQuery({ queryKey: ['users'], queryFn: userService.list })
}

export function useIssueResetCode() {
  const qc = useQueryClient()
  // Deliberately no cache of the response: the code must live only in the component that shows it once.
  return useMutation({
    mutationFn: (userId: string) => userService.issueResetCode(userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })
}
