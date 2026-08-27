/**
 * MÉTRICAS DE TIEMPOS — cuánto tarda de verdad cada tramo de una carga.
 *
 * Brian (26/08): "analíticas sea analíticas Y métricas: tiempo promedio de
 * tránsito internacional de puerto a puerto, cuánto demora una carga que llega
 * a Uruguay en salir (coordinarse el tránsito), cuánto demora en llegar a
 * fiscal, promedios de tiempos marítimos".
 *
 * Tramos (marítimas FCL/LCL, fechas por CONTENEDOR cuando el array existe):
 *   TRÁNSITO      ETD → ETA        el buque, puerto a puerto
 *   COORDINACIÓN  ETA → SALIDA     llegó a MVD → salió el camión
 *   A FISCAL      SALIDA → ETA_FISC  el camión hasta el depósito destino
 *   PUERTA A PUERTA ETD → ETA_FISC  embarque a entrega, el número del cliente
 *
 * Decisiones de medición:
 *  - MEDIANA como número principal (los promedios se envenenan con una fecha
 *    mal tipeada); el promedio se muestra al lado.
 *  - Cada tramo tiene un rango de sanidad: lo que cae afuera es un dato roto
 *    (fecha basura), no una operación real, y se excluye de la muestra.
 *  - Solo se mide lo que tiene LAS DOS fechas del tramo — nunca se inventa.
 *
 * Pura y testeable.
 */
import type { UnifiedOperation } from './operationsTypes'
import { parseAnyDate } from './analyticsUtils'

export interface StatsTramo {
  /** Cargas/contenedores medidos (con las dos fechas del tramo, en rango). */
  n: number
  mediana: number
  promedio: number
  /** El 90% de las operaciones tardó esto o menos. */
  p90: number
}

const MS_DIA = 86_400_000

const dias = (desde: string | undefined, hasta: string | undefined): number | null => {
  const a = parseAnyDate(String(desde || ''))
  const b = parseAnyDate(String(hasta || ''))
  if (!a || !b) return null
  return Math.round((b.getTime() - a.getTime()) / MS_DIA)
}

export function statsDe(valores: number[]): StatsTramo | null {
  if (!valores.length) return null
  const v = [...valores].sort((a, b) => a - b)
  const mid = Math.floor(v.length / 2)
  const mediana = v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2
  const promedio = v.reduce((a, b) => a + b, 0) / v.length
  const p90 = v[Math.min(v.length - 1, Math.ceil(v.length * 0.9) - 1)]
  const r1 = (x: number) => Math.round(x * 10) / 10
  return { n: v.length, mediana: r1(mediana), promedio: r1(promedio), p90: r1(p90) }
}

/** Rangos de sanidad por tramo: fuera de esto es una fecha rota, no un viaje. */
export const RANGO_TRAMO = {
  transito: [1, 200],
  coordinacion: [0, 90],
  aFiscal: [0, 30],
  puertaAPuerta: [2, 250],
} as const

type Tramo = keyof typeof RANGO_TRAMO

const enRango = (tramo: Tramo, d: number | null): d is number =>
  d !== null && d >= RANGO_TRAMO[tramo][0] && d <= RANGO_TRAMO[tramo][1]

const esMaritima = (op: UnifiedOperation): boolean => op.mode === 'fcl' || op.mode === 'lcl'

/** Pares (salida, etaFisc, eta…) por CONTENEDOR — con fallback a las columnas
 *  colapsadas cuando la carga no tiene el array. */
const porContenedor = (op: UnifiedOperation): { salida: string; etaFisc: string }[] => {
  const ops = op.operativas || []
  if (ops.length) return ops.map(o => ({ salida: String(o.SALIDA || ''), etaFisc: String(o.ETA_FISC || '') }))
  return [{ salida: op.salida || '', etaFisc: op.etaFisc || '' }]
}

export interface TiemposResumen {
  transito: StatsTramo | null
  coordinacion: StatsTramo | null
  aFiscal: StatsTramo | null
  puertaAPuerta: StatsTramo | null
}

/** Los cuatro tramos sobre un conjunto de operaciones (ya filtradas por
 *  año/modalidad/zona en la página — acá no se filtra nada más que sanidad). */
