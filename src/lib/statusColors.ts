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
  switch (color) {
    case 'blue':   return 'bg-blue-500 text-white'
    case 'yellow': return 'bg-yellow-500 text-black'
    case 'green':  return 'bg-green-500 text-white'
    case 'gray':   return 'bg-gray-500 text-white'
    case 'red':    return 'bg-red-500 text-white'
    case 'orange': return 'bg-orange-500 text-white'
    default:       return 'bg-gray-500 text-white'
  }
}

/** Tailwind bg-only classes (for status dots and similar). */
export function statusColorDotClass(color: ShipmentStatus['color']): string {
  switch (color) {
    case 'blue':   return 'bg-blue-500'
    case 'yellow': return 'bg-yellow-500'
    case 'green':  return 'bg-green-500'
    case 'gray':   return 'bg-gray-500'
    case 'red':    return 'bg-red-500'
    case 'orange': return 'bg-orange-500'
    default:       return 'bg-gray-500'
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
