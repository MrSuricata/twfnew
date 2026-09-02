/**
 * HOY del depósito (PLANIR, GODILCO, TCP…): qué se mueve hoy en su predio, qué
 * contenedor tiene que ir a retirar de la terminal, qué vacío tiene que devolver
 * antes de que venza el libre y qué LCL le falta desconsolidar.
 *
 * Todo derivado en el momento de leer, con los MISMOS datos que ya recibe el
 * portal (`/api/data/partner-shipments`, lista blanca `opSegura`): acá no se
 * guarda ningún estado. Lo único que el depósito puede hacer es PROPONER un
 * aviso (`partner_avisos`) que el equipo confirma desde HOY admin — y esas
 * propuestas se cruzan acá para que la fila diga "esperando confirmación" o
 * desaparezca cuando ya la confirmaron.
 *
 * Funciones puras, testeadas en hoyDeposito.test.ts. La UI (DepotDashboard)
 * solo pinta. Spec: docs/superpowers/specs/2026-09-01-partner-hoy-avisos-design.md
 */
import type { ParsedShipment, OperativasRecord } from './shipmentTypes'
import { parseLocalDate } from './shipmentTypes'
import { ultimoAviso, type PartnerAviso, type PartnerAvisoTipo } from './partnerAvisos'

/**
 * La operativa tal como viaja al partner. Los campos de abajo los suma la API
 * (W1 del plan) y pueden NO venir todavía: se tratan como vacíos, nunca se
 * inventan. `MODE`/`STOCK`/`ETA` son de la carga (repetidos en cada operativa);
 * `TURNO_RETIRO`/`RETIRADO` salen de `montecon_agenda` cuando la terminal es
 * MONTECON.
 */
export interface OperativaPartner extends OperativasRecord {
  /** Sobredimensionada (SI/NO). */
  OOG?: string
  /** fcl · lcl · air · road. Vacío = se asume FCL (lo histórico del portal). */
  MODE?: string
  /** Nº de stock del depósito (LCL). Vacío = todavía no lo dieron. */
  STOCK?: string
  /** ETA de la carga (ISO). */
  ETA?: string
  /** Fecha del turno de retiro conseguido en Montecon (ISO). */
  TURNO_RETIRO?: string
  /** Fecha en que se marcó retirado (ISO o timestamp). Vacío = sigue en la terminal. */
  RETIRADO?: string
}

// ── Ventanas y umbrales ────────────────────────────────────────────────

/** Retiros: desde hace dos días (llegó y todavía no lo fueron a buscar)… */
export const RETIROS_DIAS_ATRAS = 2
/** …hasta una semana adelante (lo que se planifica con camión y turno). */
export const RETIROS_DIAS_ADELANTE = 7
/** LIBRE: se avisa desde 5 días antes (Brian: mismo umbral que HOY admin). */
export const LIBRE_DIAS_AVISO = 5

// ── Helpers ────────────────────────────────────────────────────────────

const txt = (v: unknown): string => String(v ?? '').trim()
const up = (v: unknown): string => txt(v).toUpperCase()
const num = (v: unknown): number => {
  const n = Number(v)
  return isFinite(n) ? n : 0
}
const siNo = (v: unknown): boolean => up(v).startsWith('SI')
const MS_DIA = 86_400_000

/** Solo fechas ISO estrictas (un "CONFIRMAR" o un "2/7" no es una fecha). */
const fechaISO = (v: unknown): string => {
  const s = txt(v).slice(0, 10)
  return parseLocalDate(s) ? s : ''
}

/** Días de `desde` a `hasta` (positivo = hasta es después). null si alguna no es fecha. */
export function diasEntre(desdeISO: string, hastaISO: string): number | null {
  const a = parseLocalDate(txt(desdeISO).slice(0, 10))
  const b = parseLocalDate(txt(hastaISO).slice(0, 10))
  if (!a || !b) return null
  return Math.round((b.getTime() - a.getTime()) / MS_DIA)
}

/** El depósito de la operativa es el mío. Sin nombre de depósito no se filtra
 *  (el server ya recortó al alcance del partner). */
