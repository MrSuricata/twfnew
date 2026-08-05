/**
 * "Today" filters — compute lists of shipments/operativas matching today's state.
 *
 * Used by:
 * - `TodayDashboard.tsx` admin quick-glance view (web)
 * - `api/notifications/[action].ts` daily Telegram summary (server)
 *
 * All date fields in the app are YYYY-MM-DD strings. Use `parseLocalDate` to avoid
 * timezone drift (Uruguay is UTC-3; naïve `new Date('2026-04-20')` shifts to April 19
 * 21:00 local).
 */

import {
  parseLocalDate,
  isDateToday,
  isDatePast,
  isValidDate,
  type ParsedShipment,
  type OperativasRecord,
} from './shipmentTypes'
import { type CheckStepKey, normalizeRef } from './checksTypes'
import type { Truck, TruckLoad } from './truckTypes'

/** A single operativa matched along with its parent shipment for context. */
export interface OpMatch {
  shipment: ParsedShipment
  op: OperativasRecord
}

/** Un camión consolidado con el resumen de lo que lleva, para mostrarlo como
 *  una tarjeta más dentro de las columnas de HOY. */
export interface TruckMatch {
  truck: Truck
  refs: string[]
  kg: number
  m3: number
}

/** Las 3 columnas de HOY. Cada una corresponde a un aviso del procedimiento
 *  operativo (mismo paso que vive en la pestaña Checks / tabla ref_checks). */
export type TodayColumn = 'salientes' | 'frontera' | 'llegandoFiscal'

/** Mapa columna de HOY → paso de ref_checks. El check "Aviso" de cada tarjeta
 *  marca EXACTAMENTE este paso (no un estado nuevo):
 *   - Saliendo hoy        → `aviso_salida`   (se avisó la SALIDA)
 *   - En frontera hoy     → `cruce_frontera` (se avisó el CRUCE de frontera)
 *   - Llegando a fiscal   → `arribo_fiscal`  (se avisó la LLEGADA a fiscal)
 *  Es una constante pura (sin estado) para poder testearla sola. */
export const AVISO_STEP_BY_COLUMN: Record<TodayColumn, CheckStepKey> = {
  salientes: 'aviso_salida',
  frontera: 'cruce_frontera',
  llegandoFiscal: 'arribo_fiscal',
}

/** Etiqueta corta del aviso por columna (para tooltips / accesibilidad). */
export const AVISO_LABEL_BY_COLUMN: Record<TodayColumn, string> = {
  salientes: 'Avisar salida',
  frontera: 'Avisar cruce de frontera',
  llegandoFiscal: 'Avisar arribo a fiscal',
}

/** Border-crossing estimation window: SALIDA was 1 or 2 days ago. */
const BORDER_DAYS_MIN = 1
const BORDER_DAYS_MAX = 2
const MS_PER_DAY = 86_400_000

function daysSince(dateStr: string): number | null {
  const d = parseLocalDate(dateStr)
  if (!d) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.floor((today.getTime() - d.getTime()) / MS_PER_DAY)
}

/**
 * Operativas whose SALIDA date is today.
 *
 * "Carga está saliendo de Uruguay hoy via camión."
 *
 * OJO: NO filtrar por LIBRE=DEVUELTO. "DEVUELTO" es un estado del CONTENEDOR (el
 * vacío ya se devolvió a la terminal), NO de la CARGA. En un TRASIEGO el
 * contenedor se devuelve apenas se trasborda la carga al camión, días ANTES de
 * que la carga cruce la frontera y llegue a fiscal. Estas cards siguen el
 * movimiento de la CARGA (salida → frontera → fiscal); el ciclo del contenedor
 * es independiente. El "ya terminó" lo maneja la lógica de ETA_FISC (si el
 * arribo fiscal ya pasó, no aparece).
 */
export function salientesHoy(shipments: ParsedShipment[], excluirRefs?: Set<string>): OpMatch[] {
  return shipments
    .filter(s => !enConsolidado(s, excluirRefs))
    .flatMap(s =>
      (s.operativas ?? [])
        .filter(op => isDateToday(op.SALIDA))
        .map(op => ({ shipment: s, op }))
    )
}

/**
 * Operativas estimated to be at the border today.
 *
 * There's no CRUCE_FRONTERA field in the data, so we derive: SALIDA was 1–2 days ago
 * AND cargo hasn't arrived at fiscal yet (ETA_FISC is today or in the future or empty).
 */
