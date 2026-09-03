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
 *
 * Sin terminal confirmada (Brian 02/09, segunda vuelta): una FCL por Uruguay
 * que llega en la ventana y no tiene terminal cargada no entra a ningún retiro
 * — la card la reclama arriba ("Llegan sin terminal confirmada") con MONTECON /
 * TCP a un toque. Al completarla, la fila pasa sola a los retiros
 * (derive-on-read: nada que sincronizar).
 */

import { parseLocalDate } from './shipmentTypes'
import { isPorUruguay } from './checksTypes'

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
  /** Depósito que lo recibe ('' si no está cargado). Vacío en los directos. */
  deposito: string
  /** true = CONTENEDOR directo: de la terminal al fiscal, sin depósito UY. */
  directo: boolean
  /** Destino fiscal ('' si no está cargado). Se muestra en los directos. */
  fiscal: string
}

/** Ventana: ya llegadas hace poco (el retiro es DESPUÉS del arribo) + las que
 *  vienen en los próximos 8 días (Brian 02/09: "que esa card muestre los
 *  retiros que se vienen los próximos 8 días" — eran 14; con TCP adentro la
 *  card se llenaba de filas informativas). */
export const MONTECON_DIAS_ATRAS = 5
export const MONTECON_DIAS_ADELANTE = 8

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
  /** País/zona de destino (dest_country): 'UY' = opera por Montevideo. Solo lo
   *  usa `cargasSinTerminal` — las de Buenos Aires directo o Chile no tienen
   *  terminal uruguaya que reclamar. */
  pais?: string | null
  /** SALIDA del contenedor (YYYY-MM-DD, la primera operativa o la columna).
   *  Si ya pasó, el contenedor salió de la terminal: no hay retiro pendiente. */
  salida?: string | null
  /** Depósito uruguayo al que va el contenedor (GODILCO, PLANIR…). Brian
   *  (03/09): "me gustaría que me dijera qué depósito lo tiene que retirar".
   *  Es a quién hay que avisarle el día del retiro. */
  deposito?: string | null
  /** OPERATIVA del contenedor: CONTENEDOR = va directo de la terminal al
   *  destino fiscal, sin pasar por depósito uruguayo. */
  operativa?: string | null
  /** Destino fiscal, para decir a dónde va cuando es directo. */
  fiscal?: string | null
}

/** CONTENEDOR (directo) = de la terminal al destino fiscal, sin depósito
 *  uruguayo. En esos no hay depósito al que avisarle: hay transporte. */
export function esDirecto(operativa: unknown): boolean {
  return String(operativa ?? '').trim().toUpperCase().includes('CONTENEDOR')
}

/** FCL viva: no archivada y modalidad fcl (LCL/aéreo no retiran contenedor). */
const esFclViva = (c: CargaMonteconInput): boolean =>
  !c.archived && txt(c.mode).toLowerCase() === 'fcl'

/** Ya salió de la terminal (SALIDA cargada y ≤ hoy): el retiro dejó de ser
 *  pendiente aunque nadie haya apretado RETIRADO. */
const yaSalio = (c: CargaMonteconInput, hoy: string): boolean => {
  const d = diffDias(txt(c.salida), hoy)
  return d !== null && d >= 0
}

/**
 * Las cargas FCL a retirar de terminal: MONTECON (con su estado de agenda de
 * turnos) y TCP (sin turnos — 'por_llegar' mientras viene, 'retirar' cuando
 * el buque llegó). Misma ventana para las dos terminales.
 * Orden: por llegada del buque (ETA), Montecon y TCP mezcladas; al FONDO las
 * retiradas pendientes de avisar al cliente. Una fila de agenda de una carga
 * fuera de ventana queda inocua.
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
    if (!esFclViva(c)) continue
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
        deposito: esDirecto(c.operativa) ? '' : txt(c.deposito).toUpperCase(),
        directo: esDirecto(c.operativa),
        fiscal: txt(c.fiscal).toUpperCase(),
      })
      continue
    }

    if (yaSalio(c, hoy)) continue // salió de la terminal sin pasar por RETIRADO
    const dias = diffDias(hoy, eta)
    if (dias === null) continue
    if (dias < -MONTECON_DIAS_ATRAS) continue
    let estado: EstadoAgenda
    if (terminal === 'MONTECON') {
      estado = estadoAgenda(eta, a)
      // REAGENDAR ignora el tope hacia adelante (revisión 02/09): si el buque se
      // corrió más allá de la ventana, el turno viejo sigue colgado y es justo
      // lo que hay que ver — con 8 días, un corrimiento así es lo normal.
      if (dias > MONTECON_DIAS_ADELANTE && estado !== 'reagendar') continue
    } else {
      if (dias > MONTECON_DIAS_ADELANTE) continue
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
      deposito: esDirecto(c.operativa) ? '' : txt(c.deposito).toUpperCase(),
      directo: esDirecto(c.operativa),
      fiscal: txt(c.fiscal).toUpperCase(),
    })
  }

  // Orden = llegada del buque (Brian 02/09: "deberían mostrarse en orden de
  // llegada"), sin agrupar por terminal ni por estado: Montecon y TCP mezcladas
  // por ETA. Lo urgente no se pierde: REAGENDAR va en rojo con su chip en el
  // header. Las RETIRADAS van al fondo — ya no son una llegada, son el
  // recordatorio de avisar al cliente.
  const rango = (e: EstadoAgenda) => (e === 'retirado' ? 1 : 0)
  return out.sort((a, b) => {
    if (rango(a.estado) !== rango(b.estado)) return rango(a.estado) - rango(b.estado)
    if (a.dias !== b.dias) return a.dias - b.dias
    return a.ref.localeCompare(b.ref)
  })
}

// ── Llegan sin terminal confirmada ───────────────────────────────────────

export interface CargaSinTerminal {
  dbId: string
  ref: string
  cliente: string
  cntr: string
  eta: string
  /** 0 = llega hoy · >0 = por llegar · <0 = ya llegó. */
  dias: number
}

/**
 * FCL vivas que operan por Uruguay, con la terminal VACÍA y ETA dentro de la
 * misma ventana que los retiros. Sin terminal no se sabe si hay que pelear
 * turno (Montecon) o esperar el buque (TCP): la card las reclama arriba.
 * Una terminal distinta de MONTECON/TCP (p. ej. TRP en Buenos Aires) es un
 * dato cargado, no un faltante — no entra acá. Orden: la que llega antes primero.
 */
export function cargasSinTerminal(cargas: CargaMonteconInput[], hoy: string): CargaSinTerminal[] {
  const out: CargaSinTerminal[] = []
  for (const c of cargas || []) {
    if (!esFclViva(c)) continue
    if (!isPorUruguay(c.pais)) continue
    if (txt(c.terminal)) continue
    if (yaSalio(c, hoy)) continue
    const eta = txt(c.eta)
    const dias = diffDias(hoy, eta)
    if (dias === null) continue
    if (dias < -MONTECON_DIAS_ATRAS || dias > MONTECON_DIAS_ADELANTE) continue
    out.push({
      dbId: txt(c.dbId),
      ref: txt(c.ref),
      cliente: txt(c.cliente),
      cntr: txt(c.contenedor),
      eta,
      dias,
    })
  }
  return out.sort((a, b) => (a.dias !== b.dias ? a.dias - b.dias : a.ref.localeCompare(b.ref)))
}
