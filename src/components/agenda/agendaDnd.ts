/**
 * agendaDnd.ts — Pure helpers for Agenda drag-and-drop logic (week view).
 *
 * Kept free of React/DOM imports so the logic can be unit-tested without
 * a browser environment.
 */

import type { CalendarEvent } from '@/lib/agendaTypes'
import type { ParsedShipment, OperativasRecord } from '@/lib/shipmentTypes'

// ─── Types ────────────────────────────────────────────────────────────────

export interface DropPatchResult {
  dbId: string
  fields: { operativas: OperativasRecord[] }
}

/**
 * Signature of `buildPatchedOperativas` (exported from ContainerQuickEdit).
 * Injected so this module stays free of UI imports and can be tested with
 * a stub in unit tests.
 */
export type BuildPatchedOperativasFn = (
  shipment: ParsedShipment,
  cntr: string,
  patch: Partial<Pick<OperativasRecord, 'SALIDA' | 'ETA_FISC' | 'LUGAR_SALIDA'>>
) => OperativasRecord[]

// ─── Core pure function ───────────────────────────────────────────────────

/**
 * Given a dragged CalendarEvent and the target dateKey ("YYYY-MM-DD"),
 * returns the patch to apply via onPatchShipment — or null when the drop
 * should be a no-op (wrong type, missing data, same day).
 *
 * Only 'salida' and 'eta_fisc' events are movable; all others are read-only.
 */
export function dropPatch(
  event: CalendarEvent | undefined,
  newDate: string | undefined,
  buildPatchedOperativas: BuildPatchedOperativasFn
): DropPatchResult | null {
  // Guard: must have event + target date
  if (!event || !newDate) return null

  // Guard: only salida / eta_fisc are draggable date fields
  if (event.type !== 'salida' && event.type !== 'eta_fisc') return null

  // Guard: must be backed by a DB row
  const dbId = event.shipment?.__dbId
  if (!dbId) return null

  // Guard: must have a container identifier to patch the right operativas row
  if (!event.cntr) return null

  // No-op: dropped on the same day
  if (newDate === event.date) return null

  const field = event.type === 'salida' ? 'SALIDA' : 'ETA_FISC'
  const operativas = buildPatchedOperativas(event.shipment, event.cntr, { [field]: newDate })

  return { dbId, fields: { operativas } }
}
