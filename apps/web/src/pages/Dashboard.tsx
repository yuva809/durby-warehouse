import { WarehouseDashboard } from '../components/dashboard/WarehouseDashboard'
import { BranchDashboard } from '../components/dashboard/BranchDashboard'
import Deliveries from './Deliveries'
import { useWarehouseStore } from '../store/useWarehouseStore'
import { branchIdForRole } from '../lib/viewRoles'

export default function Dashboard() {
  const view = useWarehouseStore((s) => s.view)
  const branchId = branchIdForRole(view)

  if (branchId) return <BranchDashboard branchId={branchId} />
  if (view === 'delivery_person') return <Deliveries />
  return <WarehouseDashboard />
}
