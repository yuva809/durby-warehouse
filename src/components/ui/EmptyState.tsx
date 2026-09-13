import type { ReactNode } from 'react'

export function EmptyState({ icon, title, subtitle }: { icon?: ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
      {icon && <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-ink-100 text-ink-400">{icon}</div>}
      <p className="font-medium text-ink-600">{title}</p>
      {subtitle && <p className="max-w-xs text-sm text-ink-400">{subtitle}</p>}
    </div>
  )
}
