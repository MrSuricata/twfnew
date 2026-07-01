/** Minimal per-container operativas record (fields used by rollup). */
interface OpRow {
  SALIDA?: string
  ETA_FISC?: string
  DEPOSITO?: string
  OPERATIVA?: string
  DESCARGA?: string
  DEV?: string
  CNTR_OP?: string
  PKGS?: number | string
  KG?: number | string
  M3?: number | string
  [k: string]: unknown
}

/** Parse a strict ISO date (YYYY-M-D) safely. Returns null for blank /
 *  unparseable / CONFIRMAR / junk — never throws.
 *  IMPORTANTE: mismo criterio ESTRICTO que parseLocalDate en
 *  src/lib/shipmentTypes.ts (el cliente). Se descartó el fallback new Date(s)
 *  porque aceptaba basura ('2/7' → año equivocado) que el cliente rechaza, y así
 *  el rollup del servidor podía elegir una salida/eta_fiscal distinta a la del
 *  cliente para la misma carga. Server y cliente deben coincidir exacto. */
function parseLocalDate(s: string): Date | null {
  if (!s) return null
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s.trim())
  if (!m) return null
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return isNaN(dt.getTime()) ? null : dt
}

const firstWith = (ops: OpRow[], k: keyof OpRow): string =>
  (ops.find(o => o[k])?.[k] as string) || ''

const sumOf = (ops: OpRow[], k: 'PKGS' | 'KG' | 'M3'): number =>
  ops.reduce((acc, o) => acc + (Number(o[k]) || 0), 0)

const datesOf = (ops: OpRow[], k: 'SALIDA' | 'ETA_FISC'): { s: string; d: Date }[] =>
  ops
    .map(o => o[k] as string | undefined)
    .filter(Boolean)
    .map(s => ({ s: s as string, d: parseLocalDate(s as string) }))
    .filter((x): x is { s: string; d: Date } => x.d !== null)

/** Collapsed rollup of the per-container array for the flat columns read by
 *  the grid / agenda / billing / tracking.
 *  salida = earliest departure · eta_fiscal = latest fiscal arrival.
 *  Mirror of src/lib/operativasRollup.ts — kept in sync manually. */
export function rollupFromOperativasApi(ops: OpRow[]): {
  salida: string
  eta_fiscal: string
  deposito: string
  operativa: string
  descarga: string
  dev: string
  contenedor: string
  pkgs: number
  kg: number
  m3: number
} {
  const sal = datesOf(ops, 'SALIDA').sort((a, b) => a.d.getTime() - b.d.getTime())
  const fisc = datesOf(ops, 'ETA_FISC').sort((a, b) => a.d.getTime() - b.d.getTime())
  return {
    salida: sal[0]?.s || firstWith(ops, 'SALIDA'),
    eta_fiscal: fisc[fisc.length - 1]?.s || firstWith(ops, 'ETA_FISC'),
    deposito: firstWith(ops, 'DEPOSITO'),
    operativa: firstWith(ops, 'OPERATIVA'),
    descarga: firstWith(ops, 'DESCARGA'),
    dev: firstWith(ops, 'DEV'),
    contenedor: ops.map(o => o.CNTR_OP).filter(Boolean).join(', '),
    // Peso/Volumen/Bultos TOTAL = suma de los contenedores.
    pkgs: sumOf(ops, 'PKGS'),
    kg: sumOf(ops, 'KG'),
    m3: sumOf(ops, 'M3'),
  }
}
