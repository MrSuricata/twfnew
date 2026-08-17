/**
 * Bitácora de gestiones por carga (tabla ref_notas) — helpers puros.
 *
 * "Reclamado por wpp al cliente", "reclamado a la agencia"… con quién y
 * cuándo. Append-only: el ESTADO del reclamo es la última nota; si la última
 * no es de hoy, la fecha se pinta en ámbar (Brian 17/08: "así vemos también
 * actualización de estado si no se reclamó hoy").
 */

import { normalizeRef } from './checksTypes'

export interface NotaRef {
  ref: string
  texto: string
  usuario?: string | null
  created_at?: string
}

/** Última nota por ref (las filas vienen ordenadas más-nueva-primero). */
export function ultimaNotaPorRef(rows: NotaRef[]): Map<string, NotaRef> {
  const m = new Map<string, NotaRef>()
  for (const r of rows) {
    const k = normalizeRef(r.ref)
    if (!m.has(k)) m.set(k, r)
  }
  return m
}

/** ¿El timestamp (ISO/timestamptz) cae en el día local de `hoy`? */
export function esDeHoy(createdAt: string | undefined | null, hoy: Date): boolean {
  if (!createdAt) return false
  const d = new Date(createdAt)
  if (isNaN(d.getTime())) return false
  return d.getFullYear() === hoy.getFullYear() && d.getMonth() === hoy.getMonth() && d.getDate() === hoy.getDate()
}

/** "hoy 11:32" · "ayer 15:40" · "14/08 09:10" — día y hora de la gestión. */
export function fmtCuando(createdAt: string | undefined | null, hoy: Date): string {
  if (!createdAt) return ''
  const d = new Date(createdAt)
  if (isNaN(d.getTime())) return ''
  const hora = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (esDeHoy(createdAt, hoy)) return `hoy ${hora}`
  const ayer = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 1)
  if (d.getFullYear() === ayer.getFullYear() && d.getMonth() === ayer.getMonth() && d.getDate() === ayer.getDate()) {
    return `ayer ${hora}`
  }
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${hora}`
}