export function enFronteraHoy(shipments: ParsedShipment[], excluirRefs?: Set<string>): OpMatch[] {
  return shipments
    .filter(s => !enConsolidado(s, excluirRefs))
    .flatMap(s =>
    (s.operativas ?? [])
      .filter(op => {
        // NO filtrar por DEVUELTO: es estado del contenedor, no de la carga
        // (ver nota en salientesHoy). La carga sigue en frontera aunque el
        // contenedor vacío ya se haya devuelto.
        if (!isValidDate(op.SALIDA)) return false
        const days = daysSince(op.SALIDA)
        if (days === null) return false
        if (days < BORDER_DAYS_MIN || days > BORDER_DAYS_MAX) return false
        // Already arrived at fiscal? Skip.
        if (isValidDate(op.ETA_FISC) && isDatePast(op.ETA_FISC)) return false
        if (isDateToday(op.ETA_FISC)) return false
        return true
      })
      .map(op => ({ shipment: s, op }))
  )
}

/**
 * Operativas whose ETA_FISC date is today.
 *
 * "Carga llega al depósito fiscal de destino hoy."
 */
export function llegandoFiscalHoy(shipments: ParsedShipment[], excluirRefs?: Set<string>): OpMatch[] {
  return shipments
    .filter(s => !enConsolidado(s, excluirRefs))
    .flatMap(s =>
      (s.operativas ?? [])
        .filter(op => isDateToday(op.ETA_FISC))
        .map(op => ({ shipment: s, op }))
    )
}

/**
 * Shipments whose LIBRE_HASTA is today or already past (container incurring demurrage).
 * This is per-shipment, not per-operativa.
 */
export interface LibreAlert {
  shipment: ParsedShipment
  daysOverdue: number // 0 = today, positive = past, negative = upcoming
  severity: 'vencido' | 'hoy' | 'urgente' // vencido = past, hoy = today, urgente = 1-2 days
}

export function libreAlerts(shipments: ParsedShipment[]): LibreAlert[] {
  const out: LibreAlert[] = []
  for (const s of shipments) {
    const libre = s.LIBRE_HASTA || s.calculatedLibreHasta
    // Solo fechas ISO estrictas (YYYY-MM-DD). Evita que un LIBRE en texto libre
    // (ej. "2/7") se parsee suelto como 2001-02-07 → "vencido hace 9262d".
    // DEVUELTO / otros placeholders quedan ignorados (no son fecha de devolución).
    if (!libre || !/^\d{4}-\d{2}-\d{2}$/.test(libre.trim())) continue
    const days = daysSince(libre)
    if (days === null) continue
    if (days > 0) {
      out.push({ shipment: s, daysOverdue: days, severity: 'vencido' })
    } else if (days === 0) {
      out.push({ shipment: s, daysOverdue: 0, severity: 'hoy' })
    } else if (days >= -2) {
      out.push({ shipment: s, daysOverdue: days, severity: 'urgente' })
    }
  }
  // Sort: vencidos first (most overdue first), then hoy, then urgentes (closest to expiring first)
  return out.sort((a, b) => b.daysOverdue - a.daysOverdue)
}

// ─────────────────────────────────────────────────────────────────────────
// Consolidados
//
// Un camión consolidado se mueve como una unidad: sale, cruza y llega con
// TODAS sus cargas adentro. Por eso entra a las columnas de HOY como UNA
// tarjeta (la del camión) y sus cargas NO se listan por separado — verlas
// sueltas hacía parecer que había que coordinar cada una (Brian, 05/08).
//
// Las fechas del camión son DATOS, no estimaciones: a diferencia de las
// cargas sueltas (donde "en frontera" se estima con salió-hace-1-o-2-días),
// acá sabemos la salida y el arribo reales, así que la frontera es
// simplemente "ya salió y todavía no llegó".
// ─────────────────────────────────────────────────────────────────────────

/** Refs (normalizadas) que ya viajan en un camión publicado. Los borradores no
 *  cuentan: son reservas, la carga sigue necesitando coordinación. */
export function refsEnConsolidado(trucks: Truck[], loads: TruckLoad[]): Set<string> {
  const publicados = new Set(trucks.filter(t => t && !t.draft).map(t => t.id))
  const out = new Set<string>()
  for (const l of loads) {
    if (!l || !publicados.has(l.truckId) || l.pending === 'add') continue
    const ref = normalizeRef(l.sourceRef)
    if (ref) out.add(ref)
  }
  return out
}

