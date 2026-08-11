/**
 * Sugerencias derivadas del historial del cliente.
 *
 * La idea es que sea un ATAJO, no un invento: solo sugiere cuando el cliente
 * repite el mismo destino de forma consistente. Si viene repartido, no sugiere
 * nada y en su lugar muestra los últimos destinos, que es información sin
 * riesgo — una sugerencia equivocada cuesta más que ninguna, porque se acepta
 * sin mirar.
 *
 * Se probó el mismo enfoque para el depósito de Uruguay y no da: sobre 771
 * movimientos, PLANIR y GODILCO no se separan ni por peso, ni por bultos, ni
 * por cliente (Peretti 45/55, Chiapero 32/68). Por eso el depósito se elige a
 * mano y acá solo vive el fiscal, donde la mayoría de los clientes sí repiten.
 */

/** Valores que significan "todavía no se sabe" — no son un destino. */
const PLACEHOLDERS = new Set(['', '-', '--', 'N/A', '#N/A', 'NA', 'TBD', 'CONFIRMAR', 'A CONFIRMAR'])

/** Prefijos de zona que no cambian el destino: ZP RAFAELA es RAFAELA. */
const PREFIJOS_ZONA = /^(?:ZP|ZF|ZONA PRIMARIA|ZONA FRANCA)\s+(.+)$/

/**
 * Lo que sigue a un guión, una coma o "DEV" es información extra (dónde se
 * devuelve, dónde descarga, en qué planta), no un fiscal distinto:
 * "RAFAELA - DEV ROSARIO" y "RAFAELA" son el mismo destino.
 */
const SUFIJO_EXTRA = /\s+-\s+|,\s*|\s+DEV\s+/

export interface Sugerencia {
  valor: string
  /** Cargas del cliente con el dato cargado (los placeholders no cuentan). */
  muestras: number
  /** Porcentaje de esas cargas que van al destino sugerido. */
  dominancia: number
}

export interface OpcionesSugerencia {
  /** Mínimo de cargas con dato para arriesgar una sugerencia. */
  minMuestras?: number
  /** Mínimo de repetición del valor, en porcentaje. */
  minDominancia?: number
}

const norm = (s: string | null | undefined): string => String(s || '').trim().toUpperCase()

const sinAcentos = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '')

/**
 * Clave con la que se agrupan las variantes de un mismo destino. Solo se usa
 * para contar: lo que se muestra y se guarda es siempre la variante que el
 * equipo escribe más seguido, no esta forma normalizada.
 */
export function claveFiscal(v: string): string {
  const base = sinAcentos(norm(v)).replace(/\s+/g, ' ').split(SUFIJO_EXTRA)[0].trim()
  const m = PREFIJOS_ZONA.exec(base)
  return m && m[1].trim() ? m[1].trim() : base
}

interface Registro {
  cliente: string
  valor: string
  /** Para ordenar por recencia (ISO o dd/MM/yyyy). Opcional. */
  fecha?: string
}

/** Registros del cliente con dato real, ya filtrados. */
function delCliente(cliente: string, registros: Registro[]): Registro[] {
  const objetivo = norm(cliente)
  if (!objetivo) return []
  return registros.filter(r =>
    norm(r.cliente) === objetivo && !PLACEHOLDERS.has(norm(r.valor)))
}

export function sugerirPorHistorico(
  cliente: string,
  registros: Registro[],
  { minMuestras = 3, minDominancia = 80 }: OpcionesSugerencia = {},
): Sugerencia | null {
  const propios = delCliente(cliente, registros)
  if (propios.length < minMuestras) return null

  // Se cuenta por clave (RAFAELA agrupa a ZP RAFAELA) pero se guarda cada
  // variante escrita, para poder devolver la más habitual como etiqueta.
  const grupos = new Map<string, { total: number; variantes: Map<string, number> }>()
  for (const r of propios) {
    const k = claveFiscal(r.valor)
    if (!k) continue
    const g = grupos.get(k) || { total: 0, variantes: new Map<string, number>() }
    const v = String(r.valor).trim()
    g.total++
    g.variantes.set(v, (g.variantes.get(v) || 0) + 1)
    grupos.set(k, g)
  }

  const total = [...grupos.values()].reduce((a, g) => a + g.total, 0)
  if (total < minMuestras) return null

  const [, mejor] = [...grupos.entries()].sort((a, b) => b[1].total - a[1].total)[0]
  const dominancia = (mejor.total / total) * 100
  if (dominancia < minDominancia) return null

  const valor = [...mejor.variantes.entries()].sort((a, b) => b[1] - a[1])[0][0]
  return { valor, muestras: total, dominancia: Math.round(dominancia) }
}

/**
 * Últimos destinos distintos del cliente, del más reciente al más viejo.
 * Es lo que se muestra cuando no hay un destino dominante: no decide nada,
 * pero evita tener que ir a buscar el historial a otra pantalla.
 */
export function ultimosValores(cliente: string, registros: Registro[], n = 4): string[] {
  const propios = delCliente(cliente, registros)
  const conFecha = propios
    .map((r, i) => ({ ...r, i, t: Date.parse(String(r.fecha || '')) }))
    .sort((a, b) => {
      const ta = isNaN(a.t) ? -Infinity : a.t
      const tb = isNaN(b.t) ? -Infinity : b.t
      return tb - ta || b.i - a.i        // sin fecha: se respeta el orden de entrada
    })

  const vistos = new Set<string>()
  const out: string[] = []
  for (const r of conFecha) {
    const k = claveFiscal(r.valor)
    if (!k || vistos.has(k)) continue
    vistos.add(k)
    out.push(String(r.valor).trim())
    if (out.length >= n) break
  }
  return out
}

type OpFiscal = { cliente?: string | null; fiscal?: string | null; eta?: string | null }

const aRegistros = (ops: OpFiscal[]): Registro[] =>
  ops.map(o => ({ cliente: o.cliente || '', valor: o.fiscal || '', fecha: o.eta || '' }))

/** Fiscal de destino habitual del cliente, o null si no tiene uno claro. */
export function fiscalSugerido(
  cliente: string,
  operaciones: OpFiscal[],
  opts?: OpcionesSugerencia,
): Sugerencia | null {
  return sugerirPorHistorico(cliente, aRegistros(operaciones), opts)
}

/** Últimos fiscales usados por el cliente, del más reciente al más viejo. */
export function fiscalesRecientes(cliente: string, operaciones: OpFiscal[], n = 4): string[] {
  return ultimosValores(cliente, aRegistros(operaciones), n)
}
