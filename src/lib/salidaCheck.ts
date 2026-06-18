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

/** YYYY-MM-DD → DD/MM/YYYY para los mensajes (más legible que el ISO). */
export function fmtDMY(iso: string | undefined | null): string {
  const p = (iso || '').split('-')
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : (iso || '')
}
