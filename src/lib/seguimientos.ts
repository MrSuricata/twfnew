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
 *  - su ETA está vacía, es HOY o futura — o quedó VENCIDA sin señales de
 *    llegada real (salida/descarga/fiscal vacías): esas siguen en la cola
 *    marcadas "¿llegó?" unos días, porque un buque atrasado u omitido que
 *    nadie corrigió no es una llegada (caso SAN FRANCISCA 26/08),
 *  - está realmente EN VIAJE o por llegar: embarcada (ETD pasado, no más de
 *    120 días — ningún viaje marítimo dura más) o con ETA dentro de 21 días.
 *    Sin este corte, las cargas viejas sin fechas parseables quedaban "en
 *    viaje" eternamente y la cola abría con cientos de muertas (medido
 *    13/08: 343 → 93 con el corte), y
 *  - nunca se le envió seguimiento (🔴 primero) o el último fue hace 7+ días.
 *
 * El resto de las cargas vivas con seguimiento fresco cuentan como "al día".
 *
 * DOS COLAS (Brian 04/09/2026): la regla de arriba no cambia, pero el trabajo
 * se parte por MODALIDAD — FCL (Nico) y LCL (el equipo de consolidados) son
 * dos rutinas distintas y cada uno abre en la suya (`area`). El progreso del
 * día también se cuenta por área: mezclarlas contaminaba el porcentaje con
 * cargas que no son de quien lo mira.
 *
 * NOTA: la cola lee la tabla `shipments` (FCL + LCL). El alta vigente de LCL
 * es esa: verificado con datos el 04/09/2026 — `lcl_air_shipments` tiene UNA
 * fila, de mayo, contra 444 LCL en `shipments` (la última, de hoy). El manager
 * legacy (tabla lcl_air, pestaña Camiones) quedó muerto: no hay nada afuera de
 * la cola por ese lado ni nada que migrar.
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
  /** Señales de llegada REAL (cualquiera cargada = el buque efectivamente
   *  llegó): fecha de salida del depósito, de descarga, o de arribo fiscal. */
  salida?: string | null
  descarga?: string | null
  etaFiscal?: string | null
}

export interface FilaSeguimiento {
  carga: CargaSeguimiento
  /** Días desde el último seguimiento. null = nunca se envió. */
  dias: number | null
  /** Días que la ETA lleva VENCIDA sin señales de llegada — el caso "¿llegó?"
   *  (buque atrasado u omitido que nadie corrigió). Ausente en cargas en viaje. */
  etaVencidaDias?: number
}

/** Progreso del día en UN área (el % que mira quien está laburando). */
export interface ProgresoDia {
  /** Updates que ya salieron hoy (la carga quedó sellada con la fecha de hoy). */
  enviados: number
  /** Los que faltan = pendientes.length. */
  faltan: number
  /** enviados + faltan. 0 = no hay trabajo del día. */
  total: number
  /** Porcentaje entero de avance; 0 cuando no hay trabajo. */
  pct: number
}

export interface ColaSeguimientos {
  /** Las que hay que enviar hoy, ordenadas: nunca-enviadas primero, después
   *  las más atrasadas; a igualdad, la ETA más próxima arriba. */
  pendientes: FilaSeguimiento[]
  /** Cargas en viaje con seguimiento fresco (< 7 días), como FILAS con las
   *  mismas acciones que las pendientes (Brian 27/08, caso A7995: Nico labura
   *  proactivo y necesita verlas/tocarlas sin ir al modal de Operaciones).
   *  Ordenadas: más próximas a vencer primero; a igualdad, ETA más próxima. */
  alDia: FilaSeguimiento[]
  /** Cuánto se avanzó hoy EN ESTA ÁREA. */
  progreso: ProgresoDia
}

const MS_DIA = 86_400_000

/** Con ETA a más de esto, el update semanal todavía no arranca (si no embarcó). */
export const SEGUIMIENTO_ETA_PROX_DIAS = 21
/** Embarque más viejo que esto = dato muerto, no un viaje en curso. */
export const SEGUIMIENTO_ETD_MAX_DIAS = 120
/** ETA vencida SIN señales de llegada: la carga queda en la cola marcada
 *  "¿llegó?" hasta este tope de días (después es deuda vieja, no trabajo). */
export const SEGUIMIENTO_ETA_VENCIDA_DIAS = 10

const medianoche = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate())

/** Área de trabajo de la cola: cada modalidad es una rutina y un equipo. */
export type AreaSeguimiento = 'fcl' | 'lcl'

/** Áreas en el orden del selector. */
export const AREAS_SEGUIMIENTO: { id: AreaSeguimiento; label: string }[] = [
  { id: 'fcl', label: 'FCL' },
  { id: 'lcl', label: 'LCL' },
]

/** Última área elegida a mano, por navegador (misma idea que 'twf-hoy-area'). */
export const SEGUIMIENTOS_AREA_KEY = 'twf-seguimientos-area'

/** Área de una carga. null = no viaja en buque (aéreo/terrestre no tienen
 *  seguimiento semanal) y queda fuera de las dos colas. */
export function areaDeCarga(mode: string | null | undefined): AreaSeguimiento | null {
  const m = String(mode || '').trim().toLowerCase()
  return m === 'fcl' || m === 'lcl' ? m : null
}

