/**
 * Sugerencias derivadas del historial del cliente.
 *
 * La idea es que sea un ATAJO, no un invento: solo sugiere cuando el cliente
 * repite el mismo valor de forma consistente. Si viene repartido, no sugiere
 * nada — una sugerencia equivocada cuesta más que ninguna, porque se acepta
 * sin mirar.
 *
 * Se probó el mismo enfoque para el depósito de Uruguay y no da: sobre 771
 * movimientos, PLANIR y GODILCO no se separan ni por peso, ni por bultos, ni
 * por cliente (Peretti 45/55, Chiapero 32/68). Por eso el depósito se elige a
 * mano y acá solo vive el fiscal, donde 70% de los clientes sí son
 * consistentes.
 */

/** Valores que significan "todavía no se sabe" — no son un destino. */
const PLACEHOLDERS = new Set(['', '-', '--', 'N/A', '#N/A', 'NA', 'TBD', 'CONFIRMAR', 'A CONFIRMAR'])

export interface Sugerencia {
  valor: string
  /** Cargas del cliente con el dato cargado (los placeholders no cuentan). */
  muestras: number
  /** Porcentaje de esas cargas que usan el valor sugerido. */
  dominancia: number
}

export interface OpcionesSugerencia {
  /** Mínimo de cargas con dato para arriesgar una sugerencia. */
  minMuestras?: number
  /** Mínimo de repetición del valor, en porcentaje. */
  minDominancia?: number
}

const norm = (s: string | null | undefined): string => String(s || '').trim().toUpperCase()

export function sugerirPorHistorico(
  cliente: string,
  registros: { cliente: string; valor: string }[],
  { minMuestras = 3, minDominancia = 80 }: OpcionesSugerencia = {},
): Sugerencia | null {
  const objetivo = norm(cliente)
  if (!objetivo) return null

  const cuenta = new Map<string, number>()
  let total = 0
  for (const r of registros) {
    if (norm(r.cliente) !== objetivo) continue
    const v = String(r.valor ?? '').trim()
    if (PLACEHOLDERS.has(norm(v))) continue
    // Se agrupa por el texto normalizado pero se conserva el original: 'RAFAELA'
    // y 'ZP RAFAELA' son destinos distintos y no deben fusionarse.
    cuenta.set(v, (cuenta.get(v) || 0) + 1)
    total++
  }

  if (total < minMuestras) return null

  const [valor, n] = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0]
  const dominancia = (n / total) * 100
  return dominancia >= minDominancia ? { valor, muestras: total, dominancia: Math.round(dominancia) } : null
}

/** Fiscal de destino habitual del cliente, o null si no tiene uno claro. */
export function fiscalSugerido(
  cliente: string,
  operaciones: { cliente?: string | null; fiscal?: string | null }[],
  opts?: OpcionesSugerencia,
): Sugerencia | null {
  return sugerirPorHistorico(
    cliente,
    operaciones.map(o => ({ cliente: o.cliente || '', valor: o.fiscal || '' })),
    opts,
  )
}
