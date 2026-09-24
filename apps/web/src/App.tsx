import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { useAuthStore } from './auth/authStore'
import { CartProvider } from './cart/CartContext'
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
import ShopCategories from './pages/shop/Categories'
import ShopCategoryProducts from './pages/shop/CategoryProducts'
import ShopCart from './pages/shop/Cart'
import StockIntake from './pages/stock-intake/StockIntake'
import StockIntakeDetail from './pages/stock-intake/StockIntakeDetail'
import Documents from './pages/Documents'

function RequireAuth({ children }: { children: React.ReactElement }) {
  const token = useAuthStore((s) => s.token)
  if (!token) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <CartProvider>
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
            <Route path="/shop" element={<ShopCategories />} />
            <Route path="/shop/cart" element={<ShopCart />} />
            <Route path="/shop/:categoryId" element={<ShopCategoryProducts />} />
            <Route path="/stock-intake" element={<StockIntake />} />
            <Route path="/stock-intake/:id" element={<StockIntakeDetail />} />
            <Route path="/documents" element={<Documents />} />
          </Route>
        </Routes>
      </CartProvider>
    </BrowserRouter>
  )
}
