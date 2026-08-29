/**
 * Central source of truth for status & urgency colors.
 *
 * Avoids the anti-pattern of hardcoded `bg-red-500`, `bg-orange-500`, etc.
 * scattered across components. Add colors here once; components reference the
 * helpers below.
 *
 * Design intent: keep utility-class strings literal (so Tailwind's JIT picks
 * them up) but centralize the selection logic.
 */

import type { ShipmentStatus } from './shipmentTypes'

/** Tailwind bg+text classes for a shipment-status color. */
export function statusColorToClass(color: ShipmentStatus['color']): string {
  // Variables por marca (src/index.css): bajo TWF los llenos de siempre,
  // bajo Mediterránea las pills suaves del sistema.
  switch (color) {
    case 'blue':   return 'bg-[var(--st-blue-bg)] text-[var(--st-blue-fg)]'
    case 'yellow': return 'bg-[var(--st-yellow-bg)] text-[var(--st-yellow-fg)]'
    case 'green':  return 'bg-[var(--st-green-bg)] text-[var(--st-green-fg)]'
    case 'gray':   return 'bg-[var(--st-gray-bg)] text-[var(--st-gray-fg)]'
    case 'red':    return 'bg-[var(--st-red-bg)] text-[var(--st-red-fg)]'
    case 'orange': return 'bg-[var(--st-orange-bg)] text-[var(--st-orange-fg)]'
    default:       return 'bg-[var(--st-gray-bg)] text-[var(--st-gray-fg)]'
  }
}

/** Tailwind bg-only classes (for status dots and similar). */
export function statusColorDotClass(color: ShipmentStatus['color']): string {
  switch (color) {
    case 'blue':   return 'bg-[var(--st-blue-bg)]'
    case 'yellow': return 'bg-[var(--st-yellow-bg)]'
    case 'green':  return 'bg-[var(--st-green-bg)]'
    case 'gray':   return 'bg-[var(--st-gray-bg)]'
    case 'red':    return 'bg-[var(--st-red-bg)]'
    case 'orange': return 'bg-[var(--st-orange-bg)]'
    default:       return 'bg-[var(--st-gray-bg)]'
  }
}

// ─── Urgency (days-until-free) ─────────────────────────────────────
export type UrgencyLevel = 'overdue' | 'urgent' | 'upcoming' | 'ok'

export interface UrgencyMeta {
  level: UrgencyLevel
  label: string
  badgeClass: string
}

/** Classify a LIBRE (days-until-free) value into urgency levels with labels+colors. */
export function getUrgencyMeta(days: number): UrgencyMeta {
  if (days < 0) {
    return { level: 'overdue', label: 'Vencido', badgeClass: 'bg-red-500 text-white' }
  }
  if (days <= 2) {
    return { level: 'urgent', label: 'Urgente', badgeClass: 'bg-orange-500 text-white' }
  }
  if (days <= 5) {
    return { level: 'upcoming', label: 'Próximo', badgeClass: 'bg-yellow-500 text-black' }
  }
  return { level: 'ok', label: 'A tiempo', badgeClass: 'bg-green-500 text-white' }
}
