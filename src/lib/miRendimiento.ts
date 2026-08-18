/**
 * Mi rendimiento — el parte personal de las operativas de depósito.
 *
 * Brian (18/08/2026) necesita poder responder, operativa por operativa:
 * ¿fui al depósito? ¿pasé las fotos? ¿avisé el traslado del contenedor?
 * ¿avisé la salida rumbo a frontera? ¿hice el informe operativo?
 * Y arriba de todo: de cuántas operativas hice cada cosa.
 *
 * DECISIONES DE MEDICIÓN
 *
 * 1. El denominador sale de las CARGAS, no de lo que uno elige registrar: son
 *    las operativas que pasaron (o pasan) por depósito en el período. Así el
 *    número no se puede inflar marcando de más — solo se sube haciendo.
 *
 * 2. Dos señales se derivan de hechos, no de un tilde:
 *      · FOTOS   → hay fotos de Uruguay cargadas para esa ref
 *      · INFORME → hay un informe operativo subido para esa ref
 *    Las otras tres (visita, aviso de traslado, aviso de salida) son pasos de
 *    ref_checks con fecha y usuario.
 *
 * 3. La visita a depósito cuenta como CONFIRMADA cuando hay fotos de Uruguay
 *    (evidencia dura) y como DECLARADA cuando solo está el tilde. El parte
 *    muestra las dos por separado: mezclarlas sería exactamente el tipo de
 *    número que no aguanta que lo revisen.
 *
 * 4. AUTORÍA. Lo marcado con la identidad de OTRA persona no cuenta como
 *    propio. Lo marcado en la época del login compartido ('admin') o traído
 *    del import de la planilla ('planilla') no identifica a nadie: eso SÍ
 *    cuenta, porque "no atribuible" no es lo mismo que "de otro". De acá en
 *    más cada marca lleva la identidad real, así que el número se limpia solo.
 *
 * Pura y testeable: no toca red ni React.
 */

import type { RefCheckSteps } from './checksTypes'
import { normalizeRef, avisoForCntr, isPorUruguay } from './checksTypes'
import type { RefCheckStep } from './checksTypes'
import { parseCntr } from './cntrUtils'
import { parseLocalDate } from './shipmentTypes'

/** Operativas que pasan por depósito (las que generan visita e informe). */
const OPERATIVAS_DEPOSITO = new Set(['TRASIEGO', 'CARGA A PISO'])

export interface CargaRendimiento {
  ref: string
  cliente?: string | null
  deposito?: string | null
  operativa?: string | null
  cntr?: string | null
  eta?: string | null
  salida?: string | null
  pais?: string | null
  mode?: string | null
  archived?: boolean
}

/** Una operativa con sus cinco señales. */
export interface FilaRendimiento {
  ref: string
  cliente: string
  deposito: string
  operativa: string
  /** Fecha que ordena la fila: la salida si está, si no la llegada. */
  fecha: string
  /** Contenedores de la carga: los avisos son por contenedor. */
  cntrs: string[]
  visita: boolean
  fotos: boolean
  /** Avisado en TODOS los contenedores. */
  avisoTraslado: boolean
  /** Avisado en algunos, no en todos. */
  avisoTrasladoParcial: boolean
  avisoSalida: boolean
  avisoSalidaParcial: boolean
  informe: boolean
  /** La visita tiene respaldo de fotos, no solo el tilde. */
  visitaConfirmada: boolean
}

export interface ResumenRendimiento {
  filas: FilaRendimiento[]
  total: number
  visitas: number
  visitasConfirmadas: number
  fotos: number
  traslados: number
  salidas: number
  informes: number
  /** Operativas sin ninguna de las cinco señales — lo que quedó sin tocar. */
  sinNada: number
}

const txt = (s: unknown): string => String(s ?? '').trim()

/** Autores que NO identifican a una persona: el login compartido de antes de
 *  las cuentas por usuario y el import de la planilla. */
const AUTOR_SIN_DUENO = new Set(['', 'admin', 'planilla', 'sistema', 'desconocido'])

/**
 * ¿Este registro lo hizo la persona del parte?
 *
 * @param by          autor guardado (ref_checks.steps[].by, created_by de fotos/informes)
 * @param identidades cómo se llama uno en los datos (email de login + nombre).
 *                    Vacío = no filtrar (cuenta todo el equipo).
 */
