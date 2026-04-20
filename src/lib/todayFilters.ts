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

/** A single operativa matched along with its parent shipment for context. */
export interface OpMatch {
  shipment: ParsedShipment
  op: OperativasRecord
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
 */
export function salientesHoy(shipments: ParsedShipment[]): OpMatch[] {
  return shipments.flatMap(s =>
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
export function enFronteraHoy(shipments: ParsedShipment[]): OpMatch[] {
  return shipments.flatMap(s =>
    (s.operativas ?? [])
      .filter(op => {
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
export function llegandoFiscalHoy(shipments: ParsedShipment[]): OpMatch[] {
  return shipments.flatMap(s =>
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
    if (!libre || !isValidDate(libre)) continue
    // Skip "DEVUELTO" / text markers — only care about real dates
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

/**
 * Aggregated today-view payload used by both the web dashboard and the Telegram summary.
 */
export interface TodaySnapshot {
  salientes: OpMatch[]
  frontera: OpMatch[]
  llegandoFiscal: OpMatch[]
  libreAlerts: LibreAlert[]
  totalCount: number
  hasMovement: boolean
}

export function buildTodaySnapshot(shipments: ParsedShipment[]): TodaySnapshot {
  const salientes = salientesHoy(shipments)
  const frontera = enFronteraHoy(shipments)
  const llegandoFiscal = llegandoFiscalHoy(shipments)
  const alerts = libreAlerts(shipments)
  const totalCount = salientes.length + frontera.length + llegandoFiscal.length
  return {
    salientes,
    frontera,
    llegandoFiscal,
    libreAlerts: alerts,
    totalCount,
    hasMovement: totalCount > 0 || alerts.length > 0,
  }
}
