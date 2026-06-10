// ─── Truck / Consolidation Types ──────────────────────────────────────
// Models for the truck builder: consolidated trucks, their loads (FCL/LCL/Air)
// and the standalone LCL/Air shipments registry.
// ──────────────────────────────────────────────────────────────────────

export type TruckStatus = 'planning' | 'loaded' | 'in_transit' | 'delivered'
export type LoadSource = 'fcl' | 'lcl' | 'air'
export type LclAirModality = 'lcl' | 'air'
export type LclAirStatus =
  | 'en_origen'
  | 'en_transito'
  | 'arribado'
  | 'desconsolidado'
  | 'despachado'

// ── Truck capacity limits (alert thresholds) ──
// Brian's rules: standard truck warns over 26.500 kg / 62 m³, sider
// can carry more volume (80 m³) but less weight (24.500 kg).
export const TRUCK_LIMITS = {
  standard: { kgMax: 26500, m3Max: 62 },
  sider:    { kgMax: 24500, m3Max: 80 },
} as const

// ── Truck ──
export interface Truck {
  id: string
  code: string                      // C430, C431, ...
  status: TruckStatus
  isSider: boolean
  transport: string
  driver: string
  plate: string
  loadDate: string                  // YYYY-MM-DD
  departureDate: string
  arrivalDate: string
  notes: string
  createdAt: number
  updatedAt: number
}

// ── A single load (ref) inside a truck ──
export interface TruckLoad {
  id: string
  truckId: string
  sourceType: LoadSource
  sourceRef: string                 // A7611, LCL-0042, AIR-0001
  client: string
  fiscal: string
  kg: number
  m3: number
  pkgs: number
  description: string
  mvdArrival: string                // YYYY-MM-DD
  desconsolDate: string
  overrides: Record<string, boolean>  // which fields were manually edited
  position: number
}

// ── LCL / Air registry entry (refs not in the FCL planilla) ──
export interface LclAirShipment {
  id: string
  ref: string                       // LCL-0001, AIR-0001
  modality: LclAirModality
  client: string
  origin: string
  mblHbl: string
  etaMvd: string
  desconsolDate: string
  pkgs: number
  kg: number
  m3: number
  fiscal: string
  description: string
  wood: boolean
  status: LclAirStatus
  notes: string
  createdAt: number
}

// ── Computed totals for a truck (used by builder + list cards) ──
export interface TruckTotals {
  kg: number
  m3: number
  pkgs: number
  loadCount: number
  fiscals: string[]                 // distinct fiscal destinations
  overKg: boolean                   // exceeds weight limit
  overM3: boolean                   // exceeds volume limit
  multifiscal: boolean              // >1 fiscal destination
  kgPct: number                     // 0..1+ relative to capacity
  m3Pct: number
}

export function getTruckLimits(isSider: boolean) {
  return isSider ? TRUCK_LIMITS.sider : TRUCK_LIMITS.standard
}

export function computeTruckTotals(truck: Truck, loads: TruckLoad[]): TruckTotals {
  const limits = getTruckLimits(truck.isSider)
  const kg = loads.reduce((sum, l) => sum + (l.kg || 0), 0)
  const m3 = loads.reduce((sum, l) => sum + (l.m3 || 0), 0)
  const pkgs = loads.reduce((sum, l) => sum + (l.pkgs || 0), 0)
  const fiscals = Array.from(
    new Set(loads.map(l => (l.fiscal || '').trim().toUpperCase()).filter(Boolean))
  )
  return {
    kg,
    m3,
    pkgs,
    loadCount: loads.length,
    fiscals,
    overKg: kg > limits.kgMax,
    overM3: m3 > limits.m3Max,
    multifiscal: fiscals.length > 1,
    kgPct: limits.kgMax > 0 ? kg / limits.kgMax : 0,
    m3Pct: limits.m3Max > 0 ? m3 / limits.m3Max : 0,
  }
}

export const TRUCK_STATUS_LABELS: Record<TruckStatus, string> = {
  planning: 'Planificando',
  loaded: 'Cargado',
  in_transit: 'En Ruta',
  delivered: 'Entregado',
}

// ── Estado AUTOMÁTICO del camión (derive-on-read) ──
// Las fechas mandan, igual que con sus cargas: pasó el arribo → Entregado ·
// pasó la salida → En Ruta · pasó la carga → Cargado · si no, el estado
// manual. Los botones de estado quedan como atajo que completa la fecha.
// IMPORTANTE: misma precedencia que deriveTruckCargoStatus (operationsTypes).
export function deriveTruckDisplayStatus(t: Truck, today: Date): TruckStatus {
  const reached = (s?: string) => {
    if (!s) return false
    const p = s.split('-')
    if (p.length !== 3) return false
    const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]))
    return !isNaN(d.getTime()) && d.getTime() <= today.getTime()
  }
  if (reached(t.arrivalDate) || t.status === 'delivered') return 'delivered'
  if (reached(t.departureDate) || t.status === 'in_transit') return 'in_transit'
  if (reached(t.loadDate) || t.status === 'loaded') return 'loaded'
  return t.status
}

/** Etiqueta FINA del estado derivado — mismo lenguaje que las cargas:
 *  carga HOY → "Carga HOY" · salida HOY → "Sale HOY" · salida pasada →
 *  "En Frontera" · arribo HOY → "Llega a Fiscal HOY" · arribo pasado →
 *  "Entregado". El status (4 valores) queda para filtros/colores. */
export function deriveTruckDisplayInfo(t: Truck, today: Date): { status: TruckStatus; label: string; hoy: boolean } {
  const status = deriveTruckDisplayStatus(t, today)
  const isToday = (s?: string) => {
    if (!s) return false
    const p = s.split('-')
    if (p.length !== 3) return false
    const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]))
    return !isNaN(d.getTime()) && d.getTime() === today.getTime()
  }
  if (status === 'delivered' && isToday(t.arrivalDate)) return { status, label: 'Llega a Fiscal HOY', hoy: true }
  if (status === 'in_transit' && isToday(t.departureDate)) return { status, label: 'Sale HOY', hoy: true }
  if (status === 'in_transit') return { status, label: 'En Frontera', hoy: false }
  if (status === 'loaded' && isToday(t.loadDate)) return { status, label: 'Carga HOY', hoy: true }
  return { status, label: TRUCK_STATUS_LABELS[status], hoy: false }
}

export const LCL_AIR_STATUS_LABELS: Record<LclAirStatus, string> = {
  en_origen: 'En Origen',
  en_transito: 'En Tránsito',
  arribado: 'Arribado',
  desconsolidado: 'Desconsolidado',
  despachado: 'Despachado',
}

export const TRUCK_STATUS_COLORS: Record<TruckStatus, string> = {
  planning: 'bg-slate-100 text-slate-700 border-slate-200',
  loaded: 'bg-amber-100 text-amber-800 border-amber-200',
  in_transit: 'bg-blue-100 text-blue-800 border-blue-200',
  delivered: 'bg-green-100 text-green-800 border-green-200',
}