const esMiDeposito = (op: OperativaPartner, deposito: string): boolean =>
  !up(deposito) || up(op.DEPOSITO) === up(deposito)

/** Modo de la carga: la operativa lo trae repetido; vacío = FCL. */
const modoDe = (op: OperativaPartner): string => up(op.MODE) || 'FCL'
const esLcl = (op: OperativaPartner): boolean => modoDe(op) === 'LCL'
const esFcl = (op: OperativaPartner): boolean => modoDe(op) === 'FCL'

/** TRASIEGO y CARGA A PISO pasan por el depósito; CONTENEDOR va directo al fiscal. */
const pasaPorDeposito = (op: OperativaPartner): boolean => {
  const o = up(op.OPERATIVA)
  return o.includes('TRASIEGO') || o.includes('PISO')
}

/** "DEVUELTO" vive en LIBRE (ver memoria): el vacío ya volvió a la terminal. */
const devuelto = (op: OperativaPartner, cab: ParsedShipment): boolean =>
  up(op.LIBRE).includes('DEVUELTO') || up(cab.LIBRE_HASTA).includes('DEVUELTO') || !!txt(op.DEV_FECHA)

const yaRetirado = (op: OperativaPartner): boolean => !!txt(op.RETIRADO)

/** Fecha en que el contenedor sale de la terminal: el turno de Montecon si lo
 *  hay, si no la ETA del buque (la operativa la trae; si no, la cabecera). */
const fechaRetiro = (op: OperativaPartner, cab: ParsedShipment): string =>
  fechaISO(op.TURNO_RETIRO) || fechaISO(op.ETA) || fechaISO(op.ETA_OP) || fechaISO(cab.ETA)

const libreDe = (op: OperativaPartner, cab: ParsedShipment): string =>
  txt(op.LIBRE) || txt(cab.LIBRE_HASTA) || txt(cab.calculatedLibreHasta)

/**
 * El último aviso de este tipo para esta carga/contenedor. Si no hay uno con el
 * contenedor exacto se acepta el de la ref entera (cntr ''), que es como queda
 * un aviso de una carga de un solo contenedor o de una LCL.
 */
export function estadoAvisoDe(
  avisos: PartnerAviso[],
  tipo: PartnerAvisoTipo,
  ref: string,
  cntr = '',
): PartnerAviso | undefined {
  return ultimoAviso(avisos, tipo, ref, cntr) || (cntr ? ultimoAviso(avisos, tipo, ref, '') : undefined)
}

/** Base común de todas las filas del HOY del depósito. */
export interface FilaDeposito {
  ref: string
  cliente: string
  cntr: string
  tipo: string
  operativa: string
  descripcion: string
  pkgs: number
  kg: number
  m3: number
  /** Último aviso del tipo que corresponde a la card (pendiente/rechazado). */
  aviso?: PartnerAviso
}

const filaBase = (op: OperativaPartner, cab: ParsedShipment): FilaDeposito => ({
  ref: txt(op.REF) || txt(cab.REF),
  cliente: txt(op.CLIENTE_OP) || txt(cab.CLIENTE),
  cntr: txt(op.CNTR_OP),
  tipo: txt(op.TIPO),
  operativa: txt(op.OPERATIVA),
  descripcion: txt(op.DESCRIPCION),
  pkgs: num(op.PKGS),
  kg: num(op.KG),
  m3: num(op.M3),
})

const ops = (s: ParsedShipment): OperativaPartner[] => (s.operativas || []) as OperativaPartner[]

// ── Card 1: operativas de hoy ──────────────────────────────────────────

export interface OperativaHoy extends FilaDeposito {
  /** Qué pasa hoy: carga el camión, retiro de la terminal, o las dos cosas. */
  motivo: 'carga' | 'retiro' | 'ambos'
  transporte: string
  fiscal: string
  horario: string
  salida: string
  /** Fecha estimada del retiro (turno o ETA), si hoy retira. */
  retiro: string
  madera: boolean
  imo: boolean
  oog: boolean
  noApilable: boolean
  tlxPendiente: boolean
}

