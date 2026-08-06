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

// ── Campos editables del camión (usados en el overlay pendingEdits) ──
export interface TruckEditableFields {
  code: string
  status: TruckStatus
  isSider: boolean
  transport: string
  driver: string
  plate: string
  loadDate: string
  departureDate: string
  arrivalDate: string
  notes: string
  costDespacho: number
  costFlete: number
  costCarga: number
}

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
  // Borradores (12/06/2026): draft = camión nuevo sin publicar (invisible para
  // estados/agenda/HOY/facturación/tracking; solo reserva cargas).
  draft: boolean
  // Overlay de cambios sin guardar sobre un camión PUBLICADO (patrón web_edits).
  pendingEdits: Partial<TruckEditableFields> | null
  // Costos del flete (USD) → indicador USD/m³ con semáforo.
  costDespacho: number
  costFlete: number
  costCarga: number
  createdAt: number
  updatedAt: number
}

// ── A single load (ref) inside a truck ──
export interface TruckLoad {
  id: string
  truckId: string
  sourceType: LoadSource
  sourceRef: string                 // A7611, LCL-0042, AIR-0001
  /** Contenedor de esa carga que viaja en ESTE camión. Vacío = la referencia
   *  entera (LCL/aéreo, o línea anterior a 08/2026). Una carga FCL con varios
   *  contenedores entra como una línea por contenedor: el camión lleva uno. */
  cntr: string
  client: string
  fiscal: string
  kg: number
  m3: number
  pkgs: number
  description: string
  mvdArrival: string                // YYYY-MM-DD (interno: validación llegada<carga; no se muestra en el armador)
  desconsolDate: string             // YYYY-MM-DD (interno; ya no se muestra en el armador)
  bl: string                        // Nº de BL/conocimiento (autocompleta del MBL/HBL de la carga)
  stock: string                     // Nº/referencia de stock del depósito (manual)
  wood: boolean                     // ¿Lleva madera? (autocompleta del WOOD de la operativa)
  overrides: Record<string, boolean>  // which fields were manually edited
  position: number
  // 'add' = agregada en un borrador de edición · 'remove' = marcada para quitar
  // · null = confirmada. Solo aplica a camiones publicados con cambios sin guardar.
  pending: 'add' | 'remove' | null
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

// ── Borradores y costos (12/06/2026) ──────────────────────────────────────────

/** Lo que ve el ARMADOR: el camión con sus cambios sin guardar encima.
 *  Las derivaciones (agenda, estados, tracking) NUNCA llaman esto. */
export function applyTruckPending(t: Truck): Truck {
  if (!t.pendingEdits || Object.keys(t.pendingEdits).length === 0) return t
  return { ...t, ...t.pendingEdits }
}

/** Cargas de un camión según quién pregunta:
 *  - includePending=false (derivaciones): confirmadas + pending='remove'
 *    (siguen siendo del camión hasta guardar); las 'add' NO existen aún.
 *  - includePending=true (armador): confirmadas + 'add', sin las 'remove'. */
export function effectiveTruckLoads(
  loads: TruckLoad[],
  truckId: string,
  opts: { includePending: boolean }
): TruckLoad[] {
  const mine = loads.filter(l => l.truckId === truckId)
  return opts.includePending
    ? mine.filter(l => l.pending !== 'remove')
    : mine.filter(l => l.pending !== 'add')
}

/** Estado de borrador para badges: 'draft' (nuevo sin publicar) ·
 *  'pending' (publicado con cambios sin guardar) · null (limpio). */
export function hasDraftState(t: Truck, loads: TruckLoad[]): 'draft' | 'pending' | null {
  if (t.draft) return 'draft'
  if (t.pendingEdits && Object.keys(t.pendingEdits).length > 0) return 'pending'
  if (loads.some(l => l.truckId === t.id && l.pending)) return 'pending'
  return null
}

/** (despacho + flete + carga) / m³ del camión COMO SE ESTÁ ARMANDO.
 *  perM3 null si no hay m³ o no hay costos (no se muestra semáforo). */
export function truckCostPerM3(
  t: Truck,
  loads: TruckLoad[]
): { total: number; m3: number; perM3: number | null } {
  const merged = applyTruckPending(t)
  const ls = effectiveTruckLoads(loads, t.id, { includePending: true })
  const m3 = ls.reduce((a, l) => a + (l.m3 || 0), 0)
  const total = (merged.costDespacho || 0) + (merged.costFlete || 0) + (merged.costCarga || 0)
  return { total, m3, perM3: m3 > 0 && total > 0 ? total / m3 : null }
}

/** Semáforo del costo por m³ (decisión Brian 12/06): <75 verde ·
 *  75–80 amarillo (bordes incluidos) · >80 rojo. */
export function costColor(perM3: number): 'green' | 'yellow' | 'red' {
  if (perM3 > 80) return 'red'
  if (perM3 >= 75) return 'yellow'
  return 'green'
}

/** Clases Tailwind para el chip/indicador de costo por m³. */
export const COST_STYLES: Record<'green' | 'yellow' | 'red', string> = {
  green: 'bg-green-50 border-green-300 text-green-700',
  yellow: 'bg-amber-50 border-amber-300 text-amber-700',
  red: 'bg-red-50 border-red-300 text-red-700',
}

/**
 * REFs (normalizadas) que ya viajan en un camión consolidado PUBLICADO.
 *
 * Una carga subida a un consolidado ya está coordinada: se mueve con el camión,
 * no necesita salida propia. Sirve para sacarla de las listas de "pendiente de
 * coordinar" (agenda, HOY, mail de previsión) — antes seguía apareciendo ahí
 * porque la fecha la tiene el camión y no la carga (Brian 06/08: A7887, A7849,
 * A7758 B).
 *
 * Los camiones BORRADOR no cuentan: son una reserva, la carga sigue necesitando
 * coordinación real.
 */
export function refsEnConsolidado(trucks: Truck[], loads: TruckLoad[]): Set<string> {
  const publicados = new Set(trucks.filter(t => t && !t.draft).map(t => t.id))
  const out = new Set<string>()
  for (const l of loads) {
    if (!l || !publicados.has(l.truckId) || l.pending === 'add') continue
    const ref = String(l.sourceRef || '').trim().toUpperCase()
    if (ref) out.add(ref)
  }
  return out
}
