/**
 * Campos pendientes de completar — "la webapp te reparte las tareas del día"
 * (Brian 17/08/2026): mantener los datos como se mantenía la planilla, pero
 * con la app diciéndote QUÉ falta y CUÁNDO empieza a importar.
 *
 * La regla es por ETAPA — una carga en origen sin contenedor no está
 * "incompleta", es normal. Cuanto más cerca la llegada, más exigente:
 *
 *   Siempre (activa)      → Cliente · País destino · ETA
 *   Embarcada (ETD pasó)  → Buque · Línea · BL · Contenedor (solo FCL)
 *   Llega en ≤14 días     → Bultos · Kg · M³ · Agente (quién factura)
 *   Llega en ≤7 / llegó   → Depósito · Operativa · Transporte · Fiscal
 *                            (coordinación: solo cargas por Uruguay)
 *
 * Marítimas (FCL/LCL) no archivadas. Pura y testeable.
 */

import { parseLocalDate } from './shipmentTypes'
import { isPorUruguay } from './checksTypes'

export interface CargaCampos {
  mode?: string | null
  archived?: boolean
  pais?: string | null
  cliente?: string | null
  eta?: string | null
  etd?: string | null
  buque?: string | null
  /** Naviera. No es cosmética: de acá sale la forma de pago (deriveFormaPago)
   *  y por lo tanto el vencimiento de flete y locales, y el link de tracking. */
  linea?: string | null
  docNumber?: string | null
  cntr?: string | null
  pkgs?: number | null
  kg?: number | null
  m3?: number | null
  agente?: string | null
  deposito?: string | null
  operativa?: string | null
  transporte?: string | null
  fiscal?: string | null
  salida?: string | null
}

export interface CampoFaltante {
  campo: keyof CargaCampos
  etiqueta: string
}

/** Ventanas de exigencia (días antes de la llegada). */
export const FALTANTES_DIAS_CHECKS = 14
export const FALTANTES_DIAS_COORDINACION = 7

const MS_DIA = 86_400_000
const medianoche = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate())

const vacio = (s: string | null | undefined): boolean => !String(s || '').trim()
const cero = (n: number | null | undefined): boolean => !(Number(n) > 0)

export function datosFaltantes(c: CargaCampos, hoy: Date): CampoFaltante[] {
  if (c.archived) return []
  const m = String(c.mode || '').toLowerCase()
  if (m !== 'fcl' && m !== 'lcl') return []

  const h = medianoche(hoy).getTime()
  const eta = parseLocalDate(String(c.eta || '').trim())
  const etd = parseLocalDate(String(c.etd || '').trim())
  const diasAEta = eta ? Math.round((medianoche(eta).getTime() - h) / MS_DIA) : null
  const embarcada = etd !== null && medianoche(etd).getTime() <= h
  const ventanaChecks = diasAEta !== null && diasAEta <= FALTANTES_DIAS_CHECKS
  const ventanaCoord = diasAEta !== null && diasAEta <= FALTANTES_DIAS_COORDINACION

  const out: CampoFaltante[] = []
  const falta = (campo: keyof CargaCampos, etiqueta: string) => out.push({ campo, etiqueta })

  // Siempre: sin esto la carga ni se puede identificar/planificar.
  if (vacio(c.cliente)) falta('cliente', 'Cliente')
  if (vacio(c.pais)) falta('pais', 'País')
  if (!eta) falta('eta', 'ETA')

  // Embarcada: el viaje existe, estos datos ya viajaron en el pre-alerta.
  if (embarcada || ventanaChecks) {
    if (vacio(c.buque)) falta('buque', 'Buque')
    if (vacio(c.linea)) falta('linea', 'Línea')
    if (vacio(c.docNumber)) falta('docNumber', 'BL')
    if (m === 'fcl' && vacio(c.cntr)) falta('cntr', 'Contenedor')
  }

  // Ventana de checks: sin bultos/kg/m³ no se arma AD/AT ni se factura bien;
  // sin agente, Pagos no sabe a quién se le debe el flete.
  if (ventanaChecks) {
    if (cero(c.pkgs)) falta('pkgs', 'Bultos')
    if (cero(c.kg)) falta('kg', 'Kg')
    if (cero(c.m3)) falta('m3', 'M³')
    if (vacio(c.agente)) falta('agente', 'Agente')
  }

  // Coordinación (solo por Uruguay): con el buque encima hay que saber a qué
  // depósito va, cómo opera, quién la lleva y a qué fiscal.
  if (ventanaCoord && isPorUruguay(c.pais)) {
    // Operativa CONTENEDOR = retiro directo desde terminal: el depósito UY va
    // legítimamente vacío — pedirlo acá invitaba a "completarlo" y la regla
    // "Depósito manda" pisaba el LUGAR_SALIDA puesto a mano (revisión 17/08).
    const directa = String(c.operativa || '').trim().toUpperCase() === 'CONTENEDOR'
    if (!directa && vacio(c.deposito)) falta('deposito', 'Depósito')
    if (vacio(c.operativa)) falta('operativa', 'Operativa')
    if (vacio(c.transporte)) falta('transporte', 'Transporte')
    if (vacio(c.fiscal)) falta('fiscal', 'Fiscal')
  }

  return out
}

/** "Bultos, Kg, M³" — para tooltips y filas. */
export const resumenFaltantes = (f: CampoFaltante[]): string => f.map(x => x.etiqueta).join(', ')

export interface FaltanteUrgente {
  carga: CargaCampos & { dbId?: string | null; ref?: string | null }
  faltantes: CampoFaltante[]
  /** Días hasta la llegada (negativo = ya llegó). */
  diasAEta: number
}

/**
 * Lo URGENTE para la tarjeta de HOY: cargas con faltantes que llegan dentro de
 * FALTANTES_DIAS_COORDINACION días o ya llegaron y siguen sin salida coordinada
 * (todavía se trabaja sobre ellas). Ordenadas por llegada más próxima.
 */
export function faltantesUrgentes(
  cargas: (CargaCampos & { dbId?: string | null; ref?: string | null })[],
  hoy: Date,
): FaltanteUrgente[] {
  const h = medianoche(hoy).getTime()
  const out: FaltanteUrgente[] = []
  for (const c of cargas) {
    const eta = parseLocalDate(String(c.eta || '').trim())
    if (!eta) continue
    const dias = Math.round((medianoche(eta).getTime() - h) / MS_DIA)
    if (dias > FALTANTES_DIAS_COORDINACION) continue
    // Ya llegada: solo mientras no tenga salida coordinada, y con PISO de 14
    // días — las llegadas viejas con la salida nunca cargada son deuda de
    // datos histórica, no trabajo de hoy (medido 17/08: sin piso, la tarjeta
    // nacía con ~95 filas; con piso, con lo realmente accionable).
    if (dias < 0 && (!vacio(c.salida) || dias < -2 * FALTANTES_DIAS_COORDINACION)) continue
    const faltantes = datosFaltantes(c, hoy)
    if (faltantes.length === 0) continue
    out.push({ carga: c, faltantes, diasAEta: dias })
  }
  return out.sort((a, b) => a.diasAEta - b.diasAEta)
}
