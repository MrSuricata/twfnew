/**
 * HOY del transporte: lo que carga hoy, las cargas especiales que tiene
 * asignadas y sus avisos. Todo derivado en el momento de leer, sobre las
 * mismas operativas que HOY admin ya filtradas al alcance del partner por el
 * server (`partner-shipments`, lista blanca `opSegura`). Acá no se vuelve a
 * filtrar por transporte ni se guarda ningún estado.
 *
 * Funciones puras, testeadas en hoyTransporte.test.ts. La UI
 * (TransportDashboard.tsx) sólo pinta.
 * Spec: docs/superpowers/specs/2026-09-01-partner-hoy-avisos-design.md
 */
import type { ParsedShipment, OperativasRecord } from './shipmentTypes'
import { isSinTelex } from './telexCheck'
import type { PartnerAviso } from './partnerAvisos'

/** Horizonte de "Cargas especiales asignadas": un mes alcanza para conseguir
 *  carretón, permisos IMO o coordinar SENASA. */
export const ESPECIALES_DIAS_ADELANTE = 30

/** Ventana de "Mis avisos" (misma que devuelve el server al partner). */
export const AVISOS_DIAS_ATRAS = 30

/** Las alertas grandes, en el orden en que se agrupan y se muestran: lo que
 *  más condiciona la unidad primero. */
export type TipoAlerta = 'imo' | 'oog' | 'madera' | 'noApilable'
export const ORDEN_ALERTAS: TipoAlerta[] = ['imo', 'oog', 'madera', 'noApilable']

export const ALERTA_LABEL: Record<TipoAlerta, { icono: string; texto: string; ayuda: string }> = {
  imo: { icono: '☣', texto: 'IMO', ayuda: 'Carga peligrosa: unidad habilitada y documentación IMO.' },
  oog: { icono: '📐', texto: 'OOG · sobredimensionada', ayuda: 'Fuera de medida: carretón / unidad especial y permisos de circulación.' },
  madera: { icono: '🪵', texto: 'Madera', ayuda: 'Embalaje de madera: hay que pedir SENASA el día de carga.' },
  noApilable: { icono: '⛔', texto: 'No apilable', ayuda: 'No se puede estibar nada encima.' },
}

export interface AlertasCarga {
  madera: boolean
  imo: boolean
  oog: boolean
  noApilable: boolean
  /** Telex sin liberar: sin él no se retira el contenedor de la terminal. */
  tlxPendiente: boolean
  /** Alguna de las cuatro alertas grandes (TLX no cuenta: es documental, no de unidad). */
  alguna: boolean
}

export interface CargaHoy {
  ref: string
  cliente: string
  cntr: string
  tipo: string
  /** Dónde carga el camión (LUGAR_SALIDA, si no el depósito de la carga). */
  deposito: string
  operativa: string
  fiscal: string
  descripcion: string
  horario: string
  salida: string
  etaFiscal: string
  pkgs: number
  kg: number
  m3: number
  alertas: AlertasCarga
}

export interface CargaEspecial {
  ref: string
  cliente: string
  cntr: string
  tipo: string
  descripcion: string
  /** Fecha de carga (ISO) o '' si todavía no se coordinó. */
  salida: string
  /** ETA a Montevideo (ISO) si viaja en la carga. */
  eta: string
  fiscal: string
  deposito: string
  alertas: AlertasCarga
}

export interface GrupoEspecial {
  tipo: TipoAlerta
  cargas: CargaEspecial[]
}

const txt = (v: unknown): string => String(v ?? '').trim()
const num = (v: unknown): number => {
  const n = Number(v)
  return isFinite(n) ? n : 0
}
/** SI/NO de la planilla; la API puede mandar booleanos (OOG viene de `shipments.oog`). */
const esSi = (v: unknown): boolean => {
  if (v === true) return true
  const t = txt(v).toUpperCase()
  return t.startsWith('SI') || t === 'TRUE' || t === '1'
}
const soloDia = (v: unknown): string => {
  const t = txt(v)
  return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : ''
}
const aFecha = (iso: string): Date => {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(a, (m || 1) - 1, d || 1)
}
const diasEntre = (desdeISO: string, hastaISO: string): number =>
  Math.round((aFecha(hastaISO).getTime() - aFecha(desdeISO).getTime()) / 86_400_000)

/** Los campos que W1 suma a la operativa del partner (OOG/MODE/STOCK/ETA) son
 *  opcionales: si la API vieja no los manda, se toleran ausentes. */
type OpPartner = OperativasRecord & { OOG?: unknown; MODE?: unknown; STOCK?: unknown; ETA?: unknown }

export function alertasDe(op: OperativasRecord): AlertasCarga {
  const o = op as OpPartner
  const esLcl = txt(o.MODE).toLowerCase() === 'lcl'
  const madera = esSi(o.WOOD)
  const imo = esSi(o.IMO)
  const oog = esSi(o.OOG)
  const noApilable = esSi(o.NO_APILABLE)
  return {
    madera,
    imo,
    oog,
    noApilable,
    // Sólo si el dato viaja: sin la clave no se sabe, y una LCL no tiene telex.
    tlxPendiente: !esLcl && 'TLX' in (o as object) && isSinTelex(o.TLX),
    alguna: madera || imo || oog || noApilable,
  }
}

