import type { ParsedShipment, OperativasRecord } from './shipmentTypes'

// ─── Vista Types ──────────────────────────────────────────────────────
export type AgendaView = 'day' | 'week' | 'month' | 'annual'

// ─── Event Types ──────────────────────────────────────────────────────
export type EventType = 'salida' | 'eta_fisc' | 'libre' | 'descarga' | 'dev'

// ─── Alert Emoji ──────────────────────────────────────────────────────
export interface AlertEmoji {
  emoji: string        // 🏗️ ⚖️ 📦 ☢️ 📐
  label: string        // Tooltip text
  type: string         // Key for filtering
}

// ─── Calendar Event ───────────────────────────────────────────────────
export interface CalendarEvent {
  id: string                    // `${REF}-${CNTR}-${type}`
  date: string                  // YYYY-MM-DD
  type: EventType
  ref: string                   // REF
  operativa: string             // CONTENEDOR | TRASIEGO | DEVUELTO
  cntr: string                  // CNTR_OP
  tipo: string                  // 40HC, 20DV, etc.
  cliente: string               // CLIENTE
  fiscal: string                // Deposit destination (CACEC, MARE, etc.)
  deposito: string              // Physical depot (GODILCO, PLANIR, etc.)
  libre: string                 // Free until date
  descripcion: string           // For alert detection
  kg: number
  pkgs: number
  m3: number
  transporte: string
  alerts: AlertEmoji[]
  shipment: ParsedShipment
  op: OperativasRecord
  statusColor: string
  statusLabel: string
}

// ─── Event Type Config ────────────────────────────────────────────────
export interface EventTypeConfig {
  label: string
  color: string        // strip color class
  bg: string           // background class
  dot: string          // emoji dot
  textColor: string    // text color class
}

export const EVENT_TYPE_CONFIG: Record<EventType, EventTypeConfig> = {
  salida: {
    label: 'Salida MVD',
    color: 'bg-blue-500',
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    dot: '🔵',
    textColor: 'text-blue-700 dark:text-blue-300'
  },
  eta_fisc: {
    label: 'Llegada Fiscal',
    color: 'bg-green-500',
    bg: 'bg-green-50 dark:bg-green-950/30',
    dot: '🟢',
    textColor: 'text-green-700 dark:text-green-300'
  },
  libre: {
    label: 'Vencimiento Libre',
    color: 'bg-orange-500',
    bg: 'bg-orange-50 dark:bg-orange-950/30',
    dot: '🟠',
    textColor: 'text-orange-700 dark:text-orange-300'
  },
  descarga: {
    label: 'Descarga',
    color: 'bg-purple-500',
    bg: 'bg-purple-50 dark:bg-purple-950/30',
    dot: '🟣',
    textColor: 'text-purple-700 dark:text-purple-300'
  },
  dev: {
    label: 'Devolución',
    color: 'bg-gray-400',
    bg: 'bg-gray-50 dark:bg-gray-800/30',
    dot: '⚪',
    textColor: 'text-gray-600 dark:text-gray-400'
  }
}

// ─── Operativa Color Config (card colors by operation type) ──────────
export interface OperativaColorConfig {
  color: string        // strip color class
  bg: string           // background class
  dot: string          // colored dot
  textColor: string    // badge text color
  label: string        // display label
}

const OPERATIVA_COLORS: Record<string, OperativaColorConfig> = {
  TRASIEGO: {
    color: 'bg-blue-500',
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    dot: '🔵',
    textColor: 'text-blue-700 dark:text-blue-300',
    label: 'Trasiego'
  },
  CONTENEDOR: {
    color: 'bg-rose-500',
    bg: 'bg-rose-50 dark:bg-rose-950/30',
    dot: '🔴',
    textColor: 'text-rose-700 dark:text-rose-300',
    label: 'Contenedor'
  },
  'CARGA A PISO': {
    color: 'bg-amber-500',
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    dot: '🟡',
    textColor: 'text-amber-700 dark:text-amber-300',
    label: 'Carga a Piso'
  },
  DEVUELTO: {
    color: 'bg-gray-400',
    bg: 'bg-gray-50 dark:bg-gray-800/30',
    dot: '⚪',
    textColor: 'text-gray-600 dark:text-gray-400',
    label: 'Devuelto'
  }
}

const DEFAULT_OPERATIVA_COLOR: OperativaColorConfig = {
  color: 'bg-slate-500',
  bg: 'bg-slate-50 dark:bg-slate-900/30',
  dot: '⚫',
  textColor: 'text-slate-700 dark:text-slate-300',
  label: 'Otro'
}

export function getOperativaColor(operativa: string): OperativaColorConfig {
  const key = operativa.toUpperCase().trim()
  return OPERATIVA_COLORS[key] || DEFAULT_OPERATIVA_COLOR
}

// ─── Date Constants ───────────────────────────────────────────────────
export const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
export const DAY_NAMES_FULL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
export const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]
export const MONTH_NAMES_SHORT = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
]
