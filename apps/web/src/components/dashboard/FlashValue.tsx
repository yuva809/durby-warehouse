import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '../../lib/utils'

export function FlashValue({ value, className, render }: { value: number; className?: string; render: (v: number) => ReactNode }) {
  const prev = useRef(value)
  const [flash, setFlash] = useState(false)

  useEffect(() => {
    if (prev.current !== value) {
      setFlash(true)
      prev.current = value
      const t = setTimeout(() => setFlash(false), 1100)
      return () => clearTimeout(t)
    }
  }, [value])

  return <span className={cn(className, flash && 'animate-count-flash animate-pulse-once rounded-md px-1 -mx-1')}>{render(value)}</span>
}
