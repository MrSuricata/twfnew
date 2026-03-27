import type { ParsedShipment, OperativasRecord } from './shipmentTypes'
import type { CalendarEvent, AlertEmoji, EventType } from './agendaTypes'
import { getShipmentStatus } from './shipmentTypes'

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
  depotFilter?: string
): CalendarEvent[] {
  const events: CalendarEvent[] = []

  for (const shipment of shipments) {
    const ops = shipment.operativas || []
    if (ops.length === 0) continue

    const status = getShipmentStatus(shipment)

    for (const op of ops) {
      // Apply depot filter if provided — filters by DEPOSITO (cargo depot), not FISCAL
      if (depotFilter && op.DEPOSITO && !op.DEPOSITO.toLowerCase().includes(depotFilter.toLowerCase())) {
        continue
      }

      const alerts = generateAlerts(op)
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

      // Show on SALIDA date, or today if no date assigned (for depot/transport views)
      if (isValidDateStr(op.SALIDA)) {
        const salidaEvent = makeEvent('salida', op.SALIDA)
        if (salidaEvent) events.push(salidaEvent)
      } else if (depotFilter) {
        // No SALIDA date but depot filter active → show as pending on today
        const todayStr = toDateKey(new Date())
        const pendingEvent: CalendarEvent = {
          id: `${baseId}-pending`,
          date: todayStr,
          type: 'salida',
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
          alerts: [...alerts, { emoji: '📋', label: 'Sin fecha de salida', type: 'pending' }],
          shipment,
          op,
          statusColor: 'amber',
          statusLabel: 'Pendiente de coordinar'
        }
        events.push(pendingEvent)
      }
    }
  }

  // Sort by date ascending
  events.sort((a, b) => a.date.localeCompare(b.date))
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
