/**
 * El DESPACHANTE de una carga — el de destino, el que la libera.
 *
 * Brian (02/09/2026): "el despachante es por carga, pero puede sugerir como
 * hacemos con el transporte según historial". Y la aclaración que ordena todo:
 * "Navatta es el despachante de Uruguay, el único prácticamente que usamos;
 * Pedraja hace los consolidados. Pero el despachante al que me refiero es el
 * de Argentina, que es el que libera la carga".
 *
 * O sea: este campo (columna `despacho`, que ya existía en el modelo y nadie
 * usaba) es el despachante EN DESTINO. Es por carga, porque un cliente puede
 * cambiarlo, pero casi siempre repite: por eso se sugiere el que ese cliente
 * viene usando, igual que el reparto de transportes mira el historial.
 *
 * Puro y testeable.
 */

/** Lo mínimo que se necesita de una carga para sugerir. */
export interface CargaConDespachante {
  cliente?: string | null
  despacho?: string | null
  fiscal?: string | null
  /** Para desempatar por lo más reciente: ETA o fecha de alta (ISO). */
  eta?: string | null
  archived?: boolean | null
}

const txt = (v: unknown): string => String(v ?? '').trim()
const key = (v: unknown): string => txt(v).toUpperCase().replace(/[.,]/g, '').replace(/\s+/g, ' ')

/** Los despachantes ya usados, ordenados por uso (para el combo). */
export function despachantesUsados(cargas: CargaConDespachante[]): string[] {
  const uso = new Map<string, { nombre: string; n: number }>()
  for (const c of cargas || []) {
    const d = txt(c?.despacho)
    if (!d) continue
    const k = key(d)
    const prev = uso.get(k)
    if (prev) prev.n++
    else uso.set(k, { nombre: d, n: 1 })
  }
  return [...uso.values()].sort((a, b) => b.n - a.n || a.nombre.localeCompare(b.nombre, 'es')).map(v => v.nombre)
}

export interface SugerenciaDespachante {
  valor: string
  /** Por qué se sugiere, en palabras: "3 de las últimas 4 de este cliente". */
  motivo: string
  /** 'cliente' pesa más que 'fiscal': el cliente elige a su despachante. */
  origen: 'cliente' | 'fiscal'
}

/** Cuántas cargas del mismo cliente se miran hacia atrás. */
export const HISTORIAL_CARGAS = 8

const recientesPrimero = (a: CargaConDespachante, b: CargaConDespachante) =>
  txt(b.eta).localeCompare(txt(a.eta))

function masUsado(cargas: CargaConDespachante[]): { nombre: string; n: number; total: number } | null {
  const conDato = cargas.filter(c => txt(c.despacho))
  if (conDato.length === 0) return null
  const uso = new Map<string, { nombre: string; n: number }>()
  for (const c of conDato) {
    const d = txt(c.despacho)
    const k = key(d)
    const prev = uso.get(k)
    if (prev) prev.n++
    else uso.set(k, { nombre: d, n: 1 })
  }
  // Empate: gana el de la carga más reciente (conDato ya viene ordenado).
  const ordenado = [...uso.values()].sort((a, b) => b.n - a.n)
  const top = ordenado[0]
  if (ordenado.length > 1 && ordenado[1].n === top.n) {
    const ultimo = txt(conDato[0].despacho)
    const gana = ordenado.find(o => key(o.nombre) === key(ultimo))
    if (gana) return { ...gana, total: conDato.length }
  }
  return { ...top, total: conDato.length }
}

/**
 * Qué despachante proponerle a una carga nueva: el que ese cliente viene
 * usando; si el cliente no tiene historial, el habitual de ese depósito
 * fiscal. Nunca escribe solo — es una sugerencia con su motivo a la vista.
 */
export function despachanteSugerido(
  cliente: string | null | undefined,
  fiscal: string | null | undefined,
  cargas: CargaConDespachante[],
  limite = HISTORIAL_CARGAS,
): SugerenciaDespachante | null {
  const vivas = (cargas || []).filter(c => c && !c.archived)

  const kCliente = key(cliente)
  if (kCliente) {
    const delCliente = vivas.filter(c => key(c.cliente) === kCliente).sort(recientesPrimero).slice(0, limite)
    const top = masUsado(delCliente)
    if (top) {
      const motivo = top.n === top.total
        ? (top.total === 1 ? 'la última carga de este cliente' : `las últimas ${top.total} de este cliente`)
        : `${top.n} de las últimas ${top.total} de este cliente`
      return { valor: top.nombre, motivo, origen: 'cliente' }
    }
  }

  const kFiscal = key(fiscal)
  if (kFiscal) {
    const delFiscal = vivas.filter(c => key(c.fiscal) === kFiscal).sort(recientesPrimero).slice(0, limite)
    const top = masUsado(delFiscal)
    if (top) {
      return { valor: top.nombre, motivo: `el que más entra en ${txt(fiscal)}`, origen: 'fiscal' }
    }
  }

  return null
}
