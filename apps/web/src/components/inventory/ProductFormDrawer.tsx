import { useEffect, useState } from 'react'
import { AlertTriangle, PackagePlus } from 'lucide-react'
import { Drawer } from '../ui/Drawer'
import { Button } from '../ui/Button'
import { useCategories, useCreateProduct, useUpdateProduct } from '../../hooks/useCatalog'
import type { Product } from '../../types'

const inputClass =
  'mt-1.5 w-full rounded-lg bg-ink-50 px-3 py-2.5 text-sm text-ink-800 outline-none ring-1 ring-inset ring-ink-200 placeholder:text-ink-400 focus:ring-brand-400'
const labelClass = 'text-xs font-semibold uppercase tracking-wide text-ink-400'

/**
 * Create/edit form for the product catalog. `category` (the pre-existing
 * flat string, kept for backward compatibility with filters/PDFs elsewhere)
 * and `categoryId` (the authoritative ProductCategory relation used by the
 * branch category-browsing UX) are deliberately presented as ONE dropdown —
 * picking a category sets both fields together rather than asking the
 * manager to reconcile two separate "category" concepts.
 */
export function ProductFormDrawer({ product, open, onClose }: { product: Product | null; open: boolean; onClose: () => void }) {
  const isEdit = !!product
  const { data: categories = [] } = useCategories()
  const create = useCreateProduct()
  const update = useUpdateProduct()
  const pending = create.isPending || update.isPending
  const mutationError = create.error ?? update.error

  const [sku, setSku] = useState('')
  const [name, setName] = useState('')
  const [barcode, setBarcode] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [brand, setBrand] = useState('')
  const [pack, setPack] = useState('')
  const [unit, setUnit] = useState('')
  const [minStock, setMinStock] = useState('0')
  const [unitPrice, setUnitPrice] = useState('')

  useEffect(() => {
    if (!open) return
    setSku(product?.sku ?? '')
    setName(product?.name ?? '')
    setBarcode(product?.barcode ?? '')
    setCategoryId(product?.categoryId ?? '')
    setBrand(product?.brand ?? '')
    setPack(product?.pack ?? '')
    setUnit(product?.unit ?? '')
    setMinStock(String(product?.minStock ?? 0))
    setUnitPrice(product ? String(product.unitPrice) : '')
    create.reset()
    update.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product?.id])

  const canSubmit = sku.trim() && name.trim() && categoryId && unit.trim() && unitPrice.trim() && Number(unitPrice) >= 0

  async function handleSubmit() {
    const category = categories.find((c) => c.id === categoryId)
    if (!category) return
    const shared = {
      name: name.trim(),
      barcode: barcode.trim() || undefined,
      category: category.name,
      categoryId,
      brand: brand.trim() || undefined,
      pack: pack.trim() || undefined,
      unit: unit.trim(),
      minStock: Number(minStock) || 0,
      unitPrice: Number(unitPrice),
    }
    if (isEdit) {
      await update.mutateAsync({ id: product!.id, dto: shared })
    } else {
      await create.mutateAsync({ sku: sku.trim(), ...shared })
    }
    onClose()
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Product' : 'Add Product'}
      subtitle={isEdit ? product!.name : 'Add a new item to the catalog'}
      footer={
        <div className="space-y-2">
          {mutationError && (
            <div className="flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
              <AlertTriangle size={14} className="shrink-0" /> {(mutationError as Error).message}
            </div>
          )}
          <Button className="w-full" size="lg" disabled={!canSubmit || pending} onClick={handleSubmit}>
            <PackagePlus size={16} /> {pending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Product'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className={labelClass}>Article No. (SKU)</label>
          <input
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            disabled={isEdit}
            placeholder="e.g. RICE-224"
            className={inputClass + (isEdit ? ' opacity-60' : '')}
          />
        </div>
        <div>
          <label className={labelClass}>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ponni Boiled Rice" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Barcode / EAN (optional)</label>
          <input
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            placeholder="e.g. 8901058023800"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Category</label>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputClass}>
            <option value="">Select a category…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Brand (optional)</label>
            <input value={brand} onChange={(e) => setBrand(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Pack (optional)</label>
            <input value={pack} onChange={(e) => setPack(e.target.value)} placeholder="e.g. 12x1kg" className={inputClass} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelClass}>Unit</label>
            <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. kg" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Min Stock</label>
            <input type="number" min={0} value={minStock} onChange={(e) => setMinStock(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Unit Price (€)</label>
            <input type="number" min={0} step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} className={inputClass} />
          </div>
        </div>
      </div>
    </Drawer>
  )
}
