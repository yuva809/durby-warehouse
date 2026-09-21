import { Check, Circle, ArrowRight, X } from 'lucide-react'
import { cn } from '../../lib/utils'

export type TimelineState = 'done' | 'current' | 'upcoming' | 'rejected'

export function TimelineRow({
  label,
  state,
  isLast,
}: {
  label: string
  state: TimelineState
  isLast?: boolean
}) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <span
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
            state === 'done' && 'bg-emerald-500 text-white',
            state === 'current' && 'bg-brand-500 text-white',
            state === 'upcoming' && 'bg-ink-100 text-ink-300',
            state === 'rejected' && 'bg-rose-500 text-white',
          )}
        >
          {state === 'done' ? (
            <Check size={13} />
          ) : state === 'current' ? (
            <ArrowRight size={13} />
          ) : state === 'rejected' ? (
            <X size={13} />
          ) : (
            <Circle size={8} fill="currentColor" />
          )}
        </span>
        {!isLast && (
          <span
            className={cn('w-px flex-1 min-h-[16px]', state === 'done' ? 'bg-emerald-300' : 'bg-ink-150')}
          />
        )}
      </div>
      <div
        className={cn(
          'pb-4 text-sm',
          state === 'upcoming' ? 'text-ink-400' : state === 'rejected' ? 'font-medium text-rose-600' : 'font-medium text-ink-800',
        )}
      >
        {label}
      </div>
    </div>
  )
}

export function Timeline({ steps }: { steps: { label: string; state: TimelineState }[] }) {
  return (
    <div className="space-y-0">
      {steps.map((step, i) => (
        <TimelineRow key={step.label} label={step.label} state={step.state} isLast={i === steps.length - 1} />
      ))}
    </div>
  )
}
