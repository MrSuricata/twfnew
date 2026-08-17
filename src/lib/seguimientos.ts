/**
 * Cola de seguimientos — qué cargas hay que actualizarle al cliente HOY.
 *
 * Regla de Brian (13/08/2026): Nico manda un update semanal por cada carga que
 * viaja en buque y todavía no llegó a su puerto (MVD, BsAs o Chile). Mira dónde
 * viene el buque, corrige la ETA en la webapp y manda el mail. Cuando la carga
 * llega, no se avisa más.
 *
 * Entra a la cola una carga que:
 *  - no está archivada,
 *  - viaja en buque (FCL o LCL — aéreo/terrestre no tienen seguimiento semanal),
 *  - su ETA está vacía o es HOY o futura (si ya pasó, llegó: afuera),
 *  - está realmente EN VIAJE o por llegar: embarcada (ETD pasado, no más de
 *    120 días — ningún viaje marítimo dura más) o con ETA dentro de 21 días.
 *    Sin este corte, las cargas viejas sin fechas parseables quedaban "en
 *    viaje" eternamente y la cola abría con cientos de muertas (medido
 *    13/08: 343 → 93 con el corte), y
 *  - nunca se le envió seguimiento (🔴 primero) o el último fue hace 7+ días.
 *
 * El resto de las cargas vivas con seguimiento fresco cuentan como "al día".
 *
 * NOTA: la cola lee la tabla `shipments` (FCL + LCL unificadas). Las LCL del
 * manager legacy (tabla lcl_air, pestaña Camiones) NO entran — si el equipo
 * sigue dando de alta LCL por ahí, esas cargas quedan fuera del seguimiento
 * semanal. Pendiente confirmar con Brian cuál es el alta vigente.
 */

import { parseLocalDate } from './shipmentTypes'
import { SEGUIMIENTO_DIAS, parseSegDate } from './operationsTypes'

export interface CargaSeguimiento {
  dbId?: string | null
  ref: string
  cliente?: string | null
  buque?: string | null
  /** Línea marítima + BL + contenedores → link de tracking de la línea. */
  linea?: string | null
  docNumber?: string | null
  cntr?: string | null
  etd?: string | null
  eta?: string | null
  /** Fecha del último seguimiento enviado ('' = nunca). ISO o D/M/YYYY legacy. */
  seguimiento?: string | null
  pais?: string | null
  mode?: string | null
  archived?: boolean
}

export interface FilaSeguimiento {
  carga: CargaSeguimiento
  /** Días desde el último seguimiento. null = nunca se envió. */
  dias: number | null
}

export interface ColaSeguimientos {
  /** Las que hay que enviar hoy, ordenadas: nunca-enviadas primero, después
   *  las más atrasadas; a igualdad, la ETA más próxima arriba. */
  pendientes: FilaSeguimiento[]
  /** Cargas en viaje con seguimiento fresco (< 7 días). */
  alDia: number
}

const MS_DIA = 86_400_000

/** Con ETA a más de esto, el update semanal todavía no arranca (si no embarcó). */
export const SEGUIMIENTO_ETA_PROX_DIAS = 21
/** Embarque más viejo que esto = dato muerto, no un viaje en curso. */
export const SEGUIMIENTO_ETD_MAX_DIAS = 120

const medianoche = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate())

/** ¿Es una carga que viaja en buque? El seguimiento semanal es marítimo. */
const esMaritima = (mode: string | null | undefined): boolean => {
  const m = String(mode || '').toLowerCase()
  return m === 'fcl' || m === 'lcl'
}

export function colaSeguimientos(cargas: CargaSeguimiento[], hoy: Date): ColaSeguimientos {
  const h = medianoche(hoy)
  const pendientes: FilaSeguimiento[] = []
  let alDia = 0

  for (const c of cargas) {
    if (c.archived) continue
    if (!esMaritima(c.mode)) continue

    // Ya llegó a su puerto → no se avisa más.
    const eta = parseLocalDate(String(c.eta || '').trim())
    if (eta && medianoche(eta).getTime() < h.getTime()) continue

    // En viaje de verdad: embarcada (ETD pasado y no fósil) o llegando dentro
    // de SEGUIMIENTO_ETA_PROX_DIAS. Cargas en origen lejano o sin fechas
    // parseables quedan afuera — no hay buque que reportar.
    const etd = parseLocalDate(String(c.etd || '').trim())
    const etdDias = etd ? (h.getTime() - medianoche(etd).getTime()) / MS_DIA : null
    const embarcada = etdDias !== null && etdDias >= 0 && etdDias <= SEGUIMIENTO_ETD_MAX_DIAS
    const llegaPronto = eta !== null &&
      (medianoche(eta).getTime() - h.getTime()) / MS_DIA <= SEGUIMIENTO_ETA_PROX_DIAS
    if (!embarcada && !llegaPronto) continue

    const seg = parseSegDate(String(c.seguimiento || ''))
    if (!seg) {
      pendientes.push({ carga: c, dias: null })
      continue
    }
    const dias = Math.floor((h.getTime() - medianoche(seg).getTime()) / MS_DIA)
    if (dias >= SEGUIMIENTO_DIAS) pendientes.push({ carga: c, dias })
    else alDia++
  }

  pendientes.sort((a, b) => {
    // nunca-enviadas primero, después por atraso descendente
    const da = a.dias === null ? Number.POSITIVE_INFINITY : a.dias
    const db = b.dias === null ? Number.POSITIVE_INFINITY : b.dias
    if (da !== db) return db - da
    // empate → la que llega antes, arriba (sin ETA al final del empate)
    const ta = parseLocalDate(String(a.carga.eta || ''))?.getTime() ?? Number.POSITIVE_INFINITY
    const tb = parseLocalDate(String(b.carga.eta || ''))?.getTime() ?? Number.POSITIVE_INFINITY
    if (ta !== tb) return ta - tb
    return a.carga.ref.localeCompare(b.carga.ref)
  })

  return { pendientes, alDia }
}

