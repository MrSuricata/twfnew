// Guarda de recencia para el refresco de fondo de camiones.
//
// Problema (race confirmada): un refresh de fondo (`refreshTrucksFromDb`) trae
// la verdad de la DB, pero su GET puede leer la tabla ANTES de que el POST de
// una creación recién hecha haya commiteado. Cuando el GET vuelve, las guardas
// de generación (escrituras DURANTE el fetch) y de `pendingWrites` (escrituras
// EN VUELO) ya pasaron — el POST terminó y la generación no cambió — así que el
// snapshot stale pisa el camión recién creado en estado + localStorage.
//
// Fix: no aplicar el refresh si hubo una escritura local de camiones dentro de
// los últimos `recencyMs` ANTES de que arrancara el fetch (cuando el GET leyó
// la DB). En ese caso el estado local es más confiable que el GET.

export const TRUCKS_WRITE_RECENCY_MS = 5000

/**
 * Decide si un refresh de fondo puede pisar el estado local de camiones/cargas.
 *
 * @param pendingWrites  escrituras en vuelo (contador). >0 → NO aplicar.
 * @param fetchStartTs   `Date.now()` capturado justo antes de arrancar el GET.
 * @param lastWriteTs    `Date.now()` de la última escritura local (0 si nunca).
 * @param recencyMs      ventana de protección (default 5s).
 * @returns true si es seguro aplicar el snapshot de la DB; false si hay que
 *          conservar el estado local (escritura en vuelo o muy reciente).
 */
export function canApplyTrucksRefresh(
  pendingWrites: number,
  fetchStartTs: number,
  lastWriteTs: number,
  recencyMs: number = TRUCKS_WRITE_RECENCY_MS,
): boolean {
  if (pendingWrites > 0) return false
  // Si el fetch arrancó dentro de la ventana posterior a una escritura local
  // (o incluso ANTES de una escritura más nueva → diferencia negativa), el GET
  // puede ser stale → no aplicar.
  return fetchStartTs - lastWriteTs >= recencyMs
}
