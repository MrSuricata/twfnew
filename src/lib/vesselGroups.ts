// ─── ETA por buque/VIAJE (Operaciones → "ETA por buque") ────────────────
// Agrupa las cargas por buque Y por cercanía de ETA: el mismo buque puede
// venir en enero y en mayo (viajes distintos) — cambiarle la ETA a un viaje
// NO debe tocar el histórico de ese buque. Regla: dos cargas del mismo buque
// pertenecen al mismo VIAJE si sus ETAs (ordenadas) distan ≤ VOYAGE_WINDOW_DAYS
// entre consecutivas. Las cargas sin ETA (vacía o texto tipo "CONFIRMAR") van
// a un grupo aparte del buque para poder asignarles fecha a mano.

import { parseLocalDate } from './shipmentTypes'
import type { OperativasRecord } from './shipmentTypes'

/** Días máximos entre ETAs consecutivas para considerarlas el MISMO viaje. */
export const VOYAGE_WINDOW_DAYS = 25

const MS_PER_DAY = 86_400_000

export interface VoyageGroup<T> {
  /** Nombre normalizado del buque (display). */
  buque: string
  /** ETA más temprana / más tardía del viaje (ISO); '' en el grupo sin-ETA. */
  etaMin: string
  etaMax: string
  /** true = cargas del buque sin ETA parseable (asignarles fecha a mano). */
  sinEta: boolean
  ops: T[]
}

const normBuque = (b: string) => b.trim().toUpperCase().replace(/\s+/g, ' ')

/**
 * Agrupa por (buque, viaje). Genérico estructural: alcanza con { buque, eta }.
 * Cargas sin buque se ignoran. Grupos ordenados por ETA asc, sin-ETA al final.
 */
export function groupByVoyage<T extends { buque: string; eta: string }>(ops: T[]): VoyageGroup<T>[] {
  // 1) balde por buque normalizado
  const byBuque = new Map<string, T[]>()
  for (const op of ops) {
    const b = normBuque(op.buque || '')
    if (!b) continue
    const list = byBuque.get(b)
    if (list) list.push(op)
    else byBuque.set(b, [op])
  }

  const groups: VoyageGroup<T>[] = []
  for (const [buque, list] of byBuque) {
    // 2) separar con-ETA (parseable ISO) de sin-ETA
    const dated: { op: T; t: number; eta: string }[] = []
    const undated: T[] = []
    for (const op of list) {
      const d = parseLocalDate(op.eta || '')
      if (d) dated.push({ op, t: d.getTime(), eta: op.eta })
      else undated.push(op)
    }
    // 3) clusterizar por gap entre consecutivas ≤ ventana
    dated.sort((a, b) => a.t - b.t)
    let cluster: typeof dated = []
    const flush = () => {
      if (cluster.length === 0) return
      groups.push({
        buque,
        etaMin: cluster[0].eta,
        etaMax: cluster[cluster.length - 1].eta,
        sinEta: false,
        ops: cluster.map(x => x.op),
      })
      cluster = []
    }
    for (const x of dated) {
      if (cluster.length > 0 && x.t - cluster[cluster.length - 1].t > VOYAGE_WINDOW_DAYS * MS_PER_DAY) flush()
      cluster.push(x)
    }
    flush()
    if (undated.length > 0) groups.push({ buque, etaMin: '', etaMax: '', sinEta: true, ops: undated })
  }

  // 4) orden global: ETA asc, sin-ETA al final (empate por buque)
  return groups.sort((a, b) => {
    if (a.sinEta !== b.sinEta) return a.sinEta ? 1 : -1
    if (a.etaMin !== b.etaMin) return a.etaMin.localeCompare(b.etaMin)
    return a.buque.localeCompare(b.buque)
  })
}

/**
 * Patch para correr la ETA de UNA carga del viaje: columna `eta` + propagación
 * de ETA_OP a todos los contenedores del array (preservando el resto de los
 * campos — el rollup del server recomputa salida/eta_fiscal/contenedor desde el
 * MISMO array, así que nada cambia salvo la ETA). ETA_OP alimenta los chequeos
 * "salida antes de llegada", por eso debe viajar junto con la columna.
 */
export function buildEtaShiftPatch(
  op: { eta: string; operativas?: OperativasRecord[] },
  newEta: string,
): Record<string, unknown> {
  const patch: Record<string, unknown> = { eta: newEta }
  if (op.operativas && op.operativas.length > 0) {
    patch.operativas = op.operativas.map(o => ({ ...o, ETA_OP: newEta }))
  }
  return patch
}
