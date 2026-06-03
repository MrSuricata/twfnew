// ─── Billing overlay types & logic ───────────────────────────────────
// Facturación is a SEPARATE axis from the operative status (like the
// CR/BL/AD/AT checks). A shipment becomes "pendiente de facturar" once
// its LAST container/part has arrived to fiscal — and STAYS billable
// even after the empty container is returned (devuelto).
//
// Persistence is an overlay table `shipment_billing` (ref PK) cross-
// referenced against the FCL cache by ref. No row exists until the user
// marks something, so "pendiente" is DERIVED, not pre-seeded.
// ──────────────────────────────────────────────────────────────────────

import type { ParsedShipment } from './shipmentTypes'
import { parseLocalDate, isValidDate, isDatePast, isDateToday } from './shipmentTypes'

export type BillingStatus = 'pendiente' | 'facturada' | 'no_aplica'

/** Overlay row persisted in `shipment_billing`. */
export interface BillingRecord {
  ref: string
  status: BillingStatus
  invoiceNumber: string
  invoicedAt: string | null    // ISO timestamp, set when status=facturada
  invoicedBy: string
  updatedAt: string
}

/** Derived state of a shipment on the billing axis.
 *  `null` = not billable yet (hasn't reached fiscal, no explicit row). */
export type DerivedBillingState = BillingStatus | null

/** Days-pending threshold after which a pending bill shows red (aging). */
export const AGING_THRESHOLD_DAYS = 15

/** A date string is "reached" when it's a valid date that is today or past. */
function isDateReached(s: string): boolean {
  return isValidDate(s) && (isDatePast(s) || isDateToday(s))
}

/**
 * Monotonic predicate: true once EVERY part of the reference has both
 * SALIDA and ETA_FISC reached. Mirrors the `llego_fiscal` rule in
 * getShipmentStatus(), but unlike the operative status it does NOT flip
 * back when the container is returned — so a ref that arrived to fiscal
 * and then devolved still counts as billable.
 *
 * This is the trigger for "pendiente de facturar".
 */
export function hasReachedFiscal(shipment: ParsedShipment): boolean {
  const ops = shipment.operativas || []
  if (ops.length === 0) return false
  return ops.every(o => isDateReached(o.SALIDA) && isDateReached(o.ETA_FISC))
}

/**
 * Resolve the billing state for a shipment given the overlay map.
 * Priority: explicit facturada / no_aplica row wins; otherwise derive
 * pendiente from hasReachedFiscal; otherwise null (not billable yet).
 */
export function getBillingState(
  shipment: ParsedShipment,
  billingByRef: Map<string, BillingRecord>
): DerivedBillingState {
  const rec = billingByRef.get(shipment.REF)
  if (rec?.status === 'facturada') return 'facturada'
  if (rec?.status === 'no_aplica') return 'no_aplica'
  if (hasReachedFiscal(shipment)) return 'pendiente'
  return null
}

/** The latest ETA_FISC across all parts (when the ref fully reached fiscal). */
export function getFiscalArrivalDate(shipment: ParsedShipment): Date | null {
  const ops = shipment.operativas || []
  let latest: Date | null = null
  for (const o of ops) {
    const d = parseLocalDate(o.ETA_FISC)
    if (d && (!latest || d > latest)) latest = d
  }
  return latest
}

/** Days since the ref reached fiscal (aging). 0 if unknown. */
export function getDaysPending(shipment: ParsedShipment): number {
  const arrival = getFiscalArrivalDate(shipment)
  if (!arrival) return 0
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.floor((today.getTime() - arrival.getTime()) / 86_400_000)
  return diff > 0 ? diff : 0
}

/** Build a fast lookup map from a list of billing rows. */
export function indexBilling(rows: BillingRecord[]): Map<string, BillingRecord> {
  const m = new Map<string, BillingRecord>()
  for (const r of rows) m.set(r.ref, r)
  return m
}

export const BILLING_STATUS_LABELS: Record<BillingStatus, string> = {
  pendiente: 'Pendiente',
  facturada: 'Facturada',
  no_aplica: 'No aplica',
}

/** Is the given month/year the current one? (for "Facturadas este mes"). */
export function isInvoicedThisMonth(invoicedAt: string | null): boolean {
  if (!invoicedAt) return false
  const d = new Date(invoicedAt)
  if (isNaN(d.getTime())) return false
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
}
