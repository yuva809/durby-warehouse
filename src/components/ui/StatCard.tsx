import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

export function StatCard({
  icon,
  label,
  value,
  hint,
  tone = 'default',
  className,
}: {
  icon: ReactNode
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: 'default' | 'warning' | 'danger' | 'brand'
  className?: string
}) {
  const toneStyles: Record<string, string> = {
    default: 'bg-ink-100 text-ink-600',
    warning: 'bg-amber-50 text-amber-600',
    danger: 'bg-rose-50 text-rose-600',
    brand: 'bg-brand-50 text-brand-600',
  }
  return (
    <div className={cn('rounded-2xl bg-white p-5 ring-1 ring-ink-200/70 shadow-sm shadow-ink-900/[0.02]', className)}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-ink-500">{label}</span>
        <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', toneStyles[tone])}>{icon}</span>
      </div>
      <div className="mt-3 font-display text-2xl font-bold text-ink-900 tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-500">{hint}</div>}
    </div>
  )
}
