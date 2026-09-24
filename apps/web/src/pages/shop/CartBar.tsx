import { useNavigate } from 'react-router-dom'
import { ShoppingCart } from 'lucide-react'
import { useCart } from '../../cart/CartContext'

/** Floating "View Cart" button shown on the category grid and product list pages — hidden once the cart is empty. */
export function CartBar() {
  const cart = useCart()
  const navigate = useNavigate()
  if (cart.totalCount === 0) return null
  return (
    <button
      onClick={() => navigate('/shop/cart')}
      className="fixed bottom-6 right-6 z-30 flex items-center gap-2 rounded-full bg-ink-900 px-5 py-3.5 text-sm font-semibold text-white shadow-xl shadow-ink-900/20 hover:bg-ink-800 cursor-pointer"
    >
      <ShoppingCart size={16} />
      View Cart ({cart.totalCount})
    </button>
  )
}
