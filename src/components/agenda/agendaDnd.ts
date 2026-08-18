/**
 * agendaDnd.ts — Pure helpers for Agenda drag-and-drop logic (week view).
 *
 * Kept free of React/DOM imports so the logic can be unit-tested without
 * a browser environment.
 */

import type { CalendarEvent } from '@/lib/agendaTypes'
import type { ParsedShipment, OperativasRecord } from '@/lib/shipmentTypes'
import type { Truck } from '@/lib/truckTypes'

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

  // cntr puede ser '' (carga SIN contenedor asignado — ej. alta web tipo
  // FCL-LATINART): buildPatchedOperativas matchea la operativa con CNTR_OP
  // vacío o la crea — mismo criterio que el click (quick-edit con cntr '').
  // Antes un guard `!event.cntr` hacía el drop un no-op SILENCIOSO y esas
  // cargas "no se dejaban mover" (bug 23/07).

  // No-op: dropped on the same day
  if (newDate === event.date) return null

  const field = event.type === 'salida' ? 'SALIDA' : 'ETA_FISC'
  const operativas = buildPatchedOperativas(event.shipment, event.cntr || '', { [field]: newDate })

  return { dbId, fields: { operativas } }
}

// ─── Camiones: mover carga/salida a otro día (pedido Brian 15/07) ────────

export interface TruckDropResult {
  truckId: string
  /** Campos CRUDOS del camión (la agenda NO lee pendingEdits — escribir el
   *  campo real para que el chip se mueva al soltar). */
  fields: Partial<Pick<Truck, 'loadDate' | 'departureDate'>>
}

/**
 * Drop de un evento de CAMIÓN (id `truck-${t.id}-${type}`) sobre otro día:
 *   carga (🟡) → loadDate · salida (🔵) → departureDate.
 * Coherencia de fechas:
 *   - si carga y salida eran el MISMO día (la agenda muestra un solo chip
 *     'salida'), se mueven las dos juntas;
 *   - mover la carga después de la salida arrastra la salida, y mover la
 *     salida antes de la carga arrastra la carga (nunca quedan cruzadas);
 *   - la salida NUNCA puede quedar después de la llegada → null (no-op,
 *     el caller avisa).
 * Devuelve null para todo lo que no aplica (no-camión, mismo día, draft…).
 */
export function dropPatchTruck(
  event: CalendarEvent | undefined,
  newDate: string | undefined,
  trucks: Truck[],
): TruckDropResult | null {
  if (!event || !newDate) return null
  if (!event.id.startsWith('truck-')) return null
  if (event.type !== 'carga' && event.type !== 'salida') return null
  if (newDate === event.date) return null
  // id = `truck-${t.id}-${type}` y t.id puede tener guiones → recortar por
  // los extremos, nunca split('-').
  const truckId = event.id.slice('truck-'.length, event.id.length - (event.type.length + 1))
  const truck = trucks.find(t => t.id === truckId)
  if (!truck || truck.draft) return null

  const fields: TruckDropResult['fields'] = {}
  if (event.type === 'carga') {
    fields.loadDate = newDate
    if (truck.departureDate && truck.departureDate < newDate) fields.departureDate = newDate
  } else {
    fields.departureDate = newDate
    if (truck.loadDate && (truck.loadDate === truck.departureDate || truck.loadDate > newDate)) {
      fields.loadDate = newDate
    }
  }
  const salidaFinal = fields.departureDate ?? truck.departureDate
  if (truck.arrivalDate && salidaFinal && salidaFinal > truck.arrivalDate) return null
  return { truckId, fields }
}
