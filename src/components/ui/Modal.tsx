import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

export function Modal({
  open,
  onClose,
  children,
  widthClass = 'max-w-md',
}: {
  open: boolean
  onClose?: () => void
  children: ReactNode
  widthClass?: string
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-950/50 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <div
        className={cn(
          'relative w-full rounded-2xl bg-white shadow-2xl animate-slide-up max-h-[85vh] overflow-y-auto',
          widthClass,
        )}
        style={{ animationDuration: '0.25s' }}
      >
        {children}
      </div>
    </div>
  )
}
