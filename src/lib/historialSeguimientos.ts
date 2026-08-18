/**
 * Historial de seguimientos — la pestaña "Historial" de Seguimientos.
 *
 * Pedido de Brian (18/08/2026): "que se muestre en la parte de seguimientos una
 * pestañita con el seguimiento que se envió y el día, así tenemos historial".
 *
 * El dato ya existía: cada acción de la cola escribe en `seguimientos_log`
 * (ver SeguimientosBoard.logSeguimiento). Lo que faltaba era la VISTA global —
 * hasta ahora el historial solo se podía ver carga por carga, desplegando el
 * botón 🕐 de cada fila.
 *
 * Se muestran los 4 tipos, con el filtro arrancando en 'enviado' (decisión de
 * Brian, 18/08): la lista corta es la que pidió, pero el cambio de ETA es lo
 * que EXPLICA el update de ese día ("se corrió del 12/09 al 19/09") y ya se
 * está guardando. Esconderlo sería tirar dato que ya está pago.
 *
 * Todo acá es puro y recibe `hoy` por parámetro: la pantalla queda testeable
 * sin congelar el reloj.
 */

import { parseLocalDate } from './shipmentTypes'

export type TipoEvento = 'enviado' | 'eta' | 'trasbordo' | 'deshecho'

/** Fila cruda de `seguimientos_log` (snake_case, como la devuelve la API). */
export interface FilaLog {
  id?: string
  ref: string
  tipo: string
  fecha?: string | null
  eta_anterior?: string | null
  eta_nueva?: string | null
  buque?: string | null
  usuario?: string | null
  created_at?: string | null
}

export interface Evento extends FilaLog {
  /** Día del evento (YYYY-MM-DD). '' cuando la fila no trae ninguna fecha. */
  dia: string
  /** Desempate dentro del mismo día (timestamp de inserción). */
  orden: string
  /** Cliente de la carga: no vive en el log, se pega desde las cargas en
   *  memoria. '' si la ref ya no está en el listado. */
  cliente: string
}

export interface GrupoDia {
  dia: string
  etiqueta: string
  eventos: Evento[]
}

export interface FiltroHistorial {
  /** Tipos a mostrar. Vacío o ausente = todos (destildar el último checkbox
   *  no puede dejar la pantalla en blanco sin explicación). */
  tipos?: string[]
  /** Busca en ref, cliente, buque y usuario. */
  texto?: string
}

export const TIPOS_TODOS: TipoEvento[] = ['enviado', 'eta', 'trasbordo', 'deshecho']
export const SOLO_ENVIADOS: TipoEvento[] = ['enviado']

/** Etiqueta corta de cada tipo, para los chips del filtro y de cada fila. */
export const ETIQUETA_TIPO: Record<string, string> = {
  enviado: 'Update enviado',
  eta: 'ETA corregida',
  trasbordo: 'Trasbordo',
  deshecho: 'Deshecho',
}

const ISO = /^\d{4}-\d{2}-\d{2}$/
const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

const isoDe = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * Día del evento. `fecha` manda (es la fecha de negocio, la que el operador
 * ve); `created_at` es el respaldo. Una `fecha` con texto libre — las hay
 * legacy, tipo 'CONFIRMAR' — no se toma por buena: se cae al timestamp.
 * Sin ninguna de las dos devuelve '', y la fila NO se descarta: aparece
 * agrupada bajo "Sin fecha". Esconderla sería el mismo truncado mudo que ya
 * mordió en las fotos.
 */
export function diaDeFila(row: FilaLog): string {
  const f = String(row?.fecha || '').trim()
  if (ISO.test(f)) return f
  const c = String(row?.created_at || '').trim().slice(0, 10)
  return ISO.test(c) ? c : ''
}

/** Filas crudas → eventos ordenados del más nuevo al más viejo, con el cliente
 *  pegado. Las filas sin fecha quedan al final ('' ordena último). */
export function armarEventos(rows: FilaLog[], clientePorRef?: Map<string, string>): Evento[] {
  const eventos: Evento[] = (rows || []).map(r => {
    const dia = diaDeFila(r)
    return {
      ...r,
      dia,
      orden: String(r?.created_at || '').trim() || dia,
      cliente: clientePorRef?.get(String(r?.ref || '').trim().toUpperCase()) || '',
    }
  })
  return eventos.sort((a, b) => {
    if (a.dia !== b.dia) return a.dia < b.dia ? 1 : -1
    return a.orden < b.orden ? 1 : a.orden > b.orden ? -1 : 0
  })
}

/** Aplica el filtro de tipos + la búsqueda de texto. */
export function filtrarEventos(eventos: Evento[], filtro: FiltroHistorial): Evento[] {
  const tipos = filtro?.tipos && filtro.tipos.length > 0 ? new Set(filtro.tipos) : null
  const texto = String(filtro?.texto || '').trim().toLowerCase()
  return (eventos || []).filter(e => {
    if (tipos && !tipos.has(e.tipo)) return false
    if (!texto) return true
    return [e.ref, e.cliente, e.buque, e.usuario]
      .some(v => String(v || '').toLowerCase().includes(texto))
  })
}

/** 'Hoy' · 'Ayer' · 'martes 11/08' (con año si es de otro año). */
export function etiquetaDia(dia: string, hoy: string): string {
  if (!dia) return 'Sin fecha'
  if (dia === hoy) return 'Hoy'
  const d = parseLocalDate(dia)
  if (!d) return 'Sin fecha'
  const h = parseLocalDate(hoy)
  if (h) {
    const ayer = new Date(h.getFullYear(), h.getMonth(), h.getDate() - 1)
    if (isoDe(ayer) === dia) return 'Ayer'
  }
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const otroAnio = !h || d.getFullYear() !== h.getFullYear()
  return `${DIAS_SEMANA[d.getDay()]} ${dd}/${mm}${otroAnio ? `/${d.getFullYear()}` : ''}`
}

/** Agrupa por día conservando el orden que trae la lista (por eso pide eventos
 *  ya ordenados: los arma `armarEventos`). */
export function agruparPorDia(eventos: Evento[], hoy: string): GrupoDia[] {
  const grupos: GrupoDia[] = []
  for (const e of eventos || []) {
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo.dia === e.dia) ultimo.eventos.push(e)
    else grupos.push({ dia: e.dia, etiqueta: etiquetaDia(e.dia, hoy), eventos: [e] })
  }
  return grupos
}