/**
 * Lo que se mueve HOY en mi depósito: cargas con SALIDA = hoy (viene el camión)
 * y contenedores que llegan hoy desde la terminal (turno de retiro = hoy, o ETA
 * = hoy en un trasiego / carga a piso sin turno). Un CONTENEDOR directo no
 * pasa por el depósito, así que su ETA no es un retiro mío.
 */
export function operativasDeHoy(shipments: ParsedShipment[], hoyISO: string, deposito: string): OperativaHoy[] {
  const out: OperativaHoy[] = []
  for (const cab of shipments) {
    for (const op of ops(cab)) {
      if (!esMiDeposito(op, deposito)) continue
      const salida = fechaISO(op.SALIDA)
      const cargaHoy = salida === hoyISO
      const retiro = esFcl(op) && pasaPorDeposito(op) && !yaRetirado(op) && !devuelto(op, cab) ? fechaRetiro(op, cab) : ''
      const retiraHoy = retiro === hoyISO
      if (!cargaHoy && !retiraHoy) continue
      out.push({
        ...filaBase(op, cab),
        motivo: cargaHoy && retiraHoy ? 'ambos' : cargaHoy ? 'carga' : 'retiro',
        transporte: txt(op.TRANSPORTE),
        fiscal: txt(op.FISCAL),
        horario: txt(op.HORARIO),
        salida,
        retiro: retiraHoy ? retiro : '',
        madera: siNo(op.WOOD),
        imo: siNo(op.IMO),
        oog: siNo(op.OOG),
        noApilable: siNo(op.NO_APILABLE),
        tlxPendiente: !txt(op.TLX) || up(op.TLX) === 'NO' || up(op.TLX) === 'PENDIENTE',
      })
    }
  }
  // Primero los retiros (llegan durante la mañana), después las cargas por horario.
  const rango = (m: OperativaHoy['motivo']) => (m === 'retiro' ? 0 : m === 'ambos' ? 1 : 2)
  return out.sort((a, b) => rango(a.motivo) - rango(b.motivo) || a.horario.localeCompare(b.horario) || a.ref.localeCompare(b.ref))
}

// ── Card 2: retiros próximos ───────────────────────────────────────────

export interface RetiroProximo extends FilaDeposito {
  terminal: string
  eta: string
  /** Turno de retiro en Montecon ('' si no hay). */
  turno: string
  libre: string
  /** Fecha que manda (turno o ETA). */
  fecha: string
  /** Días hasta esa fecha: 0 = hoy · <0 = ya llegó · >0 = por llegar. */
  dias: number
}

/**
 * Contenedores que tengo que ir a buscar a la terminal: TRASIEGO / CARGA A PISO
 * con destino mi depósito, con fecha (turno de Montecon o ETA) entre hoy-2 y
 * hoy+7, que todavía no se retiraron ni devolvieron. Con un aviso "retiré"
 * confirmado la fila desaparece; pendiente o rechazado, se muestra el estado.
 */
export function retirosProximos(
  shipments: ParsedShipment[],
  hoyISO: string,
  deposito: string,
  avisos: PartnerAviso[],
): RetiroProximo[] {
  const out: RetiroProximo[] = []
  for (const cab of shipments) {
    for (const op of ops(cab)) {
      if (!esMiDeposito(op, deposito) || !esFcl(op) || !pasaPorDeposito(op)) continue
      if (yaRetirado(op) || devuelto(op, cab)) continue
      const fecha = fechaRetiro(op, cab)
      const dias = diasEntre(hoyISO, fecha)
      if (dias === null || dias < -RETIROS_DIAS_ATRAS || dias > RETIROS_DIAS_ADELANTE) continue
      const base = filaBase(op, cab)
      const aviso = estadoAvisoDe(avisos, 'retire', base.ref, base.cntr)
      if (aviso?.estado === 'confirmado') continue
      out.push({
        ...base,
        aviso,
        terminal: txt(cab.TERMINAL),
        eta: fechaISO(op.ETA) || fechaISO(op.ETA_OP) || fechaISO(cab.ETA),
        turno: fechaISO(op.TURNO_RETIRO),
        libre: libreDe(op, cab),
        fecha,
        dias,
      })
    }
  }
  return out.sort((a, b) => a.dias - b.dias || a.ref.localeCompare(b.ref))
}

