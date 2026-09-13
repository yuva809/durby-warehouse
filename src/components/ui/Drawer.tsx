import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  widthClass = 'max-w-lg',
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
  widthClass?: string
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-ink-950/40 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <div
        className={cn(
          'absolute right-0 top-0 h-full w-full bg-white shadow-2xl flex flex-col animate-slide-up',
          widthClass,
        )}
        style={{ animationDuration: '0.28s' }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-6 py-5 shrink-0">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink-900">{title}</h2>
            {subtitle && <p className="text-sm text-ink-500 mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-600 cursor-pointer shrink-0"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="border-t border-ink-100 px-6 py-4 shrink-0">{footer}</div>}
      </div>
    </div>
  )
}
