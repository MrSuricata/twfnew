/**
 * Acta de trasiego — las novedades de una operativa, POR CONTENEDOR.
 *
 * Pedido de Brian (18/08/2026): "quiero un check de ciertos puntos —diferencia
 * de bultos, embalaje deteriorado, bultos con humedad, mercadería a la vista—
 * y un campo de comentario. Que las fotos, checks y comentarios sean por
 * contenedor, así puedo cargar diferentes días y dejar registro por cada
 * trasiego."
 *
 * Dos decisiones que vienen de ahí:
 *
 * 1. LA UNIDAD ES EL CONTENEDOR, NO LA CARGA. La planilla guarda los
 *    contenedores en UN string ("EGSU0310260, EMCU1818703"), y una carga se
 *    trasiega en días distintos, un contenedor por vez. Colgar el acta de la
 *    ref mezclaría dos trasiegos que no tienen nada que ver. (Este mismo error
 *    ya se cometió: la primera versión de EN DEPÓSITO etiquetó una foto de
 *    A8025 con los DOS contenedores a la vez.)
 *
 * 2. ES UN LOG, NO UN ESTADO. Cada visita agrega un acta nueva; no se pisa la
 *    anterior. Por eso "registro por cada trasiego" — el historial es el dato,
 *    igual que en seguimientos_log.
 *
 * Los checks son NOVEDADES: marcado = pasó algo. Un acta sin ninguno marcado y
 * con o sin comentario significa que salió sin problemas, y vale igual como
 * registro de que se estuvo ahí.
 */

import { parseCntr } from './cntrUtils'

export type CheckActaKey =
  | 'diferencia_bultos'
  | 'embalaje_deteriorado'
  | 'bultos_humedad'
  | 'mercaderia_a_la_vista'

export interface CheckActaDef {
  key: CheckActaKey
  label: string
}

/** Los cuatro puntos de Brian, en su orden. Agregar uno es agregar una línea
 *  acá: `checks` es jsonb, no hay que migrar la tabla. */
export const CHECKS_ACTA: CheckActaDef[] = [
  { key: 'diferencia_bultos', label: 'Diferencia de bultos' },
  { key: 'embalaje_deteriorado', label: 'Embalaje deteriorado' },
  { key: 'bultos_humedad', label: 'Bultos con humedad' },
  { key: 'mercaderia_a_la_vista', label: 'Mercadería a la vista' },
]

export const CHECK_KEYS: CheckActaKey[] = CHECKS_ACTA.map(c => c.key)

/** Fila de `deposito_actas` tal como la devuelve la API. */
export interface ActaDeposito {
  id?: string
  ref: string
  /** UN contenedor. '' = toda la carga (cargas sin contenedor cargado). */
  contenedor: string
  fecha: string
  checks: Partial<Record<string, boolean>>
  comentario: string
  usuario?: string | null
  created_at?: string | null
}

/** Lo que se está editando en pantalla antes de guardarse. */
export interface BorradorActa {
  checks: Record<string, boolean>
  comentario: string
}

const txt = (v: unknown): string => String(v ?? '').trim()
const norm = (v: unknown): string => txt(v).toUpperCase()

/**
 * Contenedores de una carga, para armar una fila por cada uno.
 *
 * Sin contenedor cargado devuelve [''] y NO una lista vacía: esa carga
 * igual se trasiega y hay que poder sacarle fotos. El '' es "toda la carga".
 */
export function contenedoresDeCarga(cntr: string | null | undefined): string[] {
  const lista = parseCntr(String(cntr || ''))
  return lista.length > 0 ? lista : ['']
}

/** Los checks marcados, en el orden del catálogo. Las claves desconocidas
 *  (de versiones viejas) se ignoran al leer. */
export function checksMarcados(acta: ActaDeposito): CheckActaDef[] {
  const c = acta?.checks || {}
  return CHECKS_ACTA.filter(def => c[def.key] === true)
}

/** ¿El acta reporta alguna novedad? El comentario solo no cuenta: se puede
 *  comentar "salió todo bien". */
export function hayNovedades(acta: ActaDeposito): boolean {
  return checksMarcados(acta).length > 0
}

/** Una línea para mostrar el acta en una lista. */
export function resumenActa(acta: ActaDeposito): string {
  const marcados = checksMarcados(acta).map(c => c.label).join(' · ')
  const com = txt(acta?.comentario)
  if (marcados && com) return `${marcados} — ${com}`
  if (marcados) return marcados
  if (com) return com
  return 'Sin novedades'
}

/** Actas de un contenedor de una carga, de la más nueva a la más vieja. */
export function actasDe(actas: ActaDeposito[], ref: string, contenedor: string): ActaDeposito[] {
  const r = norm(ref)
  const c = norm(contenedor)
  return (actas || [])
    .filter(a => norm(a.ref) === r && norm(a.contenedor) === c)
    .sort((a, b) => {
      const ka = txt(a.created_at) || txt(a.fecha)
      const kb = txt(b.created_at) || txt(b.fecha)
      return ka < kb ? 1 : ka > kb ? -1 : 0
    })
}

/** La última acta de ese contenedor, o null. */
export function ultimaActa(actas: ActaDeposito[], ref: string, contenedor: string): ActaDeposito | null {
  return actasDe(actas, ref, contenedor)[0] || null
}

/** Borrador limpio: todos los checks en false. */
export function actaVacia(): BorradorActa {
  const checks: Record<string, boolean> = {}
  for (const k of CHECK_KEYS) checks[k] = false
  return { checks, comentario: '' }
}

/** ¿Hay algo para guardar? Un acta totalmente vacía solo ensucia el historial. */
export function tieneContenido(b: BorradorActa): boolean {
  if (txt(b?.comentario)) return true
  return CHECK_KEYS.some(k => b?.checks?.[k] === true)
}
