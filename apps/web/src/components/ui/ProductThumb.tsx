import { useState } from 'react'
import { ImageOff } from 'lucide-react'
import { cn } from '../../lib/utils'

/**
 * The one place an <img src={product image}> ever appears — every card/list
 * that shows a product image uses this instead of a raw <img> tag, so a
 * dead/expired external URL (the image lives on someone else's CDN, not
 * ours) always falls back to the same clean placeholder rather than a
 * browser's broken-image icon.
 */
export function ProductThumb({ src, size = 40, className, iconSize }: { src?: string | null; size?: number; className?: string; iconSize?: number }) {
  const [failed, setFailed] = useState(false)
  const showImage = src && !failed

  return (
    <span
      className={cn('flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-ink-50 ring-1 ring-ink-200/70', className)}
      style={{ height: size, width: size }}
    >
      {showImage ? (
        <img src={src} alt="" className="h-full w-full object-contain" onError={() => setFailed(true)} />
      ) : (
        <ImageOff size={iconSize ?? Math.round(size * 0.4)} className="text-ink-300" />
      )}
    </span>
  )
}