export function esAutorPropio(by: unknown, identidades: string[]): boolean {
  const b = txt(by).toLowerCase()
  if (AUTOR_SIN_DUENO.has(b)) return true
  if (identidades.length === 0) return true
  return identidades.some(i => txt(i).toLowerCase() === b)
}

/** ¿La carga entra al parte? Marítima por Uruguay, con operativa de depósito. */
export function esOperativaDeposito(c: CargaRendimiento): boolean {
  if (c.archived) return false
  const m = txt(c.mode).toLowerCase()
  if (m !== 'fcl' && m !== 'lcl') return false
  if (!isPorUruguay(c.pais)) return false
  return OPERATIVAS_DEPOSITO.has(txt(c.operativa).toUpperCase())
}

/** Fecha que ubica la operativa en el tiempo: la salida si es una fecha de
 *  verdad, si no la llegada. OJO: la columna SALIDA trae valores de texto
 *  reales ('CONFIRMAR', '#N/A') que son truthy — sin este guard la carga se
 *  caía del parte en silencio, justo la que está parada en depósito. */
export function fechaDeOperativa(c: CargaRendimiento): string {
  const salida = txt(c.salida)
  if (salida && parseLocalDate(salida)) return salida
  return txt(c.eta)
}

const enRango = (iso: string, desde: string, hasta: string): boolean => {
  const d = parseLocalDate(iso)
  const a = parseLocalDate(desde)
  const b = parseLocalDate(hasta)
  if (!d || !a || !b) return false
  // Por tiempo, no por string: parseLocalDate acepta '2026-8-20' y esa forma
  // comparada como texto se caía del rango.
  return d.getTime() >= a.getTime() && d.getTime() <= b.getTime()
}

/**
 * Avisos POR CONTENEDOR contados como propios: un contenedor suma solo si lo
 * avisó uno mismo. Sin lista de contenedores (LCL, carga sin CNTR cargado) el
 * paso vale como uno solo, a nivel ref.
 */
function agregadoPropio(step: RefCheckStep | undefined, cntrList: string[], identidades: string[]): { done: number; total: number } {
  if (cntrList.length === 0) {
    const ok = !!step?.done && esAutorPropio(step?.by, identidades)
    return { done: ok ? 1 : 0, total: 1 }
  }
  let done = 0
  for (const c of cntrList) {
    const eff = avisoForCntr(step, c)
    if (eff && esAutorPropio(eff.by, identidades)) done++
  }
  return { done, total: cntrList.length }
}

/**
 * Arma el parte del período.
 *
 * @param cargas    todas las cargas (se filtran acá adentro)
 * @param checksByRef  pasos de ref_checks indexados por ref normalizada
 * @param refsConFotos ref normalizada → tiene fotos de Uruguay
 * @param refsConInforme ref normalizada → tiene informe operativo subido
 * @param desde/hasta  ISO inclusive
 */
