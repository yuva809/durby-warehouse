import { WarehouseDashboard } from '../components/dashboard/WarehouseDashboard'
import { BranchDashboard } from '../components/dashboard/BranchDashboard'
import Deliveries from './Deliveries'
import { useAuthStore } from '../auth/authStore'
import { isBranchUser, isDriver } from '../auth/roles'

export default function Dashboard() {
  const user = useAuthStore((s) => s.user)

  if (user && isBranchUser(user) && user.locationId) return <BranchDashboard branchId={user.locationId} />
  if (user && isDriver(user)) return <Deliveries />
  return <WarehouseDashboard />
}
