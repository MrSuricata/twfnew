/** Minimal per-container operativas record (fields used by rollup). */
interface OpRow {
  SALIDA?: string
  ETA_FISC?: string
  DEPOSITO?: string
  OPERATIVA?: string
  DESCARGA?: string
  DEV?: string
  CNTR_OP?: string
  [k: string]: unknown
}

/** Parse a date string (YYYY-MM-DD or ISO) safely. Returns null for blank /
 *  unparseable / CONFIRMAR / junk — never throws. */
function parseLocalDate(s: string): Date | null {
  if (!s || s.trim() === '') return null
  const parts = s.split('-')
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10)
    const m = parseInt(parts[1], 10)
    const d = parseInt(parts[2], 10)
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      const dt = new Date(y, m - 1, d)
      if (!isNaN(dt.getTime())) return dt
    }
  }
  // Fallback for ISO timestamps
  const dt = new Date(s)
  if (isNaN(dt.getTime())) return null
  dt.setHours(0, 0, 0, 0)
  return dt
}

const firstWith = (ops: OpRow[], k: keyof OpRow): string =>
  (ops.find(o => o[k])?.[k] as string) || ''

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
  }
}
