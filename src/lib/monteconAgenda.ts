/**
 * Alerta "CARGAS QUE LLEGAN A MONTECON" — pestaña HOY.
 *
 * Brian (22/08/2026): los turnos de retiro en Montecon son escasos. Agenda el
 * retro del contenedor contra una ETA, pero si el buque se corre (o no
 * descarga) hay que RE-agendar — y estar atento a eso a mano es exactamente el
 * tipo de cosa que se escapa.
 *
 * El mecanismo es derive-on-read, sin cron: `montecon_agenda` guarda la ETA
 * CONTRA la que se agendó. Si la ETA actual de la carga ya no es esa, el
 * estado deriva a "reagendar" solo — el aviso aparece en cuanto alguien
 * actualiza la ETA en cualquier parte de la app (Seguimientos, ficha, donde
 * sea), sin que nadie tenga que acordarse de avisar.
 */

import { parseLocalDate } from './shipmentTypes'

export type EstadoAgenda = 'sin_agendar' | 'agendada' | 'reagendar'

export interface AgendaRow {
  ref: string
  eta_agendada: string
  usuario?: string | null
  updated_at?: string | null
}

export interface CargaMontecon {
  dbId: string
  ref: string
  cliente: string
  cntr: string
  eta: string
  /** 0 = llega hoy · >0 = por llegar · <0 = ya llegó (retiro pendiente). */
  dias: number
  estado: EstadoAgenda
  /** ETA contra la que se agendó (solo con agenda). */
  etaAgendada: string
}

/** Ventana: ya llegadas hace poco (el retiro es DESPUÉS del arribo) + las que
 *  vienen en las próximas dos semanas — el plazo real para pelear un turno. */
export const MONTECON_DIAS_ATRAS = 5
export const MONTECON_DIAS_ADELANTE = 14

const txt = (v: unknown): string => String(v ?? '').trim()
const MS_DIA = 86_400_000

const diffDias = (desde: string, hasta: string): number | null => {
  const a = parseLocalDate(desde)
  const b = parseLocalDate(hasta)
  if (!a || !b) return null
  const med = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return Math.round((med(b) - med(a)) / MS_DIA)
}

/** Estado de la agenda de una carga: la comparación es de STRINGS de fecha —
 *  cualquier cambio de ETA (aunque sea un día) dispara el reagendado. */
export function estadoAgenda(etaActual: string, agenda: AgendaRow | undefined): EstadoAgenda {
  if (!agenda) return 'sin_agendar'
  return txt(agenda.eta_agendada) === txt(etaActual) ? 'agendada' : 'reagendar'
}

export interface CargaMonteconInput {
  dbId?: string | null
  ref: string
  cliente?: string | null
  terminal?: string | null
  contenedor?: string | null
  eta?: string | null
  mode?: string | null
  archived?: boolean
}

/**
 * Las cargas FCL que llegan (o acaban de llegar) a MONTECON, con su estado de
 * agenda. Orden: primero las que hay que RE-agendar (el fuego), después por
 * llegada. Una fila de agenda de una carga fuera de ventana queda inocua.
 */
export function cargasMontecon(
  cargas: CargaMonteconInput[],
  agenda: AgendaRow[],
  hoy: string,
): CargaMontecon[] {
  const porRef = new Map<string, AgendaRow>()
  for (const a of agenda || []) porRef.set(txt(a.ref).toUpperCase(), a)

  const out: CargaMontecon[] = []
  for (const c of cargas || []) {
    if (c.archived || txt(c.mode).toLowerCase() !== 'fcl') continue
    if (!txt(c.terminal).toUpperCase().includes('MONTECON')) continue
    const eta = txt(c.eta)
    const dias = diffDias(hoy, eta)
    if (dias === null) continue
    if (dias < -MONTECON_DIAS_ATRAS || dias > MONTECON_DIAS_ADELANTE) continue
    const a = porRef.get(txt(c.ref).toUpperCase())
    out.push({
      dbId: txt(c.dbId),
      ref: txt(c.ref),
      cliente: txt(c.cliente),
      cntr: txt(c.contenedor),
      eta,
      dias,
      estado: estadoAgenda(eta, a),
      etaAgendada: txt(a?.eta_agendada),
    })
  }

  const rango = (e: EstadoAgenda) => (e === 'reagendar' ? 0 : e === 'sin_agendar' ? 1 : 2)
  return out.sort((a, b) => {
    if (rango(a.estado) !== rango(b.estado)) return rango(a.estado) - rango(b.estado)
    if (a.dias !== b.dias) return a.dias - b.dias
    return a.ref.localeCompare(b.ref)
  })
}
