import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { useAuthStore } from './auth/authStore'
import { CartProvider } from './cart/CartContext'
import Login from './pages/Login'
import ChangePassword from './pages/ChangePassword'
import ResetPassword from './pages/ResetPassword'
import AcceptInvitation from './pages/AcceptInvitation'
import Users from './pages/Users'
import Dashboard from './pages/Dashboard'
import Inventory from './pages/Inventory'
import Products from './pages/Products'
import Branches from './pages/Branches'
import BranchDetail from './pages/BranchDetail'
import StockRequests from './pages/StockRequests'
import Transfers from './pages/Transfers'
import Deliveries from './pages/Deliveries'
import Activity from './pages/Activity'
import ShopCategories from './pages/shop/Categories'
import ShopCategoryProducts from './pages/shop/CategoryProducts'
import ShopCart from './pages/shop/Cart'
import StockIntake from './pages/stock-intake/StockIntake'
import StockIntakeDetail from './pages/stock-intake/StockIntakeDetail'
import Documents from './pages/Documents'

function RequireAuth({ children }: { children: React.ReactElement }) {
  const token = useAuthStore((s) => s.token)
  const mustChangePassword = useAuthStore((s) => s.user?.mustChangePassword)
  const { pathname } = useLocation()
  if (!token) return <Navigate to="/login" replace />
  // The server refuses every other route until the user has chosen their own password; this just routes them there.
  if (mustChangePassword && pathname !== '/change-password') return <Navigate to="/change-password" replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <CartProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/accept-invitation" element={<AcceptInvitation />} />
          <Route
            path="/change-password"
            element={
              <RequireAuth>
                <ChangePassword />
              </RequireAuth>
            }
          />
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
            <Route path="/shop" element={<ShopCategories />} />
            <Route path="/shop/cart" element={<ShopCart />} />
            <Route path="/shop/:categoryId" element={<ShopCategoryProducts />} />
            <Route path="/stock-intake" element={<StockIntake />} />
            <Route path="/stock-intake/:id" element={<StockIntakeDetail />} />
            <Route path="/documents" element={<Documents />} />
            <Route path="/users" element={<Users />} />
            {/* Unknown paths (including the removed /roadmap) go to the dashboard; signed-out visitors are sent to /login first. */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </CartProvider>
    </BrowserRouter>
  )
}
