// Agregaciones puras para la pestaña Estadísticas. Operan sobre las mismas
// UnifiedOperation que la grilla (buildOperations) → números idénticos.
import type { UnifiedOperation, Modality } from './operationsTypes'
import { MODALITY_LABELS } from './operationsTypes'
import type { Truck, TruckLoad } from './truckTypes'

export type ModeFilter = 'all' | Modality
export type ZoneFilter = 'all' | 'UY' | 'AR' | 'CL' | 'OTRO'

// Acepta 'D/M/YYYY' (planilla) y 'YYYY-MM-DD' (web/DB) — mismo criterio que
// parseSegDate en operationsTypes.
export function parseAnyDate(s: string): Date | null {
  const t = (s || '').trim()
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t)
  if (m) return new Date(+m[1], +m[2] - 1, +m[3])
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(t)
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]
    return new Date(y, +m[2] - 1, +m[1])
  }
  return null
}

export function opYear(op: UnifiedOperation): number | null {
  const d = parseAnyDate(op.eta)
  return d ? d.getFullYear() : null
}

const ZONES = ['UY', 'AR', 'CL']
export function zoneOf(op: UnifiedOperation): 'UY' | 'AR' | 'CL' | 'OTRO' {
  return (ZONES.includes(op.pais) ? op.pais : 'OTRO') as 'UY' | 'AR' | 'CL' | 'OTRO'
}

export function filterOperations(
  ops: UnifiedOperation[],
  year: number,
  mode: ModeFilter,
  zone: ZoneFilter
): UnifiedOperation[] {
  return ops.filter(op => {
    if (opYear(op) !== year) return false
    if (mode !== 'all' && op.mode !== mode) return false
    if (zone !== 'all' && zoneOf(op) !== zone) return false
    return true
  })
}

export interface GeneralKpis {
  cargas: number
  contenedores: number       // suma de n (FCL); 0 si el filtro no incluye FCL
  transitoPromedio: number   // días ETD→ETA, solo tránsitos plausibles (0<d<365)
  clientes: number
}

export function kpisGenerales(ops: UnifiedOperation[]): GeneralKpis {
  const transits: number[] = []
  for (const o of ops) {
    const etd = parseAnyDate(o.etd)
    const eta = parseAnyDate(o.eta)
    if (!etd || !eta) continue
    const days = Math.floor((eta.getTime() - etd.getTime()) / 86400000)
    if (days > 0 && days < 365) transits.push(days)
  }
  return {
    cargas: ops.length,
    contenedores: ops.reduce((a, o) => a + (o.n || 0), 0),
    transitoPromedio: transits.length
      ? Math.round(transits.reduce((a, b) => a + b, 0) / transits.length)
      : 0,
    clientes: new Set(ops.filter(o => o.cliente).map(o => o.cliente)).size,
  }
}

export interface Volumenes { pkgs: number; kg: number; m3: number }
export function volumenes(ops: UnifiedOperation[]): Volumenes {
  return {
    pkgs: ops.reduce((a, o) => a + (o.pkgs || 0), 0),
    kg: ops.reduce((a, o) => a + (o.kg || 0), 0),
    m3: ops.reduce((a, o) => a + (o.m3 || 0), 0),
  }
}

export interface NameValue { name: string; value: number }

function countBy(
  ops: UnifiedOperation[],
  key: (op: UnifiedOperation) => string,
  limit?: number
): NameValue[] {
  const counts: Record<string, number> = {}
  for (const o of ops) {
    const k = key(o)
    if (k) counts[k] = (counts[k] || 0) + 1
  }
  const out = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }))
  return limit ? out.slice(0, limit) : out
}

export const porModalidad = (ops: UnifiedOperation[]) =>
  countBy(ops, o => MODALITY_LABELS[o.mode] || o.mode)
