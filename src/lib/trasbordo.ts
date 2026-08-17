/**
 * Trasbordo — cuando la carga cambia de buque en el camino (Brian 17/08,
 * caso A7967: venía en un buque y siguió en el MSC ADELE).
 *
 * El update al cliente tiene que DECIR el trasbordo, no reportar que "el MSC
 * ADELE mantiene su fecha": para el cliente ese buque es nuevo, y lo que pasó
 * es que su carga se trasbordó y la llegada se movió.
 *
 * QUÉ CUENTA COMO TRASBORDO — y por qué no alcanza con "cambió el campo buque".
 * `audit_log` guarda solo el valor NUEVO de cada PATCH, así que un registro
 * {buque:'MSC ADELE'} puede ser tres cosas distintas (medido sobre el audit
 * real, 17/08: de 16 escrituras de buque, la mayoría NO eran trasbordos):
 *   · primera asignación ('' → MSC ADELE) — la carga siempre viajó ahí
 *   · corrección de escritura (KOTA PAHLAWAM → KOTA PAHLAWAN, mismo día;
 *     SAO PAULO EXPRESS → SAO PAULO EXPRESS 2627W, 5 segundos después)
 *   · trasbordo de verdad (ONE PARANA → ONE AMAZON)
 * Anunciarle un trasbordo inexistente a un cliente es peor que no anunciarlo,
 * así que solo se afirma con evidencia dura:
 *
 *   1. MARCA MANUAL — Nico marca el trasbordo en la fila (queda en
 *      seguimientos_log tipo 'trasbordo'). Es la verdad: él está mirando el
 *      tracking de la línea. Necesaria para las cargas cuyo último update es
 *      anterior a la app, donde el buque viejo no quedó registrado en ningún
 *      lado (caso A7967).
 *   2. LÍNEA BASE — el buque que se comunicó en el último update (seguimientos_log
 *      tipo 'enviado') distinto, POR NOMBRE BASE, del que tiene hoy.
 *   3. Sin ninguna de las dos, NO se afirma nada: si el audit muestra que el
 *      buque se tocó después del último update, se marca `sospecha` y la
 *      pantalla ofrece marcarlo — nunca lo da por hecho.
 */

import { parseSegDate } from './operationsTypes'
import { nombreBuqueBase } from './seguimientos'

/** Fila cruda de audit_log (lo que devuelve /api/data/audit-log). */
export interface AuditRow {
  ts?: string | null
  usuario?: string | null
  ref?: string | null
  details?: Record<string, unknown> | null
}

/** Un cambio de buque registrado: a QUÉ buque pasó, cuándo y quién lo cargó. */
export interface CambioBuque {
  buque: string
  /** ISO del timestamp del audit (YYYY-MM-DD). */
  fecha: string
  usuario: string
}

const limpiar = (s: unknown): string => String(s ?? '').trim()

/** Comparación de buques tolerante a la escritura: mayúsculas, espacios de
 *  más y número de viaje ("TIGER GAUCHO 0935S" y "TIGER GAUCHO" son el mismo
 *  barco). Sin esto, agregar el viaje o corregir un tipeo se leía como
 *  trasbordo (casos reales A7958 y A7892). */
export function mismoBuque(a: string | null | undefined, b: string | null | undefined): boolean {
  const norm = (s: string | null | undefined): string => {
    const t = limpiar(s).toUpperCase().replace(/\s+/g, ' ')
    return (nombreBuqueBase(t) || t).trim()
  }
  const x = norm(a)
  const y = norm(b)
  if (!x || !y) return false
  return x === y
}

/** Fecha ISO (YYYY-MM-DD) de un timestamp de audit ('2026-08-17 20:10:27+00'). */
export function fechaDeAudit(ts: string | null | undefined): string {
  const t = limpiar(ts)
  return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : ''
}

/** ISO de una fecha que puede venir en formato planilla (D/M/YYYY legacy):
 *  compararlas como strings crudos daba resultados invertidos. */
