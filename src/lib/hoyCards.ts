/**
 * Las cards de HOY FCL, definidas UNA sola vez (spec 04/09, D7).
 *
 * Antes cada card repetía a mano su encabezado —ícono, título, color, pill del
 * contador— con tres pieles conviviendo (`accent-top` + `--bar-color`, el
 * ternario `med ? … : …`, y la piel de PanelCard). Eso hacía que agregar una
 * card fuera copiar 20 líneas de clases, y que el color de una no dijera lo
 * mismo que el de la otra.
 *
 * Acá viven el **id estable** (es lo que se guarda en `user_prefs` cuando el
 * operador pliega la card: no se puede renombrar sin dejar huérfana la
 * preferencia de todo el mundo), el título y el **tono semántico**. El color
 * concreto lo resuelve `clasesTono` de PanelCard según la marca — TWF con su
 * escala de Tailwind, Mediterránea con los tokens del manual.
 *
 * Regla de tonos (la semántica que ya tenían las cards):
 *   destructive / rojo → `alerta` · ámbar → `aviso` · sky/azul → `info` ·
 *   verde → `ok`.
 */
import type { TonoPanel } from '@/components/partner/PanelCard'

/** Id de card. Se guarda en `user_prefs.hoyFclCardsCerradas`: NO renombrar. */
export type CardHoyId =
  | 'salidas-pisadas'
  | 'retiros-terminal'
  | 'sin-liberar'
  | 'datos-incompletos'
  | 'libre-critico'
  | 'saliendo-hoy'
  | 'en-frontera'
  | 'llegando-fiscal'

export interface CardHoyDef {
  id: CardHoyId
  titulo: string
  tono: TonoPanel
  /** Subtítulo fijo de la card (las que lo arman con datos lo pasan aparte). */
  subtitulo?: string
}

/** Las cards de HOY FCL, en el orden en que se ven en pantalla. */
export const CARDS_HOY_FCL: readonly CardHoyDef[] = [
  { id: 'salidas-pisadas', titulo: 'Salidas pisadas por el buque', tono: 'alerta' },
  { id: 'retiros-terminal', titulo: 'Retiros de terminal — Montecon y TCP', tono: 'info' },
  { id: 'sin-liberar', titulo: 'Llegan sin liberar', tono: 'aviso' },
  { id: 'datos-incompletos', titulo: 'Llegan con datos incompletos', tono: 'aviso' },
  { id: 'libre-critico', titulo: 'LIBRE vencido / crítico', tono: 'alerta' },
  { id: 'saliendo-hoy', titulo: 'Saliendo hoy', tono: 'info', subtitulo: 'Camiones saliendo de Uruguay' },
  { id: 'en-frontera', titulo: 'En frontera hoy', tono: 'aviso', subtitulo: 'Estimado (salió hace 1-2 días)' },
  { id: 'llegando-fiscal', titulo: 'Llegando a fiscal hoy', tono: 'ok', subtitulo: 'Arribos a depósito fiscal' },
] as const

/** Los ids válidos — lo que `parseCardsCerradas` usa para descartar basura. */
export const IDS_CARDS_HOY_FCL: readonly CardHoyId[] = CARDS_HOY_FCL.map(c => c.id)

const POR_ID = new Map<CardHoyId, CardHoyDef>(CARDS_HOY_FCL.map(c => [c.id, c]))

/** La definición de una card. Lanza si el id no existe: es un bug de código,
 *  no un dato del usuario (los ids son literales de este mismo módulo). */
export function cardHoy(id: CardHoyId): CardHoyDef {
  const def = POR_ID.get(id)
  if (!def) throw new Error(`Card de HOY desconocida: ${id}`)
  return def
}