/** ¿Esta carga viaja dentro de un consolidado? (entonces no va suelta en HOY) */
function enConsolidado(s: ParsedShipment, excluirRefs?: Set<string>): boolean {
  if (!excluirRefs || excluirRefs.size === 0) return false
  return excluirRefs.has(normalizeRef(s.REF))
}

function truckMatch(t: Truck, loads: TruckLoad[]): TruckMatch {
  const mias = loads.filter(l => l && l.truckId === t.id && l.pending !== 'add')
  return {
    truck: t,
    refs: mias.map(l => l.sourceRef).filter(Boolean),
    kg: mias.reduce((a, l) => a + (Number(l.kg) || 0), 0),
    m3: mias.reduce((a, l) => a + (Number(l.m3) || 0), 0),
  }
}

/** Camiones que salen HOY de Uruguay. Si no hay fecha de salida cargada se usa
 *  la de carga, que es cuando el camión efectivamente arranca. */
export function trucksSalientesHoy(trucks: Truck[], loads: TruckLoad[]): TruckMatch[] {
  return trucks
    .filter(t => t && !t.draft)
    .filter(t => !isDateToday(t.arrivalDate))   // si llega hoy, va en la otra columna
    .filter(t => isDateToday(t.departureDate) || (!isValidDate(t.departureDate) && isDateToday(t.loadDate)))
    .map(t => truckMatch(t, loads))
}

/** Camiones en frontera: ya salieron y todavía no llegaron a fiscal. */
export function trucksEnFronteraHoy(trucks: Truck[], loads: TruckLoad[]): TruckMatch[] {
  return trucks
    .filter(t => t && !t.draft)
    .filter(t => isValidDate(t.departureDate) && isDatePast(t.departureDate))
    .filter(t => !isValidDate(t.arrivalDate) || (!isDatePast(t.arrivalDate) && !isDateToday(t.arrivalDate)))
    .map(t => truckMatch(t, loads))
}

/** Camiones que llegan HOY al depósito fiscal de destino. */
export function trucksLlegandoFiscalHoy(trucks: Truck[], loads: TruckLoad[]): TruckMatch[] {
  return trucks
    .filter(t => t && !t.draft)
    .filter(t => isDateToday(t.arrivalDate))
    .map(t => truckMatch(t, loads))
}

/**
 * Aggregated today-view payload used by both the web dashboard and the Telegram summary.
 */
export interface TodaySnapshot {
  salientes: OpMatch[]
  frontera: OpMatch[]
  llegandoFiscal: OpMatch[]
  /** Consolidados que se mueven hoy, ya repartidos en las mismas 3 columnas. */
  trucksSalientes: TruckMatch[]
  trucksFrontera: TruckMatch[]
  trucksLlegandoFiscal: TruckMatch[]
  libreAlerts: LibreAlert[]
  totalCount: number
  hasMovement: boolean
}

export function buildTodaySnapshot(
  shipments: ParsedShipment[],
  trucks: Truck[] = [],
  truckLoads: TruckLoad[] = [],
): TodaySnapshot {
  // Las cargas que viajan en un consolidado se muestran una sola vez: dentro
  // de la tarjeta del camión.
  const enCamion = refsEnConsolidado(trucks, truckLoads)
  const salientes = salientesHoy(shipments, enCamion)
  const frontera = enFronteraHoy(shipments, enCamion)
  const llegandoFiscal = llegandoFiscalHoy(shipments, enCamion)
  const trucksSalientes = trucksSalientesHoy(trucks, truckLoads)
  const trucksFrontera = trucksEnFronteraHoy(trucks, truckLoads)
  const trucksLlegandoFiscal = trucksLlegandoFiscalHoy(trucks, truckLoads)
  const alerts = libreAlerts(shipments)
  const totalCount =
    salientes.length + frontera.length + llegandoFiscal.length +
    trucksSalientes.length + trucksFrontera.length + trucksLlegandoFiscal.length
  return {
    salientes,
    frontera,
    llegandoFiscal,
    trucksSalientes,
    trucksFrontera,
    trucksLlegandoFiscal,
    libreAlerts: alerts,
    totalCount,
    hasMovement: totalCount > 0 || alerts.length > 0,
  }
}