export function aIso(fecha: string | null | undefined): string {
  const d = parseSegDate(limpiar(fecha))
  if (!d) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * Cambios de buque de una carga, del más viejo al más nuevo, COLAPSANDO los
 * que son el mismo barco escrito distinto (tipeo corregido, número de viaje
 * agregado): de esos se conserva la última escritura.
 */
export function cambiosDeBuque(rows: AuditRow[]): CambioBuque[] {
  const crudos: CambioBuque[] = []
  for (const r of rows || []) {
    const d = r?.details
    if (!d || typeof d !== 'object' || !('buque' in d)) continue
    const buque = limpiar((d as Record<string, unknown>).buque)
    if (!buque) continue
    crudos.push({ buque, fecha: fechaDeAudit(r.ts), usuario: limpiar(r.usuario) })
  }
  // audit_log viene del más nuevo al más viejo; la línea de tiempo se lee al revés.
  crudos.reverse()
  const out: CambioBuque[] = []
  for (const c of crudos) {
    const prev = out[out.length - 1]
    if (prev && mismoBuque(prev.buque, c.buque)) out[out.length - 1] = c
    else out.push(c)
  }
  return out
}

export interface Trasbordo {
  /** Hay evidencia dura: el update tiene que avisar el trasbordo. */
  hubo: boolean
  /** Buque que el cliente conoce (el del último update), si se sabe. */
  anterior?: string
  /** El buque se tocó después del último update pero no se puede probar que
   *  sea un trasbordo (puede ser la primera carga del dato o una corrección):
   *  la pantalla lo ofrece para marcar a mano, no lo afirma. */
  sospecha?: boolean
}

/**
 * ¿Hay que avisarle al cliente un trasbordo?
 *
 * @param buqueActual  buque que tiene la carga hoy
 * @param marcadoManual  Nico marcó el trasbordo y todavía no salió el update
 * @param buqueUltimoEnviado  buque comunicado en el último update
 *        (seguimientos_log tipo 'enviado'); '' si nunca se mandó desde la app
 * @param cambios  cambios de buque del audit (viejo → nuevo), ya colapsados
 * @param fechaUltimoEnviado  último update al cliente (columna `seguimiento`),
 *        ISO o D/M/YYYY legacy
 */
export function detectarTrasbordo(args: {
  buqueActual?: string | null
  marcadoManual?: boolean
  buqueUltimoEnviado?: string | null
  cambios?: CambioBuque[]
  fechaUltimoEnviado?: string | null
}): Trasbordo {
  const actual = limpiar(args.buqueActual)
  if (!actual) return { hubo: false }

  // 1) Marca manual: la puso quien miró el tracking de la línea.
  if (args.marcadoManual) return { hubo: true }

  // 2) Línea base: qué buque se le dijo al cliente la última vez.
  const comunicado = limpiar(args.buqueUltimoEnviado)
  if (comunicado) {
    return mismoBuque(comunicado, actual) ? { hubo: false } : { hubo: true, anterior: comunicado }
  }

  // 3) Sin línea base no se afirma: a lo sumo se sospecha. El audit solo dice
  //    que el campo se escribió después del último update — puede ser la
  //    primera vez que se carga el buque, que no es ningún trasbordo.
  const desde = aIso(args.fechaUltimoEnviado)
  const cambios = (args.cambios || []).filter(c => c.fecha)
  if (!desde || !cambios.length) return { hubo: false }

  const posteriores = cambios.filter(c => c.fecha >= desde)
  if (!posteriores.length) return { hubo: false }
  // Si el último cambio no es el buque de hoy, el dato está desalineado.
  if (!mismoBuque(posteriores[posteriores.length - 1].buque, actual)) return { hubo: false }

  // ¿Había OTRO buque antes del último update? Eso sí prueba el cambio.
  const previos = cambios.filter(c => c.fecha < desde)
  const anterior = previos.length ? previos[previos.length - 1].buque : ''
  if (anterior && !mismoBuque(anterior, actual)) return { hubo: true, anterior }
  if (anterior) return { hubo: false } // volvió al mismo barco: no hay cambio neto
  return { hubo: false, sospecha: true }
}

// ── Historial unificado ──────────────────────────────────────────────
// El historial de la carga mezcla los updates (seguimientos_log) con los
// cambios de buque (audit): sin esto, una carga que cambió de buque pero a la
// que nunca se le mandó un update desde la app mostraba "sin historial"
// aunque el buque hubiera cambiado dos veces (caso A7967).

/** Fila de seguimientos_log, solo lo que la línea de tiempo necesita. */
export interface FilaLog {
  tipo: string
  fecha?: string
  created_at?: string
  [k: string]: unknown
}

export type EntradaHistorial =
  | { kind: 'log'; fecha: string; orden: string; row: FilaLog }
  | { kind: 'buque'; fecha: string; orden: string; buque: string; anterior?: string; usuario: string }

/** Une updates y cambios de buque en una sola línea de tiempo, del más nuevo
 *  al más viejo. `orden` desempata dentro del mismo día (los cambios de buque
 *  traen el timestamp completo del audit). */
export function lineaDeTiempo(logs: FilaLog[], cambios: CambioBuque[]): EntradaHistorial[] {
  const out: EntradaHistorial[] = (logs || []).map(r => {
    const fecha = aIso(r.fecha) || limpiar(r.created_at).slice(0, 10)
    return { kind: 'log' as const, fecha, orden: limpiar(r.created_at) || fecha, row: r }
  })
  const orden = (cambios || []).filter(c => c.fecha)
  orden.forEach((c, i) => {
    const prev = orden[i - 1]
    out.push({
      kind: 'buque',
      fecha: c.fecha,
      orden: c.fecha,
      buque: c.buque,
      // Solo es trasbordo si cambió de barco de verdad (no un tipeo).
      ...(prev && !mismoBuque(prev.buque, c.buque) ? { anterior: prev.buque } : {}),
      usuario: c.usuario,
    })
  })
  return out.sort((a, b) => {
    if (a.fecha !== b.fecha) return a.fecha < b.fecha ? 1 : -1
    return a.orden < b.orden ? 1 : a.orden > b.orden ? -1 : 0
  })
}
