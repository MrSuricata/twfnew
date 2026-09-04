/**
 * La carga que el partner tenía a mano cuando algo no le funcionó.
 *
 * El contexto es la mitad del valor de un comentario (spec 04/09, D2): "no me
 * dejó marcar el retiro" sin la ref no se puede reproducir. Los portales de
 * depósito y transporte NO tienen una ficha por carga abierta —son listas con
 * acciones por fila—, así que "la carga que tenía abierta" es, en concreto, la
 * ÚLTIMA sobre la que actuó: la fila donde apretó "Retiré", "Devolví" o donde
 * estaba escribiendo el Nº de stock. Es justo el momento en el que algo puede
 * fallar y hacer que abra la caja de comentarios.
 *
 * Por eso esto es un registro de módulo y no un estado de React: lo escriben
 * las filas (que están en un árbol) y lo lee la caja (que vive en el armazón),
 * sin pasar props por seis niveles ni meter un context nuevo.
 *
 * La ref VENCE: si alguien tocó una fila hace media hora y recién ahora
 * escribe, decir que el comentario es sobre esa carga sería inventar. Mejor
 * sin ref que con una ref equivocada.
 */

/** Cuánto vale la ref recordada. Más que esto ya no es "lo que estaba haciendo". */
export const VENTANA_FOCO_MS = 10 * 60_000

let ultima: { ref: string; t: number } | null = null

/** Una fila recibió una acción del partner. Ref vacía = se olvida. */
export function recordarRefEnFoco(ref: string | null | undefined, ahora: number = Date.now()): void {
  const r = String(ref ?? '').trim().toUpperCase()
  ultima = r ? { ref: r, t: ahora } : null
}

/** La ref en foco, o '' si no hay o ya venció. */
export function refEnFoco(ahora: number = Date.now()): string {
  if (!ultima) return ''
  if (ahora - ultima.t > VENTANA_FOCO_MS) return ''
  return ultima.ref
}

/** Borra el registro (cambio de usuario, logout, tests). */
export function olvidarRefEnFoco(): void {
  ultima = null
}
