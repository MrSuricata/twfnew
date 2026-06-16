import type { OperativasRecord } from './shipmentTypes'
import { parseLocalDate } from './shipmentTypes'

const firstWith = (ops: OperativasRecord[], k: keyof OperativasRecord) =>
  (ops.find(o => o[k])?.[k] as string) || ''
const datesOf = (ops: OperativasRecord[], k: 'SALIDA' | 'ETA_FISC') =>
  ops.map(o => o[k]).filter(Boolean).map(s => ({ s, d: parseLocalDate(s) })).filter(x => x.d) as { s: string; d: Date }[]

/** Resumen colapsado del array por contenedor para las columnas sueltas que leen
 *  grilla/agenda/billing/tracking. salida = más temprana · eta_fiscal = más tardía. */
export function rollupFromOperativas(ops: OperativasRecord[]) {
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
    salidaVaria: new Set(sal.map(x => x.s)).size > 1,
    etaFiscalVaria: new Set(fisc.map(x => x.s)).size > 1,
  }
}
