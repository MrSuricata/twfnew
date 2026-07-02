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

// ── Ventana de escritura compartida (camiones + cargas + deletes) ──
//
// Por qué no alcanzaba con lo anterior: la guarda de recencia se apoyaba en
// contadores/marcas POR MITAD (trucks vs truck_loads) y los DELETE ni siquiera
// contaban como escritura en vuelo. El guardado del armador es una secuencia
// multi-paso (DELETEs → POST trucks → POST truck_loads) y, con el timbre de
// Realtime activo, el propio cliente refetchea en el medio: un refetch podía
// aplicar una mitad mientras la otra seguía en vuelo (snapshot "torn") o pasar
// la guarda porque el DELETE lento era invisible para pendingWrites.
//
// Esta ventana es UNA para todo el dominio camiones: se abre AL INICIO de cada
// escritura (antes del estado optimista), se mantiene abierta mientras haya
// CUALQUIER escritura en vuelo (contador, deletes incluidos) y queda una cola
// de `trailMs` después de que la última termina. Mientras esté abierta, ningún
// refetch de fondo aplica NADA (ni trucks ni loads).

export const TRUCKS_WRITE_TRAIL_MS = 2000

export interface TrucksWriteWindow {
  /** Marca el inicio de una escritura. Devuelve el cierre (idempotente). */
  begin(now?: number): (endNow?: number) => void
  /** true si hay escrituras en vuelo o estamos dentro de la cola post-escritura. */
  isOpen(now?: number): boolean
  /** ms hasta que la ventana cierre (con escrituras en vuelo devuelve trailMs como piso). */
  remainingMs(now?: number): number
  /** Escrituras en vuelo (para diagnóstico/tests). */
  inFlight(): number
}

export function createTrucksWriteWindow(trailMs: number = TRUCKS_WRITE_TRAIL_MS): TrucksWriteWindow {
  let inFlight = 0
  let quietUntil = 0
  return {
    begin(_now: number = Date.now()) {
      inFlight += 1
      let ended = false
      return (endNow: number = Date.now()) => {
        if (ended) return // cierre idempotente: un finally doble no descuenta dos veces
        ended = true
        inFlight = Math.max(0, inFlight - 1)
        quietUntil = Math.max(quietUntil, endNow + trailMs)
      }
    },
    isOpen(now: number = Date.now()) {
      return inFlight > 0 || now < quietUntil
    },
    remainingMs(now: number = Date.now()) {
      if (inFlight > 0) return trailMs
      return Math.max(0, quietUntil - now)
    },
    inFlight() {
      return inFlight
    },
  }
}
