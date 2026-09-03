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
/** `cancelado` = el propio partner deshizo un aviso que mandó por error
 *  (Brian 03/09: "que el depósito pueda deshacer una acción si se equivoca").
 *  NO se borra la fila: el equipo tiene que poder ver que hubo un aviso y que
 *  se canceló. */
export type PartnerAvisoEstado = 'pendiente' | 'confirmado' | 'rechazado' | 'cancelado'
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
  const out: Record<PartnerAvisoEstado, PartnerAviso[]> = { pendiente: [], confirmado: [], rechazado: [], cancelado: [] }
  for (const a of avisos) out[a.estado].push(a)
  for (const k of Object.keys(out) as PartnerAvisoEstado[]) out[k].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return out
}

/** Nº de stock válido: entre 3 y 7 dígitos (los depósitos usan 5-6). */
export function stockValido(v: string | undefined | null): boolean {
  return /^\d{3,7}$/.test(String(v ?? '').trim())
}

// ── Deshacer un aviso (Brian 03/09) ───────────────────────────────────────
// "Que el depósito pueda deshacer una acción si se equivoca."
// Dos candados, y ninguno se puede saltar:
//   1. SUYO — mismo rol y mismo alcance (PLANIR, GODILCO, TRANSCAL…). El
//      alcance NO sale del token: el server lo relee de `partner_users` en cada
//      pedido (revocación efectiva) y recién ahí llama a esta función.
//   2. PENDIENTE — si el equipo ya lo confirmó, la acción YA se aplicó sobre la
//      carga (p. ej. `devolvi` dejó LIBRE = DEVUELTO): deshacerla del lado del
//      partner dejaría los datos inconsistentes. Eso lo corrige el equipo.
// El orden importa: primero "¿es tuyo?" — a un aviso ajeno ni siquiera se le
// cuenta en qué estado está.

export type MotivoNoCancelable = 'ajeno' | 'resuelto'

export type ResultadoCancelable =
  | { puede: true }
  | { puede: false; motivo: MotivoNoCancelable; mensaje: string }

/** Lo mínimo que hace falta para decidir: sirve tanto para la fila de la DB
 *  mapeada como para el aviso que ya tiene la pantalla. */
export type AvisoCancelable = Pick<PartnerAviso, 'partnerRole' | 'partnerFilter' | 'estado'>

/** Quién pide deshacer: rol y alcance VIVOS (releídos de `partner_users`). */
export interface QuienCancela {
  rol: string
  alcance: string
}

const ALCANCE = (v: string | null | undefined) => String(v ?? '').trim().toUpperCase()

/** Mensaje de por qué no se puede, según en qué terminó el aviso. */
const NO_CANCELABLE: Record<Exclude<PartnerAvisoEstado, 'pendiente'>, string> = {
  confirmado: 'El equipo ya confirmó este aviso y la carga quedó actualizada. Si te equivocaste, escribile al equipo: lo corrigen ellos.',
  rechazado: 'El equipo ya rechazó este aviso, no hace falta deshacerlo. Podés volver a avisar cuando corresponda.',
  cancelado: 'Este aviso ya lo habías cancelado.',
}

/**
 * ¿Este partner puede deshacer este aviso? Función PURA: misma respuesta en el
 * portal (para mostrar u ocultar el botón) y en la API (que es la que manda).
 * El espejo de la API vive en `api/_lib/partnerAvisosRules.ts` y un test los
 * corre a los dos sobre la misma matriz de casos.
 */
export function puedeCancelarAviso(aviso: AvisoCancelable, quien: QuienCancela): ResultadoCancelable {
  const mismoRol = String(aviso.partnerRole || '') === String(quien.rol || '')
  const mismoAlcance = !!ALCANCE(quien.alcance) && ALCANCE(aviso.partnerFilter) === ALCANCE(quien.alcance)
  if (!mismoRol || !mismoAlcance) {
    return { puede: false, motivo: 'ajeno', mensaje: 'Ese aviso no es tuyo.' }
  }
  if (aviso.estado !== 'pendiente') {
    const mensaje = NO_CANCELABLE[aviso.estado as Exclude<PartnerAvisoEstado, 'pendiente'>]
      || 'Ese aviso ya no está pendiente.'
    return { puede: false, motivo: 'resuelto', mensaje }
  }
  return { puede: true }
}