export function buildRendimiento(args: {
  cargas: CargaRendimiento[]
  checksByRef: Map<string, RefCheckSteps>
  refsConFotos: Set<string>
  refsConInforme: Set<string>
  desde: string
  hasta: string
  /** Cómo se llama uno en los datos: identidad de login (el `by` que estampa
   *  el server) + nombre visible. Vacío = no filtrar por persona. */
  identidades?: string[]
}): ResumenRendimiento {
  const filas: FilaRendimiento[] = []
  const identidades = args.identidades || []

  // Una misma ref puede venir más de una vez (cache legacy + DB): sin dedupe
  // el denominador se infla solo y React repite la key.
  const vistas = new Set<string>()

  for (const c of args.cargas || []) {
    if (!esOperativaDeposito(c)) continue
    const fecha = fechaDeOperativa(c)
    if (!enRango(fecha, args.desde, args.hasta)) continue

    const norm = normalizeRef(c.ref)
    if (vistas.has(norm)) continue
    vistas.add(norm)

    const steps = args.checksByRef.get(norm) || {}
    const cntrList = parseCntr(txt(c.cntr))
    const fotos = args.refsConFotos.has(norm)
    // La visita es nivel CARGA (no por contenedor): se fue al depósito por la
    // operativa. El tilde de otra persona no cuenta como propio.
    const tildeVisita = !!steps.visita_deposito?.done && esAutorPropio(steps.visita_deposito?.by, identidades)
    const visita = tildeVisita || fotos

    // Los avisos son POR CONTENEDOR: el `done` de arriba significa "alguno
    // avisado". Cuenta como hecho solo si están TODOS los contenedores.
    const traslado = agregadoPropio(steps.aviso_traslado, cntrList, identidades)
    const salida = agregadoPropio(steps.aviso_salida, cntrList, identidades)

    filas.push({
      ref: c.ref,
      cliente: txt(c.cliente) || '—',
      deposito: txt(c.deposito) || '—',
      operativa: txt(c.operativa).toUpperCase(),
      fecha,
      cntrs: cntrList,
      visita,
      fotos,
      avisoTraslado: traslado.done > 0 && traslado.done === traslado.total,
      avisoTrasladoParcial: traslado.done > 0 && traslado.done < traslado.total,
      avisoSalida: salida.done > 0 && salida.done === salida.total,
      avisoSalidaParcial: salida.done > 0 && salida.done < salida.total,
      informe: args.refsConInforme.has(norm),
      // Confirmada = hay fotos. Declarada = solo el tilde.
      visitaConfirmada: fotos,
    })
  }

  // Más reciente arriba; sin fecha al final.
  filas.sort((a, b) => {
    if (!a.fecha) return 1
    if (!b.fecha) return -1
    if (a.fecha !== b.fecha) return a.fecha < b.fecha ? 1 : -1
    return a.ref.localeCompare(b.ref)
  })

  const cuenta = (f: (x: FilaRendimiento) => boolean): number => filas.filter(f).length
  return {
    filas,
    total: filas.length,
    visitas: cuenta(f => f.visita),
    visitasConfirmadas: cuenta(f => f.visitaConfirmada),
    fotos: cuenta(f => f.fotos),
    traslados: cuenta(f => f.avisoTraslado),
    salidas: cuenta(f => f.avisoSalida),
    informes: cuenta(f => f.informe),
    sinNada: cuenta(f => !f.visita && !f.fotos && !f.avisoTraslado && !f.avisoSalida && !f.informe),
  }
}

/** Depósitos visitados en el período, con las refs de cada uno. */
export function depositosVisitados(r: ResumenRendimiento): { deposito: string; refs: string[] }[] {
  const m = new Map<string, string[]>()
  for (const f of r.filas) {
    if (!f.visita) continue
    const d = f.deposito || '—'
    m.set(d, [...(m.get(d) || []), f.ref])
  }
  return [...m.entries()]
    .map(([deposito, refs]) => ({ deposito, refs }))
    .sort((a, b) => b.refs.length - a.refs.length)
}

/** Texto para pasarle el parte a alguien (WhatsApp/mail). Muestra lo hecho Y
 *  lo que falta: un parte que esconde los pendientes no aguanta una revisión. */
export function textoParte(r: ResumenRendimiento, desde: string, hasta: string): string {
  const dmy = (iso: string) => { const p = iso.split('-'); return p.length === 3 ? `${p[2]}/${p[1]}` : iso }
  const frac = (n: number) => `${n}/${r.total}`
  const deps = depositosVisitados(r)
  const lineas = [
    `Parte de operativas ${dmy(desde)} al ${dmy(hasta)} — ${r.total} operativas por depósito`,
    `• Fui al depósito: ${frac(r.visitasConfirmadas)} confirmadas con fotos${r.visitas > r.visitasConfirmadas ? ` (+${r.visitas - r.visitasConfirmadas} declaradas)` : ''}`,
    `• Traslado avisado al cliente: ${frac(r.traslados)}`,
    `• Salida avisada: ${frac(r.salidas)}`,
    `• Informe operativo: ${frac(r.informes)}`,
  ]
  if (deps.length) lineas.push(`• Depósitos: ${deps.map(d => `${d.deposito} (${d.refs.length})`).join(' · ')}`)
  // Pendiente = le falta CUALQUIERA de las cinco señales. Listar solo las de
  // los avisos dejaba afuera operativas sin visita, sin fotos y sin informe.
  const faltan = r.filas.filter(f => !f.visita || !f.fotos || !f.avisoTraslado || !f.avisoSalida || !f.informe)
  if (faltan.length) {
    lineas.push(`• Pendientes: ${faltan.slice(0, 6).map(f => f.ref).join(', ')}${faltan.length > 6 ? ` y ${faltan.length - 6} más` : ''}`)
  }
  return lineas.join('\n')
}