function* operativasDe(shipments: ParsedShipment[]): Generator<{ s: ParsedShipment; cab: Record<string, unknown>; op: OperativasRecord }> {
  for (const s of shipments) {
    const cab = s as unknown as Record<string, unknown>
    for (const op of (s.operativas || []) as OperativasRecord[]) yield { s, cab, op }
  }
}

// ── Card 1: hoy cargan ──────────────────────────────────────────────────

/** Operativas con SALIDA = hoy. `hoyISO` es la fecha LOCAL (format.hoyISO):
 *  después de las 21:00 en Uruguay el UTC ya es mañana. */
export function hoyCargan(shipments: ParsedShipment[], hoyISO: string): CargaHoy[] {
  const out: CargaHoy[] = []
  for (const { cab, op } of operativasDe(shipments)) {
    const salida = soloDia(op.SALIDA)
    if (!salida || salida !== hoyISO) continue
    out.push({
      ref: txt(op.REF) || txt(cab.REF),
      cliente: txt(op.CLIENTE_OP) || txt(cab.CLIENTE),
      cntr: txt(op.CNTR_OP),
      tipo: txt(op.TIPO),
      deposito: txt(op.LUGAR_SALIDA) || txt(op.DEPOSITO),
      operativa: txt(op.OPERATIVA),
      fiscal: txt(op.FISCAL),
      descripcion: txt(op.DESCRIPCION),
      horario: txt(op.HORARIO),
      salida,
      etaFiscal: soloDia(op.ETA_FISC),
      pkgs: num(op.PKGS),
      kg: num(op.KG),
      m3: num(op.M3),
      alertas: alertasDe(op),
    })
  }
  // Con horario primero (en orden), después por depósito: una parada por vez.
  out.sort((a, b) =>
    (a.horario === '' ? 1 : 0) - (b.horario === '' ? 1 : 0)
    || a.horario.localeCompare(b.horario)
    || a.deposito.localeCompare(b.deposito)
    || a.ref.localeCompare(b.ref))
  return out
}

// ── Card 3: cargas especiales asignadas ─────────────────────────────────

/** Sin fecha de carga: ¿todavía hay algo que preparar? Ya en fiscal o con el
 *  contenedor devuelto no; y sin ninguna operativa cargada se la da por
 *  cerrada a los 60 días del arribo (misma regla que `cargaFclActiva`). */
function pendienteSinFecha(op: OperativasRecord, cab: Record<string, unknown>, hoyISO: string): boolean {
  if (txt(op.LIBRE).toUpperCase().includes('DEVUELTO')) return false
  const etaFisc = soloDia(op.ETA_FISC)
  if (etaFisc && etaFisc <= hoyISO) return false
  const eta = soloDia(cab.ETA)
  if (eta && !etaFisc && !txt(op.LIBRE) && diasEntre(eta, hoyISO) > 60) return false
  return true
}

export function cargasEspeciales(
  shipments: ParsedShipment[],
  hoyISO: string,
  diasAdelante: number = ESPECIALES_DIAS_ADELANTE,
): GrupoEspecial[] {
  const porTipo = new Map<TipoAlerta, CargaEspecial[]>()
  for (const { cab, op } of operativasDe(shipments)) {
    const alertas = alertasDe(op)
    if (!alertas.alguna) continue

    const salida = soloDia(op.SALIDA)
    if (salida) {
      const dias = diasEntre(hoyISO, salida)
      if (dias < 0 || dias > diasAdelante) continue
    } else if (txt(op.SALIDA)) {
      continue                                     // texto tipo "CONFIRMAR": no es una fecha ni es "sin fecha"
    } else if (!pendienteSinFecha(op, cab, hoyISO)) {
      continue
    }

    const fila: CargaEspecial = {
      ref: txt(op.REF) || txt(cab.REF),
      cliente: txt(op.CLIENTE_OP) || txt(cab.CLIENTE),
      cntr: txt(op.CNTR_OP),
      tipo: txt(op.TIPO),
      descripcion: txt(op.DESCRIPCION),
      salida,
      eta: soloDia(cab.ETA) || soloDia((op as OpPartner).ETA),
      fiscal: txt(op.FISCAL),
      deposito: txt(op.LUGAR_SALIDA) || txt(op.DEPOSITO),
      alertas,
    }
    for (const tipo of ORDEN_ALERTAS) {
      if (!alertas[tipo]) continue
      const lista = porTipo.get(tipo)
      if (lista) lista.push(fila)
      else porTipo.set(tipo, [fila])
    }
  }

  return ORDEN_ALERTAS.filter(t => porTipo.has(t)).map(tipo => {
    const cargas = porTipo.get(tipo)!
    // Con fecha primero (la más cercana arriba), las sin fecha al final.
    cargas.sort((a, b) =>
      (a.salida === '' ? 1 : 0) - (b.salida === '' ? 1 : 0)
      || a.salida.localeCompare(b.salida)
      || a.ref.localeCompare(b.ref))
    return { tipo, cargas }
  })
}

// ── Card 4: mis avisos ──────────────────────────────────────────────────

/** Los avisos de los últimos días, del más nuevo al más viejo. El server ya
 *  recorta a 30 días; esto lo garantiza del lado del panel. */
export function avisosRecientes(avisos: PartnerAviso[], hoyISO: string, diasAtras: number = AVISOS_DIAS_ATRAS): PartnerAviso[] {
  return avisos
    .filter(a => {
      const dia = soloDia(a.createdAt)
      return dia === '' || diasEntre(dia, hoyISO) <= diasAtras
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
