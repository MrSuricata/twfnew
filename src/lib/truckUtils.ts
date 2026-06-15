// ─── Truck builder helpers ──────────────────────────────────────────
// Pure utility functions for the truck consolidation module: id gen,
// number formatting, FCL ref pre-fill from the planilla, and lookup
// of which refs are already assigned to a truck.
// ────────────────────────────────────────────────────────────────────

import type { ParsedShipment } from './shipmentTypes'
import { parseLocalDate, isValidDate } from './shipmentTypes'
import type {
  Truck,
  TruckLoad,
  TruckStatus,
  LclAirShipment,
  LoadSource,
} from './truckTypes'
import { applyTruckPending } from './truckTypes'

// Generate a stable, unique id for new records.
export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

const KG_FMT = new Intl.NumberFormat('es-UY', { maximumFractionDigits: 0 })
const M3_FMT = new Intl.NumberFormat('es-UY', { maximumFractionDigits: 2 })
const PKG_FMT = new Intl.NumberFormat('es-UY', { maximumFractionDigits: 0 })

export function formatKg(n: number): string {
  if (!isFinite(n) || n === 0) return '0'
  return KG_FMT.format(n)
}

export function formatM3(n: number): string {
  if (!isFinite(n) || n === 0) return '0'
  return M3_FMT.format(n)
}

export function formatPkgs(n: number): string {
  if (!isFinite(n) || n === 0) return '0'
  return PKG_FMT.format(n)
}

