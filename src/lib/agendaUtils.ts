import type { ParsedShipment, OperativasRecord } from './shipmentTypes'
import { parseLocalDate } from './shipmentTypes'
import { fmtDateDMY } from './format'
import { isSalidaBeforeArrival, avisoSalida, notaSalidaDirectaOk, etaVigente } from './salidaCheck'
import { needsTelexAlert, SIN_TELEX_MSG } from './telexCheck'
import type { CalendarEvent, AlertEmoji, EventType } from './agendaTypes'
import { getShipmentStatus, processShipmentRecord } from './shipmentTypes'
import type { Truck, TruckLoad } from './truckTypes'
import { deriveTruckDisplayInfo } from './truckTypes'

// ─── Alert Generation ─────────────────────────────────────────────────

const SPECIAL_CARGO_KEYWORDS = [
  'maquina', 'máquina', 'maquinas', 'máquinas', 'maquinaria',
  'prensa', 'cnc',
  'tela', 'telas',
  'cubierta', 'cubiertas',
  'camara', 'cámara', 'camaras', 'cámaras',
]

const IMO_KEYWORDS = ['imo', 'peligros', 'peligrosa', 'inflamable', 'clase imo']

const OVERSIZED_KEYWORDS = [
  'sobredimensionado', 'sobredimensionada',
  'oog', 'out of gauge',
  'fuera de medida',
  'open top', 'flat rack'
]

function matchesAny(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase()
  return keywords.some(kw => lower.includes(kw))
}

export function generateAlerts(op: OperativasRecord): AlertEmoji[] {
  const alerts: AlertEmoji[] = []
  const desc = op.DESCRIPCION || ''

  // Special cargo
  if (matchesAny(desc, SPECIAL_CARGO_KEYWORDS)) {
    alerts.push({
      emoji: '🏗️',
      label: `Carga especial: ${desc.substring(0, 40)}`,
      type: 'carga_especial'
    })
  }

  // Overweight > 27,000 kg
  if (op.KG > 27000) {
    alerts.push({
      emoji: '⚖️',
      label: `Sobrepeso: ${op.KG.toLocaleString()} kg`,
      type: 'sobrepeso'
    })
  }

  // High package count > 1,100
  if (op.PKGS > 1100) {
    alerts.push({
      emoji: '📦',
      label: `Alto volumen: ${op.PKGS.toLocaleString()} bultos`,
      type: 'alto_volumen'
    })
  }

  // Low package count < 20 (and > 0)
  if (op.PKGS > 0 && op.PKGS < 20) {
    alerts.push({
      emoji: '📦',
      label: `Bajo volumen: ${op.PKGS} bultos`,
      type: 'bajo_volumen'
    })
  }

  // IMO / Dangerous cargo
  if (matchesAny(desc, IMO_KEYWORDS)) {
    alerts.push({
      emoji: '☢️',
      label: 'Carga IMO / Peligrosa',
      type: 'imo'
    })
  }

  // Oversized cargo
  if (matchesAny(desc, OVERSIZED_KEYWORDS)) {
    alerts.push({
      emoji: '📐',
      label: 'Carga sobredimensionada',
      type: 'sobredimensionada'
    })
  }

  return alerts
}

// ─── Date Utilities ───────────────────────────────────────────────────

function isValidDateStr(s: string): boolean {
  if (!s || s.trim() === '') return false
  const d = new Date(s)
  return !isNaN(d.getTime())
}

/**
 * Parse a YYYY-MM-DD string as LOCAL date (not UTC).
 * new Date("2024-03-10") parses as UTC midnight → can shift day in local TZ.
 * This forces local interpretation by splitting and using Date constructor.
 */
function parseDateLocal(dateStr: string): Date {
  const parts = dateStr.split('-')
  if (parts.length === 3) {
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
  }
  // Fallback: append T12:00 to avoid midnight boundary issues
  return new Date(dateStr + 'T12:00:00')
}

export function toDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

export function isToday(date: Date): boolean {
  return isSameDay(date, new Date())
}

/**
 * Get Monday-Saturday dates for the week containing `date`.
 * Returns 6 dates: Mon, Tue, Wed, Thu, Fri, Sat.
 */
