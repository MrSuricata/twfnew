/**
 * Reglas de la subida de fotos por lote.
 *
 * Brian (18/08/2026): "necesito poder subir más fotos, ahora solo me deja 10".
 * El 10 era un tope de UI heredado, no una limitación real: cada foto va en su
 * propio request, ya comprimida a ~800px, así que el límite de body de Vercel
 * ni se roza. Lo que sí escala mal es el TIEMPO (era estrictamente secuencial)
 * y el manejo de errores, y eso es lo que se arregla acá.
 *
 * Dos decisiones que no son obvias:
 *
 * 1. NO ES TODO O NADA. Antes, elegir 11 fotos —o que UNA pesara 10.1MB—
 *    descartaba la selección entera y encima el input ya estaba limpio, así que
 *    había que volver a elegir todo desde cero. Ahora se separa lo que se puede
 *    subir de lo que no, se sube lo que se puede y se dice exactamente qué
 *    quedó afuera y por qué.
 *
 * 2. EL TOPE ES POR TIEMPO, NO POR TAMAÑO. Cada foto tarda ~1-1,5s (medido
 *    sobre las subidas reales de julio/agosto). Con TANDA=3 en paralelo, 40
 *    fotos son ~20s. Un tope mucho más alto dejaría al usuario 2 minutos
 *    mirando un botón deshabilitado sin poder cancelar.
 */

/** Fotos por lote. Antes 10; el pedido de Brian es poder mandar la operativa
 *  entera de una. */
export const MAX_FOTOS_POR_LOTE = 40

/** Por archivo, ANTES de comprimir. Una foto de celular moderna entra holgada. */
export const MAX_BYTES_FOTO = 10 * 1024 * 1024

/** Cuántas subidas en paralelo. Más no acelera (el cuello es Storage) y
 *  empieza a competir con el resto de la app. */
export const TANDA = 3

export interface SeleccionFotos {
  /** Las que se van a subir. */
  aceptadas: File[]
  /** Superan MAX_BYTES_FOTO. */
  pesadas: File[]
  /** Entraron por encima del tope del lote. */
  sobrantes: File[]
}

/**
 * Separa la selección en lo que se sube y lo que queda afuera.
 *
 * Orden: primero se descartan las pesadas (no se pueden subir de ninguna
 * manera), y recién sobre las que quedan se aplica el tope del lote. Al revés,
 * una foto pesada podría "ocupar" un lugar del cupo y dejar afuera a una válida.
 */
export function clasificarSeleccion(
  files: File[],
  max = MAX_FOTOS_POR_LOTE,
  maxBytes = MAX_BYTES_FOTO,
): SeleccionFotos {
  const pesadas = files.filter(f => f.size > maxBytes)
  const validas = files.filter(f => f.size <= maxBytes)
  return {
    aceptadas: validas.slice(0, max),
    pesadas,
    sobrantes: validas.slice(max),
  }
}

/** Mensaje de lo que quedó afuera, o '' si entró todo. Se muestra como aviso,
 *  no como error: la subida igual arranca. */
export function avisoDescartes(sel: SeleccionFotos, max = MAX_FOTOS_POR_LOTE): string {
  const partes: string[] = []
  if (sel.pesadas.length > 0) {
    partes.push(`${sel.pesadas.length} pesa${sel.pesadas.length > 1 ? 'n' : ''} más de 10MB`)
  }
  if (sel.sobrantes.length > 0) {
    partes.push(`${sel.sobrantes.length} pasa${sel.sobrantes.length > 1 ? 'n' : ''} del máximo de ${max} por vez`)
  }
  return partes.join(' · ')
}

/** Parte la lista en tandas de `n` para subir con paralelismo acotado. */
export function enTandas<T>(items: T[], n = TANDA): T[][] {
  if (n < 1) return items.length ? [items] : []
  const out: T[][] = []
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n))
  return out
}

/**
 * Sube todo lo que pueda y NO aborta al primer error: con lotes grandes, que
 * una foto rota se lleve puestas las otras 39 es peor que subir 39 y avisar.
 *
 * @param items   qué subir
 * @param subir   la subida de UNO (puede tirar)
 * @param onAvance se llama con la cantidad REALMENTE terminada (no la lanzada:
 *                 el contador viejo mostraba 10/10 con la última todavía en vuelo)
 */
export async function subirEnTandas<T, R>(
  items: T[],
  subir: (item: T, index: number) => Promise<R>,
  onAvance?: (hechas: number, total: number) => void,
  tanda = TANDA,
): Promise<{ ok: R[]; errores: { index: number; error: Error }[] }> {
  const ok: R[] = []
  const errores: { index: number; error: Error }[] = []
  let hechas = 0
  let base = 0

  for (const grupo of enTandas(items, tanda)) {
    const res = await Promise.allSettled(grupo.map((it, j) => subir(it, base + j)))
    res.forEach((r, j) => {
      hechas++
      if (r.status === 'fulfilled') ok.push(r.value)
      else errores.push({ index: base + j, error: r.reason instanceof Error ? r.reason : new Error(String(r.reason)) })
    })
    base += grupo.length
    onAvance?.(hechas, items.length)
  }
  return { ok, errores }
}
