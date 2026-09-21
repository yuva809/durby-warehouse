import { api } from '../lib/apiClient'
import type { ActivityEvent } from '../types'

interface Page<T> {
  total: number
  page: number
  pageSize: number
  items: T[]
}

export const activityService = {
  async list(): Promise<ActivityEvent[]> {
    const page = await api.get<Page<ActivityEvent>>('/activity')
    return page.items
  },
}
