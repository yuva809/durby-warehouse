import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
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

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
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