export function getWeekDates(date: Date): Date[] {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  // getDay(): 0=Sun,1=Mon,...,6=Sat
  let dayOfWeek = d.getDay()
  // If Sunday (0), treat as previous week's Saturday+1 → go to next Monday
  // Actually, let's make Sunday map to the previous Monday
  if (dayOfWeek === 0) dayOfWeek = 7
  const monday = new Date(d)
  monday.setDate(d.getDate() - (dayOfWeek - 1))

  const dates: Date[] = []
  for (let i = 0; i < 6; i++) { // Mon(0) to Sat(5)
    const day = new Date(monday)
    day.setDate(monday.getDate() + i)
    dates.push(day)
  }
  return dates
}

/**
 * Get month grid: array of weeks, each week has 6 days (Mon-Sat).
 * Includes padding days from adjacent months.
 */
export function getMonthGrid(year: number, month: number): Date[][] {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)

  // Find the Monday of the first week
  let startDow = firstDay.getDay() // 0=Sun..6=Sat
  if (startDow === 0) startDow = 7  // Treat Sunday as 7
  const startDate = new Date(firstDay)
  startDate.setDate(firstDay.getDate() - (startDow - 1))

  const weeks: Date[][] = []
  const current = new Date(startDate)

  // Generate weeks until we've passed the last day of month
  while (true) {
    const week: Date[] = []
    for (let i = 0; i < 6; i++) { // Mon-Sat
      week.push(new Date(current))
      current.setDate(current.getDate() + 1)
    }
    // Skip Sunday
    if (current.getDay() === 0) {
      current.setDate(current.getDate() + 1)
    }
    weeks.push(week)
    // Stop after we've included the last day of the month
    if (current > lastDay && week[5].getMonth() !== month) break
    if (weeks.length >= 6) break // Safety: max 6 weeks
  }

  return weeks
}

/**
 * Format a date string to a short label.
 */
export function formatDateShort(dateStr: string): string {
  if (!isValidDateStr(dateStr)) return '—'
  const d = parseDateLocal(dateStr)
  const day = d.getDate()
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return `${day} ${months[d.getMonth()]}`
}

/**
 * Days remaining until a date. Negative = past.
 */