/** Grupo de destino para encabezar la cola (los updates salen en tandas). */
export function grupoDestino(pais: string | null | undefined): string {
  const p = String(pais || '').trim().toUpperCase()
  if (p === 'UY') return 'Montevideo'
  if (p === 'AR') return 'Buenos Aires'
  if (p === 'CL') return 'Chile'
  return 'Otros destinos'
}

/** Orden fijo de los grupos en pantalla. */
export const ORDEN_GRUPOS = ['Montevideo', 'Buenos Aires', 'Chile', 'Otros destinos']

// ─── Texto del update (formato de los mails reales de Nicolás) ───────────
// Extraído de sus mails (13/08/2026): "Estimados, buenas tardes. Les informo
// que el buque X sigue rumbo según lo previsto. La ETA al puerto de Montevideo
// se mantiene para el día 04/10/2026. Volveremos con novedades a la brevedad.
// Saludos" — y la variante "se actualiza la ETA ... para el día X" cuando la
// fecha cambió.

const fmtDMYtexto = (iso: string): string => {
  const p = iso.split('-')
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso
}

export function textoUpdate(args: {
  buque: string
  /** Puerto de destino para el texto ("Montevideo", "Buenos Aires", "San Antonio"…). */
  puerto: string
  etaISO: string
  /** true = la ETA cambió en esta sesión → "se actualiza"; false = "se mantiene". */
  actualizada: boolean
  /** La carga cambió de buque desde el último update: el mensaje tiene que
   *  avisar el TRASBORDO, no reportar que el buque nuevo "mantiene" su fecha
   *  (para el cliente ese buque no existía). `anterior` va cuando se sabe. */
  trasbordo?: { anterior?: string }
  /** Hora local para el saludo (default: ahora). */
  hora?: number
}): string {
  const hora = args.hora ?? new Date().getHours()
  const saludo = hora < 13 ? 'buenos días' : 'buenas tardes'
  const fecha = fmtDMYtexto(args.etaISO)
  const desde = args.trasbordo?.anterior ? ` del buque ${args.trasbordo.anterior}` : ''
  const cuerpo = args.trasbordo
    ? `Les informo que la carga fue trasbordada${desde} al buque ${args.buque}. Según lo indicado por la web de la línea marítima, la ETA al puerto de ${args.puerto} pasa a ser el día ${fecha}.`
    : args.actualizada
      ? `Les informo que, según lo indicado por la web de la línea marítima, se actualiza la ETA del buque ${args.buque} al puerto de ${args.puerto} para el día ${fecha}.`
      : `Les informo que el buque ${args.buque} sigue rumbo según lo previsto. La ETA al puerto de ${args.puerto} se mantiene para el día ${fecha}.`
  return `Estimados, ${saludo}.\n\n${cuerpo}\n\nVolveremos con novedades a la brevedad.\n\nSaludos`
}

/** Nombre del buque sin el número de viaje ("TIGER GAUCHO 0935S" → "TIGER
 *  GAUCHO") — para buscarlo en MarineTraffic. */
export function nombreBuqueBase(buque: string | null | undefined): string {
  return String(buque || '').trim().replace(/\s+\S*\d\S*$/, '').trim()
}

// ─── Historial (tabla seguimientos_log) ──────────────────────────────────

export interface SeguimientoLogRow {
  id?: string
  ref: string
  /** 'enviado' = update al cliente (con foto de eta/buque) · 'eta' = cambio de
   *  ETA desde la cola · 'deshecho' = un 'enviado' que se deshizo (no salió) ·
   *  'trasbordo' = la carga cambió de buque y hay que avisarlo en el update. */
  tipo: 'enviado' | 'eta' | 'deshecho' | 'trasbordo'
  fecha?: string
  eta_anterior?: string | null
  eta_nueva?: string | null
  buque?: string | null
  usuario?: string | null
  created_at?: string
}
