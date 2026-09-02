/**
 * Avisos de partners: lo que el depósito o el transporte PROPONE sobre una carga
 * y el equipo confirma desde HOY. Ninguna de estas acciones toca la operación
 * hasta que alguien del equipo da OK (decisión de Brian, 01/09/2026).
 *
 * Este módulo es el CONTRATO compartido entre el portal de partners, la card de
 * HOY admin y la API. Nadie redefine estos tipos en otro lado.
 * Spec: docs/superpowers/specs/2026-09-01-partner-hoy-avisos-design.md
 */

export type PartnerAvisoTipo = 'retire' | 'devolvi' | 'desconsolide' | 'senasa'
export type PartnerAvisoEstado = 'pendiente' | 'confirmado' | 'rechazado'
export type PartnerRol = 'depot' | 'transport'

export interface PartnerAvisoDato {
  /** YYYY-MM-DD: cuándo pasó (retiro, devolución, desconsolidación, pedido SENASA). */
  fecha?: string
  /** Nº de stock del depósito (solo `desconsolide`). */
  stock?: string
}

export interface PartnerAviso {
  id: string
  tipo: PartnerAvisoTipo
  ref: string
  /** '' = la ref entera (LCL o carga de un solo contenedor). */
  cntr: string
  partnerRole: PartnerRol
  /** Alcance del partner: PLANIR, GODILCO, TCP, TRANSCAL, CARRARA… */
  partnerFilter: string
  partnerEmail: string
  partnerName: string
  dato: PartnerAvisoDato
  estado: PartnerAvisoEstado
  motivoRechazo: string | null
  createdAt: string
  resolvedAt: string | null
  resolvedBy: string | null
}

/** Lo que manda el partner al crear un aviso. */
export interface NuevoPartnerAviso {
  tipo: PartnerAvisoTipo
  ref: string
  cntr?: string
  dato?: PartnerAvisoDato
}

export const PARTNER_AVISO_LABEL: Record<PartnerAvisoTipo, string> = {
  retire: 'Retiró el contenedor de la terminal',
  devolvi: 'Devolvió el contenedor vacío',
  desconsolide: 'Desconsolidó la LCL (stock)',
  senasa: 'SENASA solicitado',
}

/** Qué tipo puede proponer cada rol. El transporte solo SENASA. */
export const TIPOS_POR_ROL: Record<PartnerRol, PartnerAvisoTipo[]> = {
  depot: ['retire', 'devolvi', 'desconsolide'],
  transport: ['senasa'],
}

/** HOY admin: en qué área se atiende cada tipo. `senasa` va donde esté la carga. */
export const AREA_POR_TIPO: Record<PartnerAvisoTipo, 'fcl' | 'lcl' | 'ambas'> = {
  retire: 'fcl',
  devolvi: 'fcl',
  desconsolide: 'lcl',
  senasa: 'ambas',
}

const REF = (r: string) => String(r || '').trim().toUpperCase()
const CNTR = (c: string | null | undefined) => String(c || '').trim().toUpperCase()

/** El aviso pendiente de este tipo para esta carga/contenedor, si existe. */
export function avisoPendiente(
  avisos: PartnerAviso[],
  tipo: PartnerAvisoTipo,
  ref: string,
  cntr = '',
): PartnerAviso | undefined {
  return avisos.find(a => a.estado === 'pendiente' && a.tipo === tipo && REF(a.ref) === REF(ref) && CNTR(a.cntr) === CNTR(cntr))
}

/** Último aviso de este tipo para esta carga/contenedor, en cualquier estado. */
export function ultimoAviso(
  avisos: PartnerAviso[],
  tipo: PartnerAvisoTipo,
  ref: string,
  cntr = '',
): PartnerAviso | undefined {
  return avisos
    .filter(a => a.tipo === tipo && REF(a.ref) === REF(ref) && CNTR(a.cntr) === CNTR(cntr))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
}

/** "SENASA solicitado" se deriva del aviso confirmado: no hay otra fuente. */
export function senasaSolicitado(avisos: PartnerAviso[], ref: string, cntr = ''): boolean {
  return avisos.some(a => a.tipo === 'senasa' && a.estado === 'confirmado' && REF(a.ref) === REF(ref) && (CNTR(a.cntr) === '' || CNTR(a.cntr) === CNTR(cntr)))
}

export function agruparAvisosPorEstado(avisos: PartnerAviso[]): Record<PartnerAvisoEstado, PartnerAviso[]> {
  const out: Record<PartnerAvisoEstado, PartnerAviso[]> = { pendiente: [], confirmado: [], rechazado: [] }
  for (const a of avisos) out[a.estado].push(a)
  for (const k of Object.keys(out) as PartnerAvisoEstado[]) out[k].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return out
}

/** Nº de stock válido: entre 3 y 7 dígitos (los depósitos usan 5-6). */
export function stockValido(v: string | undefined | null): boolean {
  return /^\d{3,7}$/.test(String(v ?? '').trim())
}