// ── Card 3: LIBRE por vencer / vencidos ────────────────────────────────

export type SeveridadLibre = 'vencido' | 'hoy' | 'urgente' | 'proximo'

export interface LibrePorVencer extends FilaDeposito {
  libre: string
  /** Días hasta el vencimiento: <0 vencido · 0 hoy · 1-2 urgente · 3-5 próximo. */
  dias: number
  severidad: SeveridadLibre
  terminal: string
  /** Dónde se devuelve el vacío (DEV), si está. */
  dev: string
}

export function severidadLibre(dias: number): SeveridadLibre {
  if (dias < 0) return 'vencido'
  if (dias === 0) return 'hoy'
  if (dias <= 2) return 'urgente'
  return 'proximo'
}

/**
 * Contenedores de mi depósito que todavía no se devolvieron y cuyo LIBRE vence
 * dentro de LIBRE_DIAS_AVISO días o ya venció. Mismos cortes que la tira de
 * LIBRE de HOY admin (vencido / hoy / 1-2 d) más la franja de aviso a 5 días.
 * "DEVUELTO" en LIBRE o una DEV_FECHA = ya devuelto, no entra. Con un aviso
 * "devolví" confirmado la fila desaparece.
 */
export function libresPorVencer(
  shipments: ParsedShipment[],
  hoyISO: string,
  deposito: string,
  avisos: PartnerAviso[],
): LibrePorVencer[] {
  const out: LibrePorVencer[] = []
  for (const cab of shipments) {
    for (const op of ops(cab)) {
      if (!esMiDeposito(op, deposito) || !esFcl(op)) continue
      if (devuelto(op, cab)) continue
      const libre = fechaISO(libreDe(op, cab))
      if (!libre) continue
      const dias = diasEntre(hoyISO, libre)
      if (dias === null || dias > LIBRE_DIAS_AVISO) continue
      const base = filaBase(op, cab)
      const aviso = estadoAvisoDe(avisos, 'devolvi', base.ref, base.cntr)
      if (aviso?.estado === 'confirmado') continue
      out.push({
        ...base,
        aviso,
        libre,
        dias,
        severidad: severidadLibre(dias),
        terminal: txt(cab.TERMINAL),
        dev: txt(op.DEV),
      })
    }
  }
  return out.sort((a, b) => a.dias - b.dias || a.ref.localeCompare(b.ref))
}

// ── Card 4: LCL a desconsolidar ────────────────────────────────────────

export interface LclSinStock extends FilaDeposito {
  eta: string
  diasDesdeEta: number
  fiscal: string
}

/**
 * LCL con depósito = el mío, que ya llegaron (ETA hoy o pasada — mismo corte
 * que `estadoLcl` → 'aguarda_stock') y sin Nº de stock. Sin ETA no se asume
 * que llegó. Con un aviso "desconsolidé" confirmado la fila desaparece (el
 * equipo ya cargó el stock).
 */
export function lclADesconsolidar(
  shipments: ParsedShipment[],
  hoyISO: string,
  deposito: string,
  avisos: PartnerAviso[],
): LclSinStock[] {
  const out: LclSinStock[] = []
  for (const cab of shipments) {
    for (const op of ops(cab)) {
      if (!esMiDeposito(op, deposito) || !esLcl(op)) continue
      if (txt(op.STOCK)) continue
      const eta = fechaISO(op.ETA) || fechaISO(cab.ETA)
      if (!eta || eta > hoyISO) continue
      const base = filaBase(op, cab)
      // Una LCL es la ref entera: el aviso va sin contenedor.
      const aviso = estadoAvisoDe(avisos, 'desconsolide', base.ref, '')
      if (aviso?.estado === 'confirmado') continue
      out.push({
        ...base,
        cntr: '',
        aviso,
        eta,
        diasDesdeEta: Math.max(0, diasEntre(eta, hoyISO) ?? 0),
        fiscal: txt(op.FISCAL),
      })
    }
  }
  return out.sort((a, b) => b.diasDesdeEta - a.diasDesdeEta || a.ref.localeCompare(b.ref))
}
