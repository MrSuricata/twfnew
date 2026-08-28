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
import {
  type CheckStepKey,
  type RefCheckSteps,
  normalizeRef,
  isPorUruguay,
  estaLiberada,
} from './checksTypes'
import { refsEnConsolidado, type Truck, type TruckLoad } from './truckTypes'
import { cargaFclActiva } from './operationsTypes'
import { margenSalida, MARGEN_SALIDA_DIAS, etaVigente } from './salidaCheck'

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

// refsEnConsolidado vive en truckTypes (es lógica de camiones) y se re-exporta
// acá porque el snapshot de HOY la usa.
export { refsEnConsolidado }

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
// ── Llegan sin liberar ──────────────────────────────────────────────────
// Una carga no se puede retirar hasta que la naviera confirma la liberación
// (el botón LIBERADO de la pestaña Checks). Si el buque está por llegar y eso
// todavía no pasó, el retiro se va a trabar — y cuanto más cerca del arribo,
// menos margen queda para resolverlo.
//
// Ventana de 7 días antes del arribo (Brian 12/08/2026). Las YA ARRIBADAS sin
// liberar entran siempre: son las que están costando plata en terminal.

const hoyMidnight = (): Date => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }

/** Días antes del arribo a partir de los cuales se avisa (Brian 13/08: 10). */
export const SIN_LIBERAR_DIAS = 10

export interface SinLiberarAlert {
  shipment: ParsedShipment
  /** Negativo = ya llegó · 0 = llega hoy · positivo = días que faltan. */
  diasParaLlegar: number
  severity: 'vencido' | 'urgente' | 'proxima'
}

/**
 * Cargas por Uruguay que llegan dentro de la ventana (o ya llegaron) y no
 * tienen marcada la liberación. `checksByRef` son los steps de ref_checks
 * indexados por ref normalizada.
 */
export function sinLiberarAlerts(
  shipments: ParsedShipment[],
  checksByRef: Map<string, RefCheckSteps>,
  dias: number = SIN_LIBERAR_DIAS,
): SinLiberarAlert[] {
  const out: SinLiberarAlert[] = []
  for (const s of shipments) {
    if (!isPorUruguay(s.PAIS)) continue
    const eta = parseLocalDate(s.ETA || '')
    if (!eta) continue
    // Ya salió del puerto: la liberación dejó de ser un problema.
    const yaSalio = (s.operativas || []).some(op => {
      const d = parseLocalDate(op.SALIDA || '')
      return d !== null && daysSince(op.SALIDA) !== null && (daysSince(op.SALIDA) as number) >= 0
    })
    if (yaSalio) continue

    // MISMO universo que la pestaña Checks: si la carga no está viva ahí, no hay
    // dónde apretar LIBERADO y avisar sería mandar a una pantalla vacía. Sin esto
    // aparecían cargas de hace 300+ días que nunca tuvieron operativa cargada.
    const ops = s.operativas || []
    if (!cargaFclActiva({
      libre: ops.find(o => o.LIBRE)?.LIBRE || s.LIBRE_HASTA || s.calculatedLibreHasta,
      salida: ops.find(o => o.SALIDA)?.SALIDA,
      etaFisc: ops.map(o => o.ETA_FISC).filter(Boolean).sort().pop(),
      eta: s.ETA,
    }, hoyMidnight())) continue
    if (estaLiberada(checksByRef.get(normalizeRef(s.REF)) || {})) continue

    const faltan = -(daysSince(s.ETA) as number)     // daysSince: + = pasado
    if (faltan > dias) continue
    const severity: SinLiberarAlert['severity'] =
      faltan < 0 ? 'vencido' : faltan <= 2 ? 'urgente' : 'proxima'
    out.push({ shipment: s, diasParaLlegar: faltan, severity })
  }
  return out.sort((a, b) => a.diasParaLlegar - b.diasParaLlegar)
}

// ── Salidas pisadas por la llegada del buque ────────────────────────────
// La regla salida-vs-llegada (margenSalida) se chequea al EDITAR la salida,
// pero el buque se mueve DESPUÉS: si la ETA se corre y pisa una salida ya
// coordinada, nadie la vuelve a mirar. Pedido Brian 13/08 ("para mañana
// tenemos asignada la A7914; si el buque se atrasa y opera mañana, avisame
// que la salida se pisa con la llegada — es imposible"). Esta alerta vigila
// eso continuamente en HOY.

