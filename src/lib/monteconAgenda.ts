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
 *
 * Cierre del ciclo (Brian 26/08): RETIRADO → la fila baja al final de la card
 * como recordatorio de avisar al cliente que el contenedor ya está en depósito
 * → AVISADO → recién ahí sale de la pantalla.
 *
 * TCP (Brian 26/08, segunda vuelta): en TCP también hay que retirar el
 * contenedor cuando llega el buque y avisar al cliente — pero SIN turnos, así
 * que nada de agenda/reagenda. Al llegar el buque la fila pasa a 'retirar' y
 * sigue el mismo ciclo RETIRADO → AVISADO.
 *
 * TCP por llegar (Brian 02/09): la card mostraba solo Montecon a dos semanas
 * y las de TCP recién el día del arribo — "Llegan sin liberar" avisaba de una
 * carga a 4 días que acá no existía. Ahora TCP entra en la MISMA ventana que
 * Montecon, en estado 'por_llegar' (informativo, sin botones): se ve qué
 * viene, y el día que llega pasa sola a 'retirar'.
 */

import { parseLocalDate } from './shipmentTypes'

export type EstadoAgenda = 'sin_agendar' | 'agendada' | 'reagendar' | 'por_llegar' | 'retirar' | 'retirado'

export interface AgendaRow {
  ref: string
  eta_agendada: string
  /** Fecha del TURNO de retiro conseguido (Brian 26/08: "para qué fecha
   *  agendaste" — queda a la vista en la fila). ISO YYYY-MM-DD. */
  fecha_retiro?: string | null
  usuario?: string | null
  updated_at?: string | null
  retirado_at?: string | null
  retirado_por?: string | null
  avisado_at?: string | null
  avisado_por?: string | null
}

export interface CargaMontecon {
  dbId: string
  ref: string
  cliente: string
  cntr: string
  /** MONTECON = ciclo con agenda de turnos · TCP = retiro directo sin agenda. */
  terminal: 'MONTECON' | 'TCP'
  eta: string
  /** 0 = llega hoy · >0 = por llegar · <0 = ya llegó (retiro pendiente). */
  dias: number
  estado: EstadoAgenda
  /** ETA contra la que se agendó (solo con agenda). */
  etaAgendada: string
  /** Fecha del turno de retiro conseguido ('' si no se cargó). */
  fechaRetiro: string
  /** Día del retiro (YYYY-MM-DD, solo estado 'retirado'). */
  retiradoEl: string
}

/** Ventana: ya llegadas hace poco (el retiro es DESPUÉS del arribo) + las que
 *  vienen en las próximas dos semanas — el plazo real para pelear un turno. */
export const MONTECON_DIAS_ATRAS = 5
export const MONTECON_DIAS_ADELANTE = 14

/** Retirado sin AVISADO: recordatorio visible "un par de días" (Brian 26/08).
 *  Tope de higiene por si nunca lo marcan — lo normal es que salga al avisar. */
export const RETIRADO_DIAS_RECORDATORIO = 5

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
 * Las cargas FCL a retirar de terminal: MONTECON (con su estado de agenda de
 * turnos) y TCP (sin turnos — 'por_llegar' mientras viene, 'retirar' cuando
 * el buque llegó). Misma ventana para las dos terminales.
 * Orden: reagendar (el fuego) → TCP llegadas por retirar → sin agendar →
 * agendadas → TCP por llegar → al FONDO las retiradas pendientes de avisar al
 * cliente. Una fila de agenda de una carga fuera de ventana queda inocua.
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
    const term = txt(c.terminal).toUpperCase()
    const terminal: CargaMontecon['terminal'] | null =
      term.includes('MONTECON') ? 'MONTECON' : term.includes('TCP') ? 'TCP' : null
    if (!terminal) continue
    const a = porRef.get(txt(c.ref).toUpperCase())
    if (a?.avisado_at) continue // ciclo cerrado: retirado y cliente avisado
    const eta = txt(c.eta)

    if (a?.retirado_at) {
      // Retirado: la ETA ya no manda (el contenedor está en depósito). Queda
      // abajo como recordatorio de avisar al cliente hasta que marquen AVISADO.
      // El timestamp es UTC: un retiro de anoche puede "ser mañana" en UTC, por
      // eso solo se filtra por viejo, nunca por futuro.
      const retiradoEl = txt(a.retirado_at).slice(0, 10)
      const diasRetiro = diffDias(retiradoEl, hoy)
      if (diasRetiro === null || diasRetiro > RETIRADO_DIAS_RECORDATORIO) continue
      out.push({
        dbId: txt(c.dbId),
        ref: txt(c.ref),
        cliente: txt(c.cliente),
        cntr: txt(c.contenedor),
        terminal,
        eta,
        dias: diffDias(hoy, eta) ?? 0,
        estado: 'retirado',
        etaAgendada: txt(a.eta_agendada),
        fechaRetiro: txt(a.fecha_retiro),
        retiradoEl,
      })
      continue
    }

    const dias = diffDias(hoy, eta)
    if (dias === null) continue
    if (dias < -MONTECON_DIAS_ATRAS || dias > MONTECON_DIAS_ADELANTE) continue
    let estado: EstadoAgenda
    if (terminal === 'MONTECON') {
      estado = estadoAgenda(eta, a)
    } else {
      // TCP no maneja turnos (Brian 26/08): mientras el buque viene la fila es
      // informativa ('por_llegar', misma ventana que Montecon — Brian 02/09);
      // cuando llegó hay contenedor para retirar. El ciclo es directo:
      // RETIRADO → avisar al cliente el traslado a depósito → AVISADO.
      estado = dias > 0 ? 'por_llegar' : 'retirar'
    }
    out.push({
      dbId: txt(c.dbId),
      ref: txt(c.ref),
      cliente: txt(c.cliente),
      cntr: txt(c.contenedor),
      terminal,
      eta,
      dias,
      estado,
      etaAgendada: txt(a?.eta_agendada),
      fechaRetiro: txt(a?.fecha_retiro),
      retiradoEl: '',
    })
  }

  const rango = (e: EstadoAgenda) =>
    e === 'reagendar' ? 0 : e === 'retirar' ? 1 : e === 'sin_agendar' ? 2 : e === 'agendada' ? 3 : e === 'por_llegar' ? 4 : 5
  return out.sort((a, b) => {
    if (rango(a.estado) !== rango(b.estado)) return rango(a.estado) - rango(b.estado)
    if (a.dias !== b.dias) return a.dias - b.dias
    return a.ref.localeCompare(b.ref)
  })
}
