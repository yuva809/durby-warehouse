import { useRef, useState } from 'react'
import { Search, CheckCircle2, RotateCcw, Upload, Trash2, AlertTriangle } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { ProductThumb } from '../ui/ProductThumb'
import { useProductImage, useLookupProductImage, useSearchAgainProductImage, useApproveProductImage, useUploadProductImage, useRemoveProductImage } from '../../hooks/useProductImage'
import { cn } from '../../lib/utils'

const STATUS_STYLE: Record<string, { label: string; className: string }> = {
  NOT_FOUND: { label: 'No image found', className: 'bg-ink-100 text-ink-500 ring-ink-500/10' },
  FOUND_NEEDS_REVIEW: { label: 'Needs review', className: 'bg-amber-50 text-amber-700 ring-amber-600/20' },
  AUTO_MATCHED: { label: 'Auto-matched', className: 'bg-blue-50 text-blue-700 ring-blue-600/20' },
  VERIFIED: { label: 'Verified', className: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
  MANUAL_UPLOAD: { label: 'Manually uploaded', className: 'bg-violet-50 text-violet-700 ring-violet-600/20' },
}

/**
 * Catalog image management for one product — reused wherever a manager
 * needs to see/act on a product's image (ProductDrawer today). Every action
 * here is purely catalog enrichment: nothing it does can affect inventory
 * or stock intake, and every mutation is independent (no "save" step that
 * ties this to anything else on the page).
 */
export function ProductImagePanel({ productId }: { productId: string }) {
  const { data: image, isLoading } = useProductImage(productId)
  const lookup = useLookupProductImage()
  const searchAgain = useSearchAgainProductImage()
  const approve = useApproveProductImage()
  const upload = useUploadProductImage()
  const remove = useRemoveProductImage()
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  const pending = lookup.isPending || searchAgain.isPending || approve.isPending || upload.isPending || remove.isPending
  const status = image?.status
  const hasCandidate = !!image?.imageUrl
  const needsApproval = status === 'FOUND_NEEDS_REVIEW' || status === 'AUTO_MATCHED'

  async function run(fn: () => Promise<unknown>) {
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="rounded-xl ring-1 ring-ink-200/70 p-3.5">
      <div className="flex gap-3.5">
        <ProductThumb src={hasCandidate ? image!.imageUrl : null} size={80} iconSize={22} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-ink-400">Product Image</div>
            {status && (
              <Badge className={cn('shrink-0', STATUS_STYLE[status]?.className)}>{STATUS_STYLE[status]?.label ?? status}</Badge>
            )}
          </div>
          {image?.confidence != null && (
            <div className="mt-1 text-xs text-ink-400">Confidence: {image.confidence}%</div>
          )}
          {image?.matchedName && (
            <div className="mt-0.5 truncate text-xs text-ink-400">Matched: {image.matchedName}{image.matchedBrand ? ` · ${image.matchedBrand}` : ''}</div>
          )}
          {image?.attribution && <div className="mt-0.5 text-[10px] text-ink-300">{image.attribution}</div>}
          {!isLoading && !image && <div className="mt-1 text-xs text-ink-400">No image lookup has been run yet.</div>}
        </div>
      </div>

      {error && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
          <AlertTriangle size={13} className="shrink-0" /> {error}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {!image && (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => lookup.mutateAsync(productId))}>
            <Search size={13} /> Find Image
          </Button>
        )}
        {image && needsApproval && (
          <Button size="sm" disabled={pending} onClick={() => run(() => approve.mutateAsync(productId))}>
            <CheckCircle2 size={13} /> Approve
          </Button>
        )}
        {image && (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => searchAgain.mutateAsync(productId))}>
            <RotateCcw size={13} /> Search Again
          </Button>
        )}
        <Button size="sm" variant="outline" disabled={pending} onClick={() => fileRef.current?.click()}>
          <Upload size={13} /> Upload Manually
        </Button>
        {image && (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => remove.mutateAsync(productId))}>
            <Trash2 size={13} /> Remove
          </Button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) run(() => upload.mutateAsync({ productId, file }))
            e.target.value = ''
          }}
        />
      </div>
    </div>
  )
}