/**
 * Área con la que abre el tablero. Mismo criterio que el selector de área de
 * HOY: manda el `home_area` del usuario (el equipo LCL entra en la suya aunque
 * en este navegador se haya mirado otra), después la última elección guardada,
 * y si no hay nada, FCL. Los home_area que no son un área de la cola ('hoy',
 * 'seguimientos'…) no fuerzan nada: para esos vale lo guardado.
 */
export function areaInicial(homeArea?: string | null, guardada?: string | null): AreaSeguimiento {
  if (String(homeArea || '').trim().toLowerCase() === 'lcl') return 'lcl'
  const g = String(guardada || '').trim().toLowerCase()
  if (g === 'fcl' || g === 'lcl') return g
  return 'fcl'
}

/**
 * Arma la cola. `area` la parte por modalidad (sin `area` vienen las dos
 * juntas, como antes — lo usa el badge de la pestaña).
 */
export function colaSeguimientos(cargas: CargaSeguimiento[], hoy: Date, area?: AreaSeguimiento): ColaSeguimientos {
  const h = medianoche(hoy)
  const pendientes: FilaSeguimiento[] = []
  const alDia: FilaSeguimiento[] = []
  let enviados = 0

  const lleno = (s: string | null | undefined): boolean => Boolean(String(s || '').trim())

  for (const c of cargas) {
    if (c.archived) continue
    const areaCarga = areaDeCarga(c.mode)
    if (!areaCarga) continue
    if (area && areaCarga !== area) continue

    // Trabajo hecho HOY. Se cuenta acá arriba, antes de los filtros de viaje:
    // una carga que se avisó hoy y después llegó (o se corrió fuera de la
    // ventana) igual fue trabajo del día — si no, el % bajaba solo.
    const seg = parseSegDate(String(c.seguimiento || ''))
    if (seg && medianoche(seg).getTime() === h.getTime()) enviados++

    // Ya llegó a su puerto → no se avisa más. Pero la llegada REAL la marcan
    // los HECHOS (salida / descarga / fiscal cargadas), no el calendario: una
    // ETA que quedó en el pasado sin ninguna de esas señales puede ser un
    // buque atrasado u omitido que nadie corrigió — caso SAN FRANCISCA
    // (26/08): omitió Montevideo y sus cargas desaparecían de la cola justo
    // cuando el cliente más necesitaba el update. Esas quedan marcadas
    // "¿llegó?" por unos días: o se confirma la llegada o se corrige la ETA.
    const eta = parseLocalDate(String(c.eta || '').trim())
    const llegadaReal = lleno(c.salida) || lleno(c.descarga) || lleno(c.etaFiscal)
    let etaVencidaDias: number | undefined
    if (eta && medianoche(eta).getTime() < h.getTime()) {
      if (llegadaReal) continue
      const pasados = Math.floor((h.getTime() - medianoche(eta).getTime()) / MS_DIA)
      if (pasados > SEGUIMIENTO_ETA_VENCIDA_DIAS) continue
      etaVencidaDias = pasados
    }

    // En viaje de verdad: embarcada (ETD pasado y no fósil) o llegando dentro
    // de SEGUIMIENTO_ETA_PROX_DIAS. Cargas en origen lejano o sin fechas
    // parseables quedan afuera — no hay buque que reportar.
    const etd = parseLocalDate(String(c.etd || '').trim())
    const etdDias = etd ? (h.getTime() - medianoche(etd).getTime()) / MS_DIA : null
    const embarcada = etdDias !== null && etdDias >= 0 && etdDias <= SEGUIMIENTO_ETD_MAX_DIAS
    const llegaPronto = eta !== null &&
      (medianoche(eta).getTime() - h.getTime()) / MS_DIA <= SEGUIMIENTO_ETA_PROX_DIAS
    if (!embarcada && !llegaPronto) continue

    if (!seg) {
      pendientes.push({ carga: c, dias: null, ...(etaVencidaDias !== undefined ? { etaVencidaDias } : {}) })
      continue
    }
    const dias = Math.floor((h.getTime() - medianoche(seg).getTime()) / MS_DIA)
    if (dias >= SEGUIMIENTO_DIAS) pendientes.push({ carga: c, dias, ...(etaVencidaDias !== undefined ? { etaVencidaDias } : {}) })
    else alDia.push({ carga: c, dias, ...(etaVencidaDias !== undefined ? { etaVencidaDias } : {}) })
  }

  pendientes.sort((a, b) => {
    // Las "¿llegó?" (ETA vencida sin resolver) van ARRIBA de todo: no son un
    // mail más, son un estado roto que hay que destrabar primero.
    const va = a.etaVencidaDias !== undefined ? 0 : 1
    const vb = b.etaVencidaDias !== undefined ? 0 : 1
    if (va !== vb) return va - vb
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

  alDia.sort((a, b) => {
    // Más próximas a VENCER primero (dias desc); a igualdad, la que llega antes.
    const da = a.dias ?? 0
    const db = b.dias ?? 0
    if (da !== db) return db - da
    const ta = parseLocalDate(String(a.carga.eta || ''))?.getTime() ?? Number.POSITIVE_INFINITY
    const tb = parseLocalDate(String(b.carga.eta || ''))?.getTime() ?? Number.POSITIVE_INFINITY
    if (ta !== tb) return ta - tb
    return a.carga.ref.localeCompare(b.carga.ref)
  })

  const total = enviados + pendientes.length
  const progreso: ProgresoDia = {
    enviados,
    faltan: pendientes.length,
    total,
    pct: total > 0 ? Math.round((enviados / total) * 100) : 0,
  }

  return { pendientes, alDia, progreso }
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