export function daysUntil(dateStr: string): number {
  if (!isValidDateStr(dateStr)) return 999
  const target = parseDateLocal(dateStr)
  target.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.floor((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

// ─── Shipments → Calendar Events ──────────────────────────────────────

export function shipmentsToEvents(
  shipments: ParsedShipment[],
  depotFilter?: string,
  transportFilter?: string
): CalendarEvent[] {
  const events: CalendarEvent[] = []

  for (const shipment of shipments) {
    const ops = shipment.operativas || []
    if (ops.length === 0) continue

    const status = getShipmentStatus(shipment)

    for (const op of ops) {
      // Apply depot filter if provided — filters by DEPOSITO (cargo depot)
      if (depotFilter && op.DEPOSITO && !op.DEPOSITO.toLowerCase().includes(depotFilter.toLowerCase())) {
        continue
      }

      // Apply transport filter if provided — filters by TRANSPORTE
      if (transportFilter && op.TRANSPORTE && !op.TRANSPORTE.toLowerCase().includes(transportFilter.toLowerCase())) {
        continue
      }

      const alerts = generateAlerts(op)
      // Salida pegada a la llegada del buque: imposible (antes de que llegue) o
      // sin el margen mínimo de 2 días que necesita descarga + retiro. La ETA
      // se corre seguido y deja la salida colgada → alertar en el chip.
      const avisoSal = avisoSalida(op.SALIDA, etaVigente(shipment.ETA, op.ETA_OP), op.OPERATIVA)
      if (avisoSal) {
        alerts.push({ emoji: '⏰', label: avisoSal, type: 'salida_antes_llegada' })
      }
      // Directo saliendo en su ventana ETA+1/+2 (Brian 28/08): no es una salida
      // apretada, es lo normal — chip verde aclarándolo en vez del aviso.
      const notaDirecta = notaSalidaDirectaOk(op.SALIDA, etaVigente(shipment.ETA, op.ETA_OP), op.OPERATIVA)
      if (notaDirecta) {
        alerts.push({ emoji: '🟢', label: notaDirecta, type: 'salida_directa_ok' })
      }
      // Sin telex con salida agendada: sin la liberación de la naviera el
      // contenedor no se puede retirar — la fecha está comprometida al pedo.
      if (needsTelexAlert({ tlx: op.TLX, fecha: op.SALIDA })) {
        alerts.push({ emoji: '🚨', label: SIN_TELEX_MSG, type: 'sin_telex' })
      }
      const baseId = `${shipment.REF}-${op.CNTR_OP || 'NOCNTR'}`

      // Helper to create an event
      const makeEvent = (type: EventType, dateStr: string): CalendarEvent | null => {
        if (!isValidDateStr(dateStr)) return null
        const d = parseDateLocal(dateStr)
        return {
          id: `${baseId}-${type}`,
          date: toDateKey(d),
          type,
          ref: shipment.REF,
          operativa: op.OPERATIVA || 'CONTENEDOR',
          cntr: op.CNTR_OP || '',
          tipo: op.TIPO || '',
          cliente: op.CLIENTE_OP || shipment.CLIENTE || '',
          fiscal: op.FISCAL || '',
          deposito: op.DEPOSITO || '',
          libre: op.LIBRE || shipment.LIBRE_HASTA || '',
          descripcion: op.DESCRIPCION || '',
          kg: op.KG || 0,
          pkgs: op.PKGS || 0,
          m3: op.M3 || 0,
          transporte: op.TRANSPORTE || '',
          alerts,
          shipment,
          op,
          statusColor: status.color,
          statusLabel: status.label
        }
      }

      // Show on SALIDA date only — ETA_FISC is no longer shown on the calendar.
      if (isValidDateStr(op.SALIDA)) {
        const salidaEvent = makeEvent('salida', op.SALIDA)
        if (salidaEvent) events.push(salidaEvent)
      }
      // Ops without SALIDA are shown in the Pending sidebar, not on the calendar
    }
  }

  // Sort by date ascending
  events.sort((a, b) => a.date.localeCompare(b.date))
  return events
}

// ─── Camiones → Calendar Events ───────────────────────────────────────
// Hitos del camión consolidado en la agenda, derivados de SUS fechas (las
// mismas que mueven el estado de sus cargas): salida MVD → "en frontera" y
// arribo a fiscal. Se sintetiza un ParsedShipment mínimo para reusar las
// cards del calendario sin tocar el modelo de eventos.

export function trucksToEvents(
  trucks: Truck[],
  truckLoads: TruckLoad[],
  /** Refs (normalizadas UPPER/trim) de cargas SIN telex — para alertar 🚨 en
   *  los hitos del camión que las lleva. El caller la arma desde dbShipments. */
  sinTelexRefs?: Set<string>,
  /** REF (UPPER/trim) → depósito de esa carga. El camión no tiene depósito
   *  propio: carga donde están sus cargas, así que lo hereda de ellas. Sin
   *  esto el consolidado se caía del filtro por depósito (Brian 06/08/2026:
   *  "cuando filtro PLANIR me debe mostrar el consolidado"). */
  depoByRef?: Map<string, string>
): CalendarEvent[] {
  const events: CalendarEvent[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (const t of trucks) {
    if (t.draft) continue                        // camiones borrador: invisibles en agenda
    // Solo cargas confirmadas y las marcadas para quitar (pending='add' excluidas)
    const loads = truckLoads.filter(l => l.truckId === t.id && l.pending !== 'add')
    const refs = loads.map(l => l.sourceRef).filter(Boolean)
    const kg = loads.reduce((a, l) => a + (Number(l.kg) || 0), 0)
    const m3 = loads.reduce((a, l) => a + (Number(l.m3) || 0), 0)
    const pkgs = loads.reduce((a, l) => a + (Number(l.pkgs) || 0), 0)
    const fiscal = loads.find(l => l.fiscal)?.fiscal || ''
    // Depósito(s) donde carga el camión = los de sus cargas.
    const depositos = depoByRef
      ? [...new Set(refs.map(r => depoByRef.get(r.trim().toUpperCase())).filter(Boolean) as string[])]
      : []
    const depositoCamion = depositos.join(' / ')
    const cliente = `Camión consolidado${t.transport ? ' · ' + t.transport : ''}`
    const descripcion = refs.length ? `Lleva: ${refs.join(', ')}` : 'Sin cargas asignadas'
    const statusLabel = deriveTruckDisplayInfo(t, today).label

    const shipment = processShipmentRecord({ REF: t.code, CLIENTE: cliente })
    const op: OperativasRecord = {
      REF: t.code, TLX: '', DEPOSITO: depositoCamion, ETA_OP: '', SALIDA: t.departureDate || '',
      ETA_FISC: t.arrivalDate || '', LIBRE: '', OPERATIVA: 'CAMIÓN', CNTR_OP: t.plate || '',
      PKGS: pkgs, KG: kg, M3: m3, DESCRIPCION: descripcion, FISCAL: fiscal, DESCARGA: '',
      DEV: '', CLIENTE_OP: cliente, TIPO: t.isSider ? 'SIDER' : 'CAMIÓN', WOOD: '',
      TRANSPORTE: t.transport || '', HORARIO: '',
    }

    // Cargas del camión que siguen SIN telex: el consolidado tiene fecha pero
    // esas cargas no se pueden retirar — alerta en cada hito del camión.
    const sinTelex = sinTelexRefs
      ? refs.filter(r => sinTelexRefs.has(r.trim().toUpperCase()))
      : []
    const alerts: AlertEmoji[] = sinTelex.length
      ? [{
          emoji: '🚨',
          label: `SIN TELEX: ${sinTelex.join(', ')} — sin la liberación de la naviera esa carga no se puede retirar.`,
          type: 'sin_telex',
        }]
      : []

    const make = (type: EventType, dateStr: string): CalendarEvent | null => {
      if (!isValidDateStr(dateStr)) return null
      const d = parseDateLocal(dateStr)
      return {
        id: `truck-${t.id}-${type}`,
        date: toDateKey(d),
        type,
        ref: `🚛 ${t.code}`,
        operativa: 'CAMIÓN',
        cntr: t.plate || '',
        tipo: t.isSider ? 'SIDER' : 'CAMIÓN',
        cliente,
        fiscal,
        deposito: depositoCamion,
        libre: '',
        descripcion,
        kg, pkgs, m3,
        transporte: t.transport || '',
        alerts,
        shipment,
        op,
        statusColor: 'blue',
        statusLabel,
      }
    }

    // El camión se agenda por sus DOS hitos de planificación: la fecha de
    // CARGA (🟡, el día a coordinar con depósito) y la SALIDA (🔵, "sale
    // hoy/en frontera"). El arribo no se agenda (pedido de Brian) — ese
    // mueve estados y facturación, no la agenda. Si solo tiene arribo,
    // se usa como último recurso para que el camión nunca quede invisible.
    const ld = t.loadDate || ''
    const dd = t.departureDate || ''
    if (ld && dd && ld === dd) {
      const ev = make('salida', dd)
      if (ev) events.push(ev)
    } else {
      const carga = make('carga', ld)
      if (carga) events.push(carga)
      const salida = make('salida', dd)
      if (salida) events.push(salida)
      if (!carga && !salida) {
        const arribo = make('eta_fisc', t.arrivalDate || '')
        if (arribo) events.push(arribo)
      }
    }
  }

  return events
}

/**
 * Group events by date key (YYYY-MM-DD)
 */
export function groupEventsByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>()
  for (const e of events) {
    const existing = map.get(e.date) || []
    existing.push(e)
    map.set(e.date, existing)
  }
  return map
}

/**
 * Count events with alerts in a date range
 */
export function countAlertsInRange(events: CalendarEvent[]): number {
  return events.filter(e => e.alerts.length > 0).length
}

// ─── Arrival proximity (Pendientes de coordinar salida) ──────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Proximidad de llegada de una carga, para ordenar y etiquetar las cards de
 * "Pendientes de coordinar salida".
 *
 * Tiers de orden (menor = más arriba):
 *  0 = YA ARRIBÓ (ETA hoy o pasada) — el LIBRE corre, es lo más urgente
 *  1 = llega próximamente (ETA futura)
 *  2 = sin ETA parseable
 */
export interface ArrivalInfo {
  tier: 0 | 1 | 2
  /** Días con signo: negativo = arribó hace |days| días, 0 = hoy, positivo = llega en days días. null = sin ETA. */
  days: number | null
  /** Etiqueta lista para la card: "Arribó hace 12d" / "Arribó hoy" / "Llega en 3d" / "Llega el 03/09". */
  label: string
  /** Timestamp de la ETA para ordenar ascendente dentro del tier. Infinity si no hay ETA. */
  sortKey: number
}

/**
 * Deriva la ArrivalInfo de una ETA (string ISO). Parseo estricto vía
 * parseLocalDate — texto tipo "CONFIRMAR" o fechas no-ISO caen al tier 2.
 * `today` se inyecta para que sea una función pura (testeable).
 *
 * La fecha lejana lleva año solo si NO es el año en curso: el reclamo original
 * fue una card "ETA 3 Sep" que en realidad era de un año anterior y parecía futura.
 */
export function arrivalInfo(etaStr: string, today: Date): ArrivalInfo {
  const eta = parseLocalDate((etaStr || '').trim())
  if (!eta) return { tier: 2, days: null, label: 'Sin ETA', sortKey: Number.POSITIVE_INFINITY }

  eta.setHours(0, 0, 0, 0)
  const t = new Date(today)
  t.setHours(0, 0, 0, 0)
  const days = Math.round((eta.getTime() - t.getTime()) / MS_PER_DAY)

  if (days <= 0) {
    const label = days === 0 ? 'Arribó hoy' : days === -1 ? 'Arribó ayer' : `Arribó hace ${-days}d`
    return { tier: 0, days, label, sortKey: eta.getTime() }
  }

  const full = fmtDateDMY(toDateKey(eta)) // dd/MM/yyyy
  const dateLabel = eta.getFullYear() === t.getFullYear() ? full.slice(0, 5) : full
  const label = days === 1 ? 'Llega mañana' : days <= 7 ? `Llega en ${days}d` : `Llega el ${dateLabel}`
  return { tier: 1, days, label, sortKey: eta.getTime() }
}

/**
 * Comparador por proximidad de llegada: primero las ya arribadas (de más vieja
 * a más nueva — la que más espera coordinar va arriba), después las que llegan
 * próximamente (de más cercana a más lejana), y sin ETA al final.
 */
export function compareByArrival(a: ArrivalInfo, b: ArrivalInfo): number {
  if (a.tier !== b.tier) return a.tier - b.tier
  if (a.sortKey === b.sortKey) return 0 // evita Infinity - Infinity = NaN en tier 2
  return a.sortKey < b.sortKey ? -1 : 1
}

// ─── Pending Salida Filter ────────────────────────────────────────────

/** Destination zone derived from POD/PAIS, used for the filter chips. */
export type DestZone = 'UY' | 'AR' | 'CL' | 'OTRO'

export interface PendingSalidaItem {
  shipment: ParsedShipment
  op: OperativasRecord
  /** Destination zone for the filter chips (derived from shipment.PAIS). */
  dest: DestZone
  /** Proximidad de llegada — orden de la lista + etiqueta temporal de la card. */
  arrival: ArrivalInfo
}

/**
 * Returns operativas that have ALREADY ARRIVED (ETA ≤ today) but still have
 * NO SALIDA scheduled — la carga llegó y todavía no se coordinó su salida.
 *
 * Criteria (all must be true):
 *  - Container number present (CNTR_OP or shipment.CNTR)
 *  - SALIDA is empty, 'CONFIRMAR', or '#N/A' (not yet coordinated)
 *  - ETA — preferring shipment.ETA over op.ETA_OP (op value can be junk) —
 *    is today-or-past (already arrived)
 *
 * NO se excluye por LIBRE='DEVUELTO' ni OPERATIVA='CARGA A PISO'/desconsolidado:
 * esos estados son del CONTENEDOR (vacío ya devuelto) o de la mercadería que
 * espera en el piso del depósito — la carga IGUAL necesita coordinar su salida
 * al cliente (caso real A6820). Lo único que saca una carga de esta lista es
 * tener una SALIDA real cargada (ahora editable por contenedor desde el quick-edit).
 *
 * Dedup por (REF, contenedor): el array `operativas` puede traer contenedores
 * duplicados (bug de datos) → una sola tarjeta por contenedor.
 *
 * Ordenado por LLEGADA (ETA ascendente): la carga que arribó primero va arriba
 * (la que más tiempo lleva esperando coordinar salida). Después de las arribadas
 * entran las que LLEGAN PRÓXIMAMENTE (ETA dentro de PENDING_UPCOMING_HORIZON_DAYS),
 * de más cercana a más lejana. Desempate estable por REF.
 */
/** Horizonte de "llega próximamente": la coordinación y los checks arrancan
 *  ~2 semanas antes de la ETA (regla de negocio TWF), más lejos no es accionable. */
export const PENDING_UPCOMING_HORIZON_DAYS = 14

export function pendingSalida(
  shipments: ParsedShipment[],
  today: Date,
  /** REFs que ya viajan en un consolidado publicado (refsEnConsolidado): salen
   *  de la lista aunque no tengan SALIDA propia — la fecha la tiene el camión. */
  enConsolidado?: Set<string>
): PendingSalidaItem[] {
  const todayNorm = new Date(today)
  todayNorm.setHours(0, 0, 0, 0)

  const items: PendingSalidaItem[] = []
  // Dedup por (REF, contenedor): el array `operativas` puede traer el mismo
  // contenedor duplicado (bug de datos, ej. A6820) → una sola tarjeta.
  const seen = new Set<string>()

  for (const s of shipments) {
    if (!s.operativas || s.operativas.length === 0) continue

    // Ya subida a un consolidado publicado → deja de ser pendiente: viaja con
    // el camión y su salida es la del camión, no una propia.
    if (enConsolidado?.has(String(s.REF || '').trim().toUpperCase())) continue

    for (const op of s.operativas) {
      // Must have a container number
      const cntr = (op.CNTR_OP || s.CNTR || '').trim()
      if (!cntr) continue

      // Must have no SALIDA yet — treat empty string, 'CONFIRMAR', and '#N/A' as "not coordinated"
      const salidaNorm = (op.SALIDA || '').trim().toUpperCase()
      if (salidaNorm !== '' && salidaNorm !== 'CONFIRMAR' && salidaNorm !== '#N/A') continue

      // Arribadas (ETA hoy o pasada) SIEMPRE entran; las por llegar entran solo
      // dentro del horizonte de 14 días — más lejos todavía no se coordina y
      // taparía la cola de trabajo.
      // Prefer shipment.ETA — op.ETA_OP can contain junk dates like '2001-09-01'.
      const etaStr = (s.ETA || op.ETA_OP || '').trim()
      const etaDate = parseLocalDate(etaStr)
      if (!etaDate) continue

      etaDate.setHours(0, 0, 0, 0)
      const daysAway = (etaDate.getTime() - todayNorm.getTime()) / 86_400_000
      if (daysAway > PENDING_UPCOMING_HORIZON_DAYS) continue // demasiado lejos aún

      // Una sola tarjeta por (REF, contenedor) aunque la operativa esté duplicada.
      const dedupKey = `${s.REF}::${cntr.toUpperCase()}`
      if (seen.has(dedupKey)) continue
      seen.add(dedupKey)

      // Derive destination zone from shipment.PAIS (reliable enum: UY/AR/CL/OTRO)
      const dest: DestZone = (s.PAIS === 'UY' || s.PAIS === 'AR' || s.PAIS === 'CL') ? s.PAIS : 'OTRO'

      items.push({ shipment: s, op, dest, arrival: arrivalInfo(etaStr, todayNorm) })
    }
  }

  // Orden por proximidad de llegada: ya arribadas primero (la más vieja arriba —
  // es la que más tiempo lleva esperando coordinar), después las que llegan
  // próximamente (dentro del horizonte), y sin ETA al final.
  // Desempate estable por REF para un orden determinístico.
  items.sort((a, b) => {
    const c = compareByArrival(a.arrival, b.arrival)
    if (c !== 0) return c
    return a.shipment.REF.localeCompare(b.shipment.REF)
  })

  return items
}