export function tiemposResumen(ops: UnifiedOperation[]): TiemposResumen {
  const transito: number[] = []
  const coordinacion: number[] = []
  const aFiscal: number[] = []
  const puertaAPuerta: number[] = []

  for (const op of ops || []) {
    if (!esMaritima(op)) continue
    const t = dias(op.etd, op.eta)
    if (enRango('transito', t)) transito.push(t)
    for (const c of porContenedor(op)) {
      const co = dias(op.eta, c.salida)
      if (enRango('coordinacion', co)) coordinacion.push(co)
      const af = dias(c.salida, c.etaFisc)
      if (enRango('aFiscal', af)) aFiscal.push(af)
      const pp = dias(op.etd, c.etaFisc)
      if (enRango('puertaAPuerta', pp)) puertaAPuerta.push(pp)
    }
  }

  return {
    transito: statsDe(transito),
    coordinacion: statsDe(coordinacion),
    aFiscal: statsDe(aFiscal),
    puertaAPuerta: statsDe(puertaAPuerta),
  }
}

export interface GrupoTiempo {
  nombre: string
  stats: StatsTramo
}

/** Muestra mínima para que un grupo diga algo (3 viajes no es tendencia,
 *  pero 1 es anécdota). */
export const MIN_MUESTRA_GRUPO = 3

const agrupar = (
  pares: { clave: string; valor: number }[],
  top: number,
): GrupoTiempo[] => {
  const m = new Map<string, number[]>()
  for (const p of pares) {
    if (!p.clave) continue
    const l = m.get(p.clave) || []
    l.push(p.valor)
    m.set(p.clave, l)
  }
  return [...m.entries()]
    .filter(([, v]) => v.length >= MIN_MUESTRA_GRUPO)
    .map(([nombre, v]) => ({ nombre, stats: statsDe(v)! }))
    .sort((a, b) => a.stats.mediana - b.stats.mediana)
    .slice(0, top)
}

/** Tránsito ETD→ETA por LÍNEA marítima (mediana, más rápida primero). */
export function transitoPorLinea(ops: UnifiedOperation[], top = 8): GrupoTiempo[] {
  const pares: { clave: string; valor: number }[] = []
  for (const op of ops || []) {
    if (!esMaritima(op)) continue
    const t = dias(op.etd, op.eta)
    if (enRango('transito', t)) pares.push({ clave: String(op.linea || '').trim().toUpperCase(), valor: t })
  }
  return agrupar(pares, top)
}

/** Tránsito ETD→ETA por PUERTO DE ORIGEN (puerto a puerto, como pide Brian). */
export function transitoPorOrigen(ops: UnifiedOperation[], top = 8): GrupoTiempo[] {
  const pares: { clave: string; valor: number }[] = []
  for (const op of ops || []) {
    if (!esMaritima(op)) continue
    const t = dias(op.etd, op.eta)
    if (enRango('transito', t)) pares.push({ clave: String(op.origin || '').trim().toUpperCase(), valor: t })
  }
  return agrupar(pares, top)
}

/** Coordinación ETA→SALIDA por DEPÓSITO (dónde se destraba más rápido). */
export function coordinacionPorDeposito(ops: UnifiedOperation[], top = 8): GrupoTiempo[] {
  const pares: { clave: string; valor: number }[] = []
  for (const op of ops || []) {
    if (!esMaritima(op)) continue
    for (const c of porContenedor(op)) {
      const co = dias(op.eta, c.salida)
      if (enRango('coordinacion', co)) pares.push({ clave: String(op.deposito || '').trim().toUpperCase(), valor: co })
    }
  }
  return agrupar(pares, top)
}

export interface MesTiempos {
  /** 'YYYY-MM' del mes de la ETA. */
  mes: string
  transito: number | null
  coordinacion: number | null
}

/** Tendencia mensual (mediana por mes de ETA) de tránsito y coordinación —
 *  para ver si el circuito mejora o empeora. Últimos `n` meses con datos. */
export function tiemposPorMes(ops: UnifiedOperation[], n = 12): MesTiempos[] {
  const porMes = new Map<string, { t: number[]; c: number[] }>()
  for (const op of ops || []) {
    if (!esMaritima(op)) continue
    const eta = parseAnyDate(String(op.eta || ''))
    if (!eta) continue
    const mes = `${eta.getFullYear()}-${String(eta.getMonth() + 1).padStart(2, '0')}`
    const b = porMes.get(mes) || { t: [], c: [] }
    const t = dias(op.etd, op.eta)
    if (enRango('transito', t)) b.t.push(t)
    for (const c of porContenedor(op)) {
      const co = dias(op.eta, c.salida)
      if (enRango('coordinacion', co)) b.c.push(co)
    }
    porMes.set(mes, b)
  }
  return [...porMes.entries()]
    .filter(([, b]) => b.t.length || b.c.length)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-n)
    .map(([mes, b]) => ({
      mes,
      transito: statsDe(b.t)?.mediana ?? null,
      coordinacion: statsDe(b.c)?.mediana ?? null,
    }))
}