export const porZona = (ops: UnifiedOperation[]) => countBy(ops, o => zoneOf(o))
export const topClientes = (ops: UnifiedOperation[]) => countBy(ops, o => o.cliente, 7)
export const porLinea = (ops: UnifiedOperation[]) => countBy(ops, o => o.linea, 6)
export const porTerminal = (ops: UnifiedOperation[]) => countBy(ops, o => o.terminal)
export const porOperativa = (ops: UnifiedOperation[]) => countBy(ops, o => o.operativa)
export const porTransporte = (ops: UnifiedOperation[]) => countBy(ops, o => o.transporte, 8)
export const porFiscal = (ops: UnifiedOperation[]) =>
  countBy(ops, o => (o.fiscal.length > 18 ? o.fiscal.slice(0, 18) + '…' : o.fiscal), 8)
export const porTipoContenedor = (ops: UnifiedOperation[]) =>
  countBy(ops.filter(o => o.mode === 'fcl'), o => o.tipo)

/** Cargas por mes de ETA. En el año en curso no muestra meses futuros
 *  (mismo criterio que el dashboard original). */
export function porMes(ops: UnifiedOperation[], now: Date): { month: string; cargas: number }[] {
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const counts: Record<string, number> = {}
  for (const o of ops) {
    const d = parseAnyDate(o.eta)
    if (!d) continue
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (key <= currentMonth) counts[key] = (counts[key] || 0) + 1
  }
  return Object.entries(counts)
    .sort()
    .slice(-12)
    .map(([month, cargas]) => ({
      month: new Date(month + '-01T00:00:00').toLocaleDateString('es-UY', { month: 'short' }),
      cargas,
    }))
}

// ── Consolidados (camiones) ── el año del camión es el de su fecha de carga
// (fallback: salida). Las fechas de camión son siempre 'YYYY-MM-DD'.
export function truckYear(t: Truck): number | null {
  const d = t.loadDate || t.departureDate
  if (!d) return null
  const y = parseInt(d.slice(0, 4), 10)
  return Number.isFinite(y) ? y : null
}

export interface ConsolidadosKpis {
  camiones: number
  kg: number
  m3: number
  pkgs: number
  cargasPorCamion: number
}

export function kpisConsolidados(trucks: Truck[], loads: TruckLoad[], year: number): ConsolidadosKpis {
  const ts = trucks.filter(t => truckYear(t) === year)
  const ids = new Set(ts.map(t => t.id))
  const ls = loads.filter(l => ids.has(l.truckId))
  return {
    camiones: ts.length,
    kg: ls.reduce((a, l) => a + (l.kg || 0), 0),
    m3: ls.reduce((a, l) => a + (l.m3 || 0), 0),
    pkgs: ls.reduce((a, l) => a + (l.pkgs || 0), 0),
    cargasPorCamion: ts.length ? Math.round((ls.length / ts.length) * 10) / 10 : 0,
  }
}

export function consolidadosPorMes(trucks: Truck[], year: number, now: Date): { month: string; camiones: number }[] {
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const counts: Record<string, number> = {}
  for (const t of trucks) {
    if (truckYear(t) !== year) continue
    const d = (t.loadDate || t.departureDate).slice(0, 7) // YYYY-MM
    if (d <= currentMonth) counts[d] = (counts[d] || 0) + 1
  }
  return Object.entries(counts)
    .sort()
    .slice(-12)
    .map(([month, camiones]) => ({
      month: new Date(month + '-01T00:00:00').toLocaleDateString('es-UY', { month: 'short' }),
      camiones,
    }))
}

export function volumenPorTransportista(trucks: Truck[], loads: TruckLoad[], year: number): NameValue[] {
  const ts = trucks.filter(t => truckYear(t) === year)
  const byId = new Map(ts.map(t => [t.id, t.transport || '—']))
  const kg: Record<string, number> = {}
  for (const l of loads) {
    const transport = byId.get(l.truckId)
    if (!transport) continue
    kg[transport] = (kg[transport] || 0) + (l.kg || 0)
  }
  return Object.entries(kg)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, value]) => ({ name, value }))
}
