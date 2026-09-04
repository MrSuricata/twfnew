/**
 * Estado de las cards plegables con memoria por usuario (spec 04/09, D7).
 *
 * Se guarda SOLO la lista de ids CERRADAS. Por eso:
 *  · Default = todo abierto: un usuario sin preferencia (o una card nueva que
 *    todavía no existía cuando guardó) ve la card desplegada sin migrar nada.
 *  · Un id que ya no existe se descarta al leer (`idsValidos` manda).
 *  · Lo que venga del server o del localStorage puede ser basura (otra
 *    versión, edición manual): se parsea a la defensiva, nunca se confía.
 *
 * Puro, sin React ni fetch: el hook `useCardsPlegadas` lo envuelve.
 */

/** Lo que ve una card: ¿estoy abierta? y "me tocaron el header". */
export interface CardsPlegadas {
  estaAbierta: (id: string) => boolean
  /** Sin `abierta` alterna; con `abierta` fija el estado pedido (lo que
   *  manda el header de PanelPlegable en cada toque). */
  toggle: (id: string, abierta?: boolean) => void
}

/** Lista de ids cerradas a partir de lo guardado (prefs / storage). Basura → []. */
export function parseCardsCerradas(raw: unknown, idsValidos: readonly string[]): readonly string[] {
  if (!Array.isArray(raw)) return []
  const validos = new Set(idsValidos)
  const out: string[] = []
  for (const v of raw) {
    if (typeof v !== 'string' || !validos.has(v) || out.includes(v)) continue
    out.push(v)
  }
  return out
}

export function cardAbierta(cerradas: readonly string[], id: string): boolean {
  return !cerradas.includes(id)
}

/**
 * La lista con `id` en el estado pedido. Si no cambia nada devuelve la MISMA
 * referencia: así el hook sabe que no hay que re-renderizar ni guardar.
 */
export function conCardAbierta(cerradas: readonly string[], id: string, abierta: boolean): readonly string[] {
  const cerrada = cerradas.includes(id)
  if (abierta === !cerrada) return cerradas
  return abierta ? cerradas.filter(c => c !== id) : [...cerradas, id]
}

/** Alterna `id`. */
export function alternarCard(cerradas: readonly string[], id: string): readonly string[] {
  return conCardAbierta(cerradas, id, !cardAbierta(cerradas, id))
}

/**
 * Lo que el usuario tocó ANTES de que llegaran las prefs del server se aplica
 * encima de lo que llegó: el server es la base, los toques locales son lo más
 * nuevo. Sin esto, plegar una card en el primer segundo se deshacía solo.
 */
export function aplicarToques(
  cerradas: readonly string[],
  toques: Iterable<readonly [id: string, abierta: boolean]>,
): readonly string[] {
  let out = cerradas
  for (const [id, abierta] of toques) out = conCardAbierta(out, id, abierta)
  return out
}
