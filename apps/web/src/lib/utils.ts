import { clsx, type ClassValue } from 'clsx'
import type { StockStatus, Transfer } from '../types'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

/**
 * The one customer-facing identifier for a transfer, anywhere in the UI.
 * Before dispatch a delivery has no identity of its own yet (dcNumber is
 * null until dispatch() assigns it), so the order it belongs to (ocNumber)
 * is what's shown instead — never the internal TR- code. Mirrors the same
 * OC-fallback-before-dispatch rule used for activity log messages
 * server-side (see transfers.service.ts).
 */
export function transferDocNumber(t: Pick<Transfer, 'dcNumber' | 'request'>): string {
  return t.dcNumber ?? t.request?.ocNumber ?? '—'
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat('en-IE').format(value)
}

export function formatQty(value: number, unit: string) {
  return `${formatNumber(value)} ${unit}${value === 1 ? '' : unit === 'kg' || unit === 'liter' ? '' : 's'}`
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function stockStatus(qty: number, minStock: number): StockStatus {
  if (qty <= 0) return 'out'
  if (qty < minStock) return 'low'
  return 'healthy'
}

export const STATUS_STYLES: Record<StockStatus, { label: string; dot: string; badge: string }> = {
  healthy: { label: 'Healthy', dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
  low: { label: 'Low Stock', dot: 'bg-amber-500', badge: 'bg-amber-50 text-amber-700 ring-amber-600/20' },
  out: { label: 'Out of Stock', dot: 'bg-rose-500', badge: 'bg-rose-50 text-rose-700 ring-rose-600/20' },
}

export function branchHealth(lowCount: number, outCount: number): StockStatus {
  const total = lowCount + outCount
  if (total >= 3) return 'out'
  if (total >= 1) return 'low'
  return 'healthy'
}

export const BRANCH_HEALTH_STYLES: Record<StockStatus, { label: string; badge: string }> = {
  healthy: { label: 'Healthy', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
  low: { label: 'Attention', badge: 'bg-amber-50 text-amber-700 ring-amber-600/20' },
  out: { label: 'Low Stock', badge: 'bg-rose-50 text-rose-700 ring-rose-600/20' },
}
