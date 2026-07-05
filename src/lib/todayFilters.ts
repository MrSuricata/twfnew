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
import type { CheckStepKey } from './checksTypes'

/** A single operativa matched along with its parent shipment for context. */
export interface OpMatch {
  shipment: ParsedShipment
  op: OperativasRecord
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

/** En frontera: ya salió (mínimo ayer). El límite superior lo pone la ETA fiscal,
 *  no un número fijo de días (ver enFronteraHoy). BORDER_MAX_DAYS_NO_FISC es solo
 *  el tope de seguridad para las que NO tienen ETA fiscal cargada. */
const BORDER_MIN_DAYS = 1
const BORDER_MAX_DAYS_NO_FISC = 7
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
export function salientesHoy(shipments: ParsedShipment[]): OpMatch[] {
  return shipments.flatMap(s =>
    (s.operativas ?? [])
      .filter(op => isDateToday(op.SALIDA))
      .map(op => ({ shipment: s, op }))
  )
}

/**
 * Operativas estimadas EN FRONTERA hoy (en tránsito UY→fiscal).
 *
 * No hay campo CRUCE_FRONTERA, así que se deriva: la carga ya SALIÓ (SALIDA en el
 * pasado — mínimo ayer; si salió hoy va en "Saliendo hoy") y TODAVÍA NO llegó a
 * fiscal. Sigue "en frontera" desde que sale HASTA EL DÍA ANTERIOR a la ETA fiscal
 * — el límite lo pone la ETA fiscal, no un número fijo de días. Así, un domingo,
 * aparecen las que salieron el jueves Y el viernes (no solo las de 1–2 días atrás),
 * mientras su arribo fiscal siga siendo futuro. El día de la ETA fiscal pasa a la
 * card "Llegando a fiscal hoy". Sin ETA fiscal cargada: se muestra igual (sigue en
 * tránsito) con un tope de seguridad para no acumular indefinidamente.
 */
export function enFronteraHoy(shipments: ParsedShipment[]): OpMatch[] {
  return shipments.flatMap(s =>
    (s.operativas ?? [])
      .filter(op => {
        // NO filtrar por DEVUELTO: es estado del contenedor, no de la carga
        // (ver nota en salientesHoy). La carga sigue en frontera aunque el
        // contenedor vacío ya se haya devuelto.
        if (!isValidDate(op.SALIDA)) return false
        const days = daysSince(op.SALIDA)
        if (days === null || days < BORDER_MIN_DAYS) return false // sale hoy / no salió aún
        if (isValidDate(op.ETA_FISC)) {
          // Con ETA fiscal: en frontera mientras el arribo sea FUTURO (mañana o más).
          // Hoy → "Llegando a fiscal"; pasado → ya llegó.
          return !isDatePast(op.ETA_FISC) && !isDateToday(op.ETA_FISC)
        }
        // Sin ETA fiscal: sigue en tránsito, pero con tope para no acumular viejas.
        return days <= BORDER_MAX_DAYS_NO_FISC
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