/** Today at local midnight. */
export function todayLocal(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

/** Format a Date as YYYY-MM-DD using local time. */
export function toIsoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ── Pre-fill an FCL load from the planilla data ──
// Returns null if the ref is not found. Operativas can have multiple rows
// (split containers) — we collapse them: sum kg/m3/pkgs, take fiscal/desc
// from the first non-empty.
export interface FclPrefill {
  client: string
  fiscal: string
  kg: number
  m3: number
  pkgs: number
  description: string
  mvdArrival: string
  desconsolDate: string
}

export function prefillFclFromShipment(shipment: ParsedShipment): FclPrefill {
  const ops = shipment.operativas || []
  const kg = ops.reduce((s, o) => s + (Number(o.KG) || 0), 0) || 0
  const m3 = ops.reduce((s, o) => s + (Number(o.M3) || 0), 0) || 0
  const pkgs = ops.reduce((s, o) => s + (Number(o.PKGS) || 0), 0) || 0
  const firstWith = <K extends keyof typeof ops[number]>(key: K): string =>
    (ops.find(o => o[key])?.[key] as string) || ''
  return {
    client: shipment.CLIENTE || ops[0]?.CLIENTE_OP || '',
    fiscal: firstWith('FISCAL'),
    kg,
    m3,
    pkgs,
    description: firstWith('DESCRIPCION'),
    // ETA Mvd = ETA of the shipment (port arrival). SALIDA op = departure from MVD.
    mvdArrival: shipment.ETA || '',
    // For TRASIEGO/DESCONS, DESCARGA is the depot processing date.
    desconsolDate: firstWith('DESCARGA') || firstWith('SALIDA'),
  }
}

/** Compute a set of refs that are already inside any non-delivered truck. */
export function getAssignedRefs(loads: TruckLoad[], trucks: Truck[]): Set<string> {
  const activeTruckIds = new Set(
    trucks.filter(t => t.status !== 'delivered').map(t => t.id)
  )
  const out = new Set<string>()
  for (const l of loads) {
    if (activeTruckIds.has(l.truckId)) out.add(l.sourceRef)
  }
  return out
}

/** Filter: a shipment is "available for truck assignment" when:
 *   - it has at least one operativa (real cargo, not just a placeholder)
 *   - it is not already in an active truck
 *   - it has either arrived to MVD already (ETA reached) OR is < N days away
 *   - if showArchived=false, hide refs whose SALIDA was > 7 days ago
 */
export interface AvailabilityOptions {
  showArchived?: boolean
  maxDaysAheadEta?: number
}

export function isFclAvailable(
  shipment: ParsedShipment,
  assignedRefs: Set<string>,
  opts: AvailabilityOptions = {}
): boolean {
  const { showArchived = false, maxDaysAheadEta = 30 } = opts
  if (!shipment.REF) return false
  if (assignedRefs.has(shipment.REF)) return false
  const ops = shipment.operativas || []
  if (ops.length === 0) return false

  const now = todayLocal()

  // Hide refs whose SALIDA was > 7 days ago (already despachado)
  if (!showArchived) {
    const allSalidaOld = ops.length > 0 && ops.every(o => {
      if (!isValidDate(o.SALIDA)) return false
      const d = parseLocalDate(o.SALIDA)
      if (!d) return false
      const ageDays = (now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000)
      return ageDays > 7
    })
    if (allSalidaOld) return false
  }

  // Hide ETA way too far in the future (configurable)
  if (shipment.ETA) {
    const eta = parseLocalDate(shipment.ETA)
    if (eta) {
      const daysAhead = (eta.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
      if (daysAhead > maxDaysAheadEta) return false
    }
  }

  return true
}

export function isLclAirAvailable(
  s: LclAirShipment,
  assignedRefs: Set<string>,
  opts: AvailabilityOptions = {}
): boolean {
  const { showArchived = false } = opts
  if (assignedRefs.has(s.ref)) return false
  if (!showArchived && s.status === 'despachado') return false
  return true
}

// ── Truck "freshness" — how stale the data is.
// Used as a soft alert: if a truck is in 'loaded' but no SALIDA, or 'in_transit' but no
// arrival date and load_date > 14 days old, surface a warning.
export function getTruckHealthIssues(t: Truck, loads: TruckLoad[]): string[] {
  const issues: string[] = []
  const today = todayLocal()

  if (t.status === 'loaded' && !t.departureDate) {
    issues.push('Marcado como cargado pero sin fecha de salida')
  }
  if (t.status === 'in_transit' && !t.departureDate) {
    issues.push('Marcado en ruta pero sin fecha de salida')
  }
  if (t.status === 'delivered' && !t.arrivalDate) {
    issues.push('Marcado como entregado pero sin fecha de arribo')
  }
  // Departure before load
  if (t.loadDate && t.departureDate) {
    const ld = parseLocalDate(t.loadDate)
    const dd = parseLocalDate(t.departureDate)
    if (ld && dd && dd.getTime() < ld.getTime()) {
      issues.push('Fecha de salida anterior a la carga')
    }
  }
  // Loads scheduled before arriving to MVD
  if (t.status !== 'planning' && t.loadDate) {
    const ld = parseLocalDate(t.loadDate)
    if (ld) {
      for (const l of loads) {
        if (l.mvdArrival) {
          const ma = parseLocalDate(l.mvdArrival)
          if (ma && ma.getTime() > ld.getTime()) {
            issues.push(`${l.sourceRef}: llega a MVD después de la fecha de carga`)
          }
        }
      }
    }
  }
  // Stale in_transit (in transit > 14d without arrival)
  if (t.status === 'in_transit' && t.departureDate) {
    const dd = parseLocalDate(t.departureDate)
    if (dd) {
      const days = (today.getTime() - dd.getTime()) / (24 * 60 * 60 * 1000)
      if (days > 14) issues.push('En ruta hace más de 14 días sin marcar arribo')
    }
  }
  return issues
}

/** A new empty truck (not yet persisted). Caller assigns the code via nextTruckCode(). */
export function makeEmptyTruck(code: string): Truck {
  const now = Date.now()
  return {
    id: newId('truck'),
    code,
    status: 'planning',
    isSider: false,
    transport: '',
    driver: '',
    plate: '',
    loadDate: '',
    departureDate: '',
    arrivalDate: '',
    notes: '',
    draft: true,
    pendingEdits: null,
    costDespacho: 0,
    costFlete: 0,
    costCarga: 0,
    createdAt: now,
    updatedAt: now,
  }
}

/** A new empty load from a generic source. */
export function makeEmptyTruckLoad(
  truckId: string,
  sourceType: LoadSource,
  sourceRef: string,
  position: number
): TruckLoad {
  return {
    id: newId('load'),
    truckId,
    sourceType,
    sourceRef,
    client: '',
    fiscal: '',
    kg: 0,
    m3: 0,
    pkgs: 0,
    description: '',
    mvdArrival: '',
    desconsolDate: '',
    overrides: {},
    position,
    pending: null,
  }
}

/** Cancelar el overlay de un camión publicado: limpia pendingEdits, saca las
 *  cargas 'add' (van a deleteLoadIds para borrar en DB) y des-marca las 'remove'.
 *  Pura: devuelve los arrays nuevos, el caller persiste.
 *  changedLoadIds: ids de filas que cambiaron de estado (pending 'remove' → null).
 *  Las filas 'add' van a deleteLoadIds y NO deben incluirse en changedLoadIds. */
export function discardPendingArrays(
  trucks: Truck[],
  loads: TruckLoad[],
  truckId: string
): { trucks: Truck[]; loads: TruckLoad[]; deleteLoadIds: string[]; changedLoadIds: string[] } {
  const deleteLoadIds = loads.filter(l => l.truckId === truckId && l.pending === 'add').map(l => l.id)
  const changedLoadIds = loads.filter(l => l.truckId === truckId && l.pending === 'remove').map(l => l.id)
  return {
    trucks: trucks.map(t => (t.id === truckId ? { ...t, pendingEdits: null, updatedAt: Date.now() } : t)),
    loads: loads
      .filter(l => !(l.truckId === truckId && l.pending === 'add'))
      .map(l => (l.truckId === truckId && l.pending === 'remove' ? { ...l, pending: null } : l)),
    deleteLoadIds,
    changedLoadIds,
  }
}

/** Guardar los cambios de un camión publicado: aplica el overlay, confirma las
 *  cargas 'add' y saca las 'remove' (a deleteLoadIds). Pura: el caller debe
 *  ejecutar los deletes PRIMERO y persistir el array de loads DESPUÉS (último
 *  setState gana → estado local determinístico, y el POST ya no contiene las
 *  filas borradas → sin resurrección por carrera con los DELETE).
 *  changedLoadIds: ids de filas que cambiaron de estado (pending 'add' → null).
 *  Las filas 'remove' van a deleteLoadIds y NO deben incluirse en changedLoadIds. */
export function commitPendingArrays(
  trucks: Truck[],
  loads: TruckLoad[],
  truckId: string
): { trucks: Truck[]; loads: TruckLoad[]; deleteLoadIds: string[]; changedLoadIds: string[] } {
  const deleteLoadIds = loads.filter(l => l.truckId === truckId && l.pending === 'remove').map(l => l.id)
  const changedLoadIds = loads.filter(l => l.truckId === truckId && l.pending === 'add').map(l => l.id)
  return {
    trucks: trucks.map(t => {
      if (t.id !== truckId) return t
      const merged = applyTruckPending(t)
      return { ...merged, pendingEdits: null, updatedAt: Date.now() }
    }),
    loads: loads
      .filter(l => !(l.truckId === truckId && l.pending === 'remove'))
      .map(l => (l.truckId === truckId && l.pending === 'add' ? { ...l, pending: null } : l)),
    deleteLoadIds,
    changedLoadIds,
  }
}

/** Cycle through possible next statuses for the lifecycle stepper. */
export const TRUCK_STATUS_ORDER: TruckStatus[] = ['planning', 'loaded', 'in_transit', 'delivered']
