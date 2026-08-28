import { parseLocalDate } from './shipmentTypes'

/**
 * ¿La salida de MVD quedó ANTERIOR a la llegada de la carga a MVD?
 *
 * Una carga no puede salir de Montevideo antes de llegar. Si la ETA (llegada a
 * MVD) se corre después de coordinar la salida, ésta queda "colgada" → hay que
 * revisarla. Comparación por DÍA (ignora hora). Si falta alguna de las dos
 * fechas, devuelve false: no hay con qué comparar, no se alerta (no inventamos).
 *
 * @param salida  fecha de salida MVD (YYYY-MM-DD)
 * @param eta     fecha de llegada a MVD del contenedor (ETA_OP) o de la carga (ETA)
 */
export function isSalidaBeforeArrival(salida: string | undefined | null, eta: string | undefined | null): boolean {
  const s = parseLocalDate((salida || '').trim())
  const e = parseLocalDate((eta || '').trim())
  if (!s || !e) return false
  s.setHours(0, 0, 0, 0)
  e.setHours(0, 0, 0, 0)
  return s.getTime() < e.getTime()
}

/**
 * ETA VIGENTE para comparar contra la salida coordinada.
 *
 * Cuando el buque se atrasa, la fecha nueva se carga en la ETA de la CARGA
 * (columna `eta` — la edita la ficha y la actualizan los syncs). La copia por
 * contenedor (ETA_OP) queda congelada al hornear y nadie la vuelve a tocar.
 * Comparar contra ETA_OP hacía que una salida pisada por el buque atrasado no
 * alertara (caso A7995, 13/08: buque corrido del 07 al 15/08, ETA_OP en 07/08).
 *
 * Regla: la ETA de la carga si es una fecha parseable; si no, la del contenedor.
 */
export function etaVigente(
  etaCarga: string | undefined | null,
  etaOp: string | undefined | null,
): string {
  const c = (etaCarga || '').trim()
  if (parseLocalDate(c)) return c
  return (etaOp || '').trim()
}

/** YYYY-MM-DD → DD/MM/YYYY para los mensajes (más legible que el ISO). */
export function fmtDMY(iso: string | undefined | null): string {
  const p = (iso || '').split('-')
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : (iso || '')
}

/**
 * Días mínimos entre la llegada del buque a MVD y la salida del camión.
 *
 * Regla de Brian (10/08/2026): "lo normal es que sea dos días después de que
 * llegue el buque por lo menos". Entre que el buque atraca, descarga, se
 * liberan los documentos y el depósito coordina el retiro, salir el mismo día
 * o al siguiente casi nunca se sostiene. Menos margen que esto se avisa.
 */
export const MARGEN_SALIDA_DIAS = 2

/**
 * Días entre la llegada a MVD y la salida coordinada.
 * Negativo = la salida quedó ANTES de que llegue el buque (imposible).
 * null cuando falta alguna de las dos fechas: no se inventa.
 */
export function margenSalida(
  salida: string | undefined | null,
  eta: string | undefined | null,
): number | null {
  const s = parseLocalDate((salida || '').trim())
  const e = parseLocalDate((eta || '').trim())
  if (!s || !e) return null
  s.setHours(0, 0, 0, 0)
  e.setHours(0, 0, 0, 0)
  return Math.round((s.getTime() - e.getTime()) / 86_400_000)
}

/** ¿La salida está apretada contra la llegada (menos del margen mínimo)? */
export function isSalidaAjustada(
  salida: string | undefined | null,
  eta: string | undefined | null,
): boolean {
  const d = margenSalida(salida, eta)
  return d !== null && d >= 0 && d < MARGEN_SALIDA_DIAS
}

/** ¿Retiro directo desde terminal? (OPERATIVA 'CONTENEDOR' / 'CONTENEDOR DIRECTO…'). */
const esDirecta = (operativa: string | undefined | null): boolean =>
  String(operativa || '').trim().toUpperCase().startsWith('CONTENEDOR')

/**
 * Texto del aviso, o '' si la salida tiene margen suficiente.
 *
 * La regla depende de la OPERATIVA (Brian 28/08): el retiro DIRECTO desde
 * terminal tiene su propia ventana — ETA+1 o ETA+2 es lo normal (el mismo día
 * tal vez no descargó y "se pisa"; después de ETA+2 quedó fuera de la ventana
 * de retiro de terminal). El trasiego mantiene el margen mínimo de 2 días
 * (regla 10/08: descarga + liberación + coordinación del depósito).
 * Sin operativa se asume trasiego: es el caso común y el conservador.
 */
export function avisoSalida(
  salida: string | undefined | null,
  eta: string | undefined | null,
  operativa?: string | null,
): string {
  const d = margenSalida(salida, eta)
  if (d === null) return ''
  if (d < 0) return 'Salida ANTES de la llegada a MVD — revisar fecha'
  if (esDirecta(operativa)) {
    if (d === 0) return 'Sale el MISMO día que llega el buque — tal vez no descargó, se pisa (el directo se retira ETA+1 o ETA+2)'
    if (d > MARGEN_SALIDA_DIAS) return `Retiro a ${d} días de la llegada — el directo se retira de terminal hasta ETA+2`
    return ''
  }
  if (d === 0) return 'Sale el MISMO día que llega el buque — sin margen para retirar'
  if (d < MARGEN_SALIDA_DIAS) return `Sale a ${d} día de la llegada — lo normal son ${MARGEN_SALIDA_DIAS}`
  return ''
}

/**
 * Nota POSITIVA para el chip (Brian 28/08: "aclarar que está OK porque es
 * contenedor"): un directo saliendo en su ventana ETA+1/ETA+2 no es una salida
 * apretada — es exactamente como se hace. '' para todo lo demás.
 */
export function notaSalidaDirectaOk(
  salida: string | undefined | null,
  eta: string | undefined | null,
  operativa?: string | null,
): string {
  if (!esDirecta(operativa)) return ''
  const d = margenSalida(salida, eta)
  if (d !== 1 && d !== 2) return ''
  return `Retiro directo a ${d === 1 ? '1 día' : '2 días'} de la llegada — ventana normal ✓`
}
