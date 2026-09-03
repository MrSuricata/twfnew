/**
 * Lógica pura de la card "Avisos de partners" en HOY admin (FCL y LCL).
 *
 * El contrato (tipos, etiquetas, AREA_POR_TIPO) vive en partnerAvisos.ts y NO
 * se redefine acá: este módulo solo decide qué aviso se muestra en qué HOY,
 * cómo se ordena y cómo se lee ("hace 5 min", "PLANIR marcó devuelto…").
 * Spec: docs/superpowers/specs/2026-09-01-partner-hoy-avisos-design.md
 */
import { AREA_POR_TIPO, PARTNER_AVISO_LABEL, type PartnerAviso, type PartnerAvisoTipo } from './partnerAvisos'
import { fmtDateDMY } from './format'

export type AreaHoy = 'fcl' | 'lcl'

/** Ventana de los resueltos que se muestran plegados abajo de los pendientes. */
export const HORAS_RECIENTES = 24

const normRef = (r: string | null | undefined) => String(r || '').trim().toUpperCase()

/**
 * ref → modo de la shipment, para ubicar los avisos `senasa` (van "donde esté
 * la carga"). Si la misma ref aparece con dos modos (split A/B, dos clientes),
 * gana el que NO es lcl: un aviso de un contenedor es de FCL.
 */
export function construirModoPorRef(rows: { ref: string; mode: string }[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const r of rows) {
    const ref = normRef(r.ref)
    if (!ref) continue
    const prev = out.get(ref)
    if (prev === undefined || (prev === 'lcl' && r.mode !== 'lcl')) out.set(ref, r.mode)
  }
  return out
}

/**
 * Qué avisos atiende cada HOY. retire/devolvi → FCL; desconsolide → LCL;
 * senasa → según el modo de la ref: lcl → LCL, cualquier otro modo → FCL.
 * Si la ref no está en la DB (no se puede decidir) se muestra en AMBAS antes
 * que perder el aviso: lo conservador es avisar, no esconder.
 */
export function avisosDeArea(avisos: PartnerAviso[], area: AreaHoy, modoPorRef: Map<string, string>): PartnerAviso[] {
  return avisos.filter(a => {
    const destino = AREA_POR_TIPO[a.tipo]
    if (destino !== 'ambas') return destino === area
    const modo = modoPorRef.get(normRef(a.ref))
    if (modo === undefined) return true
    return (modo === 'lcl') === (area === 'lcl')
  })
}

/**
 * Pendientes (el que más espera, primero) + resueltos de las últimas 24 h
 * (el más nuevo primero). Un resuelto sin resolvedAt no entra en recientes.
 */
export function separarAvisos(avisos: PartnerAviso[], ahora: Date = new Date()): { pendientes: PartnerAviso[]; recientes: PartnerAviso[] } {
  const limite = ahora.getTime() - HORAS_RECIENTES * 3_600_000
  const pendientes = avisos
    .filter(a => a.estado === 'pendiente')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const recientes = avisos
    .filter(a => {
      if (a.estado === 'pendiente' || !a.resolvedAt) return false
      const t = new Date(a.resolvedAt).getTime()
      return Number.isFinite(t) && t >= limite
    })
    .sort((a, b) => String(b.resolvedAt).localeCompare(String(a.resolvedAt)))
  return { pendientes, recientes }
}

/** "recién" · "hace 5 min" · "hace 2 h" · "hace 3 días". Vacío si la fecha no sirve. */
export function haceCuanto(iso: string, ahora: Date = new Date()): string {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return ''
  const min = Math.floor((ahora.getTime() - t) / 60_000)
  if (min < 1) return 'recién'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  return d === 1 ? 'hace 1 día' : `hace ${d} días`
}

/** El dato que aporta el partner: fecha (D/M/AAAA) y/o stock. */
export function textoDato(a: PartnerAviso): string {
  const partes: string[] = []
  const stock = String(a.dato?.stock || '').trim()
  if (stock) partes.push(`stock Nº ${stock}`)
  if (a.dato?.fecha) partes.push(fmtDateDMY(a.dato.fecha))
  return partes.join(' · ')
}

/** Quién avisa: el alcance (PLANIR, TRANSCAL…) es lo que el equipo reconoce. */
export function quienPartner(a: PartnerAviso): string {
  return String(a.partnerFilter || '').trim() || String(a.partnerName || '').trim() || String(a.partnerEmail || '').trim()
}

/** Verbo corto para el rastro plegado: "marcó devuelto", "marcó SENASA solicitado". */
export const VERBO_CORTO: Record<PartnerAvisoTipo, string> = {
  retire: 'marcó retirado',
  devolvi: 'marcó devuelto',
  desconsolide: 'marcó desconsolidada',
  senasa: 'marcó SENASA solicitado',
}

/** "MRKU1234567 (A7600)" · "LCL201" · "LCL201 (stock Nº 55555)". */
export function objetoAviso(a: PartnerAviso): string {
  const ref = normRef(a.ref)
  const cntr = String(a.cntr || '').trim().toUpperCase()
  if (cntr) return `${cntr} (${ref})`
  const stock = String(a.dato?.stock || '').trim()
  return stock ? `${ref} (stock Nº ${stock})` : ref
}

/** "PLANIR marcó devuelto MRKU1234567 (A7600), confirmado por Joaquín". */
export function resumenResuelto(a: PartnerAviso): string {
  const quien = a.resolvedBy?.trim() || 'el equipo'
  const base = `${quienPartner(a)} ${VERBO_CORTO[a.tipo]} ${objetoAviso(a)}`
  if (a.estado === 'rechazado') {
    const motivo = a.motivoRechazo?.trim()
    return `${base}, rechazado por ${quien}${motivo ? `: ${motivo}` : ''}`
  }
  // Lo deshizo el propio partner (Brian 03/09): nadie del equipo lo tocó, así
  // que decir "confirmado/rechazado por" sería falso. Queda igual en el rastro
  // para que se vea que hubo un aviso y que se dio de baja.
  if (a.estado === 'cancelado') return `${base}, y después lo deshizo`
  return `${base}, confirmado por ${quien}`
}

/** Etiqueta larga del tipo (del contrato), reexportada para que la card no importe dos módulos. */
export const etiquetaAviso = (tipo: PartnerAvisoTipo): string => PARTNER_AVISO_LABEL[tipo]
