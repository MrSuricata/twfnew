/**
 * EN DEPÓSITO — qué cargas tengo acá para sacarles fotos.
 *
 * Pedido de Brian (18/08/2026, parado en el depósito): "apretar un botón y
 * cargar las fotos a una referencia". Hoy para subir una foto hay que ir a
 * Operaciones, buscar la ref, abrir la carga y recién ahí el chip de la cámara.
 * Con el celular en una mano y el contenedor abriéndose, eso no se hace.
 *
 * Esta pantalla resuelve UNA cosa: elegir la carga rápido. El criterio de qué
 * es "operativa de depósito" NO se reinventa — se reusa el de /mirendimiento
 * (`esOperativaDeposito` + `fechaDeOperativa`), que ya está decidido y testeado.
 *
 * VENTANA, no solo hoy: una herramienta de campo que abre vacía no sirve. El
 * trasiego se corre un día, la SALIDA de la planilla no siempre es el día que
 * uno va, y muchas veces las fotos se suben al otro día. Por eso entra desde
 * unos días atrás hasta la semana que viene, ordenado con lo de hoy arriba. Y
 * si igual no está, el buscador de la pantalla llega a cualquiera de la ventana.
 */

import { esOperativaDeposito, fechaDeOperativa, type CargaRendimiento } from './miRendimiento'
import { parseCntr } from './cntrUtils'
import { parseLocalDate } from './shipmentTypes'

/** Días hacia atrás: las fotos suelen subirse al otro día. */
export const DIAS_ATRAS = 3
/** Días hacia adelante: lo que viene esta semana. */
export const DIAS_ADELANTE = 7

export type Cuando = 'hoy' | 'futura' | 'pasada'

/** Un contenedor de la carga, con SU fecha. La carga entera no tiene "una"
 *  fecha: cada contenedor sale en su propio camión y su propio día (A8025:
 *  el EMCU salió el 18 y el EGSU el 19 — con una sola fecha, el trasiego de
 *  HOY quedaba invisible, Brian 19/08). */
export interface BloqueCntr {
  cntr: string
  fecha: string
  /** null = sin fecha usable para este contenedor. */
  dias: number | null
  cuando: Cuando | null
}

export interface CargaEnDeposito {
  ref: string
  cliente: string
  deposito: string
  operativa: string
  cntr: string
  /** La fecha MÁS RELEVANTE entre sus contenedores: hoy le gana a todo,
   *  después lo que viene (más cerca primero), después lo que pasó. */
  fecha: string
  /** 0 = hoy · >0 = por venir · <0 = ya pasó. */
  dias: number
  cuando: Cuando
  /** Todos los contenedores con su propia fecha (para el badge por bloque). */
  bloques: BloqueCntr[]
}

const txt = (v: unknown): string => String(v ?? '').trim()
const MS_DIA = 86_400_000

/** Días enteros entre dos ISO (b - a). null si alguna no parsea. */
function diffDias(desde: string, hasta: string): number | null {
  const a = parseLocalDate(desde)
  const b = parseLocalDate(hasta)
  if (!a || !b) return null
  const medianoche = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return Math.round((medianoche(b) - medianoche(a)) / MS_DIA)
}

/**
 * Las cargas con operativa de depósito dentro de la ventana, ordenadas para el
 * campo: lo de HOY arriba, después lo que viene (más cerca primero), y al final
 * lo que ya pasó (lo más reciente primero).
 */
export function cargasEnDeposito(
  cargas: CargaRendimiento[],
  hoy: string,
  opts: { atras?: number; adelante?: number } = {},
): CargaEnDeposito[] {
  const atras = opts.atras ?? DIAS_ATRAS
  const adelante = opts.adelante ?? DIAS_ADELANTE

  const cuandoDe = (d: number): Cuando => (d === 0 ? 'hoy' : d > 0 ? 'futura' : 'pasada')

  const out: CargaEnDeposito[] = []
  for (const c of cargas || []) {
    if (!esOperativaDeposito(c)) continue

    // UNA FECHA POR CONTENEDOR: la de su fila en Operativas; sin fila propia,
    // la de la carga. La tarjeta entra a la ventana si ALGUNO de sus
    // contenedores cae adentro.
    const lista = parseCntr(txt(c.cntr))
    const cntrs = lista.length > 0 ? lista : ['']
    const bloques: BloqueCntr[] = cntrs.map(cntr => {
      const fecha = fechaDeOperativa(c, cntr || undefined)
      const dias = diffDias(hoy, fecha)
      return { cntr, fecha, dias, cuando: dias === null ? null : cuandoDe(dias) }
    })

    const enVentana = bloques.filter(b => b.dias !== null && b.dias >= -atras && b.dias <= adelante) as (BloqueCntr & { dias: number })[]
    // Sin ningún contenedor ubicable en la ventana: afuera. Es el único
    // descarte silencioso, y es inevitable — no hay dónde ponerla.
    if (enVentana.length === 0) continue

    // La tarjeta toma la fecha MÁS RELEVANTE: hoy > la futura más próxima >
    // la pasada más reciente. Así el trasiego de HOY sube arriba aunque otro
    // contenedor de la misma carga haya salido ayer.
    const mejor = enVentana.sort((a, b) => {
      const r = (d: number) => (d === 0 ? 0 : d > 0 ? 1 : 2)
      if (r(a.dias) !== r(b.dias)) return r(a.dias) - r(b.dias)
      return r(a.dias) === 2 ? b.dias - a.dias : a.dias - b.dias
    })[0]

    out.push({
      ref: txt(c.ref),
      cliente: txt(c.cliente),
      deposito: txt(c.deposito),
      operativa: txt(c.operativa),
      cntr: txt(c.cntr),
      fecha: mejor.fecha,
      dias: mejor.dias,
      cuando: cuandoDe(mejor.dias),
      bloques,
    })
  }

  const rango = (d: number) => (d === 0 ? 0 : d > 0 ? 1 : 2)
  return out.sort((a, b) => {
    const ra = rango(a.dias)
    const rb = rango(b.dias)
    if (ra !== rb) return ra - rb
    // Las pasadas al revés: ayer antes que hace tres días.
    if (ra === 2 && a.dias !== b.dias) return b.dias - a.dias
    if (a.dias !== b.dias) return a.dias - b.dias
    return a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0
  })
}

/** Busca en ref, cliente, depósito y contenedor. */
export function filtrarCargas(lista: CargaEnDeposito[], texto: string): CargaEnDeposito[] {
  const t = txt(texto).toLowerCase()
  if (!t) return lista
  return (lista || []).filter(c =>
    [c.ref, c.cliente, c.deposito, c.cntr].some(v => v.toLowerCase().includes(t)),
  )
}

/** 'Hoy' · 'Mañana' · 'Ayer' · 'En 3 días' · 'Hace 3 días'. */
export function etiquetaCuando(dias: number): string {
  if (dias === 0) return 'Hoy'
  if (dias === 1) return 'Mañana'
  if (dias === -1) return 'Ayer'
  return dias > 0 ? `En ${dias} días` : `Hace ${Math.abs(dias)} días`
}