export interface SalidaPisadaAlert {
  shipment: ParsedShipment
  op: OperativasRecord
  cntr: string
  salida: string
  eta: string
  /** Días entre la llegada y la salida. Negativo = salida ANTES de la llegada. */
  margen: number
  /** true = imposible (sale antes o el mismo día que llega el buque). */
  grave: boolean
}

/**
 * Salidas coordinadas que quedaron pisadas (o muy justas) contra la llegada
 * del buque a MVD. Por contenedor: la ETA es la del contenedor (ETA_OP) o la
 * de la carga.
 *
 * Entra una salida cuando:
 *  - GRAVE (imposible): sale ANTES o el MISMO día que llega el buque. Se
 *    incluye aunque la fecha de salida ya haya pasado si el buque todavía no
 *    llegó — ese camión no salió, hay que recoordinar sí o sí.
 *  - JUSTA: sale al día siguiente de la llegada (menos del margen normal de
 *    2 días) y la salida es hoy o futura — puede pisarse si el buque se
 *    atrasa un día más.
 *
 * Pares con ambas fechas en el pasado son historia, no acción: se ignoran.
 */
export function salidasPisadasAlerts(shipments: ParsedShipment[]): SalidaPisadaAlert[] {
  const hoy = hoyMidnight()
  const out: SalidaPisadaAlert[] = []
  for (const s of shipments) {
    if (!isPorUruguay(s.PAIS)) continue
    for (const op of s.operativas || []) {
      const salida = (op.SALIDA || '').trim()
      // ETA de la CARGA primero: es la que se actualiza cuando el buque se
      // mueve; ETA_OP es una copia congelada al hornear (caso A7995).
      const eta = etaVigente(s.ETA, op.ETA_OP)
      const margen = margenSalida(salida, eta)
      if (margen === null || margen >= MARGEN_SALIDA_DIAS) continue
      // Retiro DIRECTO desde terminal (Brian 28/08, caso A7967): su ventana
      // normal es ETA+1 o ETA+2 — "muy justa" no aplica. Solo alerta cuando es
      // imposible de verdad: sale antes o el MISMO día que llega el buque.
      const directa = String(op.OPERATIVA || '').trim().toUpperCase().startsWith('CONTENEDOR')
      if (directa && margen > 0) continue

      const salidaFutura = (parseLocalDate(salida)?.getTime() ?? -1) >= hoy.getTime()
      const etaFutura = (parseLocalDate(eta)?.getTime() ?? -1) >= hoy.getTime()
      // margen <= 0 = imposible (sale antes o el mismo día que llega).
      // margen 1 = justa: solo avisar mientras la salida no haya pasado.
      const grave = margen <= 0
      const accionable = grave ? (salidaFutura || etaFutura) : salidaFutura
      if (!accionable) continue

      out.push({ shipment: s, op, cntr: (op.CNTR_OP || s.CNTR || '').trim(), salida, eta, margen, grave })
    }
  }
  // Imposibles primero; dentro de cada grupo, la salida más próxima arriba.
  return out.sort((a, b) =>
    Number(b.grave) - Number(a.grave) || a.salida.localeCompare(b.salida))
}

export interface TodaySnapshot {
  salientes: OpMatch[]
  frontera: OpMatch[]
  llegandoFiscal: OpMatch[]
  /** Consolidados que se mueven hoy, ya repartidos en las mismas 3 columnas. */
  trucksSalientes: TruckMatch[]
  trucksFrontera: TruckMatch[]
  trucksLlegandoFiscal: TruckMatch[]
  libreAlerts: LibreAlert[]
  /** Llegan dentro de SIN_LIBERAR_DIAS y todavía no las liberó la naviera. */
  sinLiberar: SinLiberarAlert[]
  /** Salidas coordinadas pisadas (o muy justas) contra la llegada del buque. */
  salidasPisadas: SalidaPisadaAlert[]
  totalCount: number
  hasMovement: boolean
}

export function buildTodaySnapshot(
  shipments: ParsedShipment[],
  trucks: Truck[] = [],
  truckLoads: TruckLoad[] = [],
  checksByRef: Map<string, RefCheckSteps> = new Map(),
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
  const sinLiberar = sinLiberarAlerts(shipments, checksByRef)
  const salidasPisadas = salidasPisadasAlerts(shipments)
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
    sinLiberar,
    salidasPisadas,
    totalCount,
    hasMovement: totalCount > 0 || alerts.length > 0 || sinLiberar.length > 0 || salidasPisadas.length > 0,
  }
}
