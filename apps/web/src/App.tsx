import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { useAuthStore } from './auth/authStore'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Inventory from './pages/Inventory'
import Products from './pages/Products'
import Branches from './pages/Branches'
import BranchDetail from './pages/BranchDetail'
import StockRequests from './pages/StockRequests'
import Transfers from './pages/Transfers'
import Deliveries from './pages/Deliveries'
import Activity from './pages/Activity'
import Roadmap from './pages/Roadmap'

function RequireAuth({ children }: { children: React.ReactElement }) {
  const token = useAuthStore((s) => s.token)
  if (!token) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route path="/" element={<Dashboard />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/products" element={<Products />} />
          <Route path="/branches" element={<Branches />} />
          <Route path="/branches/:branchId" element={<BranchDetail />} />
          <Route path="/requests" element={<StockRequests />} />
          <Route path="/transfers" element={<Transfers />} />
          <Route path="/deliveries" element={<Deliveries />} />
          <Route path="/activity" element={<Activity />} />
          <Route path="/roadmap" element={<Roadmap />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
