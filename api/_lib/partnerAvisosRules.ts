// ── Reglas puras de los avisos de partners ────────────────────────────────
//
// El depósito / transporte PROPONE una acción sobre una carga de su alcance y
// el equipo la confirma desde HOY (spec docs/superpowers/specs/
// 2026-09-01-partner-hoy-avisos-design.md). Acá vive todo lo que se puede
// probar sin Vercel ni Supabase: qué tipo puede cada rol, cómo se valida el
// body, cómo se traduce la fila de `partner_avisos` al contrato camelCase y
// qué patch produce cada confirmación. La API (api/data/[entity].ts) solo
// orquesta.
//
// Sin imports de runtime fuera de zod: lo compilan Vercel (NodeNext) y vitest.
// Los TIPOS salen del contrato compartido (src/lib/partnerAvisos.ts) como
// `import type` (se borra al compilar). La tabla rol→tipos se repite acá a
// propósito (la API no importa código de src/) y un test asegura que sigue
// igual al contrato.

import { z } from 'zod'
import type { PartnerAviso, PartnerAvisoDato, PartnerAvisoTipo, PartnerRol } from '../../src/lib/partnerAvisos.js'

/** Espejo de TIPOS_POR_ROL del contrato (test: partnerAvisosRules.test.ts). */
export const TIPOS_POR_ROL_API: Record<PartnerRol, PartnerAvisoTipo[]> = {
  depot: ['retire', 'devolvi', 'desconsolide'],
  transport: ['senasa'],
}

export const TIPOS_AVISO: readonly PartnerAvisoTipo[] = ['retire', 'devolvi', 'desconsolide', 'senasa']

const ISO_DIA = /^\d{4}-\d{2}-\d{2}$/
/** Mismo criterio que `stockValido` del contrato: 3 a 7 dígitos. */
const STOCK_RE = /^\d{3,7}$/

const up = (v: unknown): string => String(v ?? '').trim().toUpperCase()

export function tipoPermitido(rol: string, tipo: string): boolean {
  const lista = (TIPOS_POR_ROL_API as Record<string, PartnerAvisoTipo[]>)[rol]
  return Array.isArray(lista) && lista.includes(tipo as PartnerAvisoTipo)
}

/** Body del POST. El stock viaja como string (los depósitos escriben ceros a la izquierda). */
export const NuevoAvisoSchema = z.object({
  tipo: z.string().min(1).max(20),
  ref: z.string().max(40),
  cntr: z.string().max(40).optional(),
  dato: z.object({
    fecha: z.string().regex(ISO_DIA, 'Fecha inválida (YYYY-MM-DD)').optional(),
    stock: z.union([z.string(), z.number()]).optional(),
  }).optional(),
})

export interface NuevoAvisoValidado {
  tipo: PartnerAvisoTipo
  ref: string
  cntr: string
  dato: PartnerAvisoDato
}

export type ResultadoValidacion =
  | { ok: true; data: NuevoAvisoValidado }
  | { ok: false; status: 400 | 403; error: string }

const ROL_LABEL: Record<string, string> = { depot: 'el depósito', transport: 'el transporte' }

/**
 * Valida el body del POST según el rol del partner. `hoy` = fecha local de
 * Montevideo (YYYY-MM-DD) para el default de `dato.fecha`.
 */
export function validarNuevoAviso(rol: string, body: unknown, hoy: string): ResultadoValidacion {
  const parsed = NuevoAvisoSchema.safeParse(body)
  if (!parsed.success) {
    const error = parsed.error.issues
      .map(i => `${i.path.length ? i.path.join('.') + ': ' : ''}${i.message}`)
      .join('; ')
    return { ok: false, status: 400, error: error || 'Body inválido' }
  }
  const b = parsed.data
  const tipo = String(b.tipo).trim() as PartnerAvisoTipo
  if (!TIPOS_AVISO.includes(tipo)) return { ok: false, status: 400, error: `Tipo de aviso desconocido: ${b.tipo}` }
  if (!tipoPermitido(rol, tipo)) {
    const quien = ROL_LABEL[rol] || 'este usuario'
    return { ok: false, status: 403, error: `Ese aviso no lo puede mandar ${quien}.` }
  }
  const ref = up(b.ref)
  if (!ref) return { ok: false, status: 400, error: 'Falta la referencia de la carga' }
  const cntr = up(b.cntr)

  const dato: PartnerAvisoDato = { fecha: b.dato?.fecha || hoy }
  if (tipo === 'desconsolide') {
    const stock = String(b.dato?.stock ?? '').trim()
    if (!STOCK_RE.test(stock)) {
      return { ok: false, status: 400, error: 'Para desconsolidar hace falta el Nº de stock (3 a 7 dígitos).' }
    }
    dato.stock = stock
  }
  return { ok: true, data: { tipo, ref, cntr, dato } }
}

/** El contenedor del aviso tiene que ser de la carga ('' = la ref entera). */
export function cntrPerteneceACarga(
  cntr: string,
  carga: { CNTR?: string | null; operativas?: Array<{ CNTR_OP?: string | null }> | null },
): boolean {
  const c = up(cntr)
  if (!c) return true
  const enOps = (carga.operativas || []).some(o => up(o?.CNTR_OP) === c)
  if (enOps) return true
  return String(carga.CNTR || '').split(/[\s,;/]+/).some(x => up(x) === c)
}

/** Fila de `partner_avisos` → contrato camelCase (src/lib/partnerAvisos.ts). */
export function mapFilaToAviso(row: Record<string, unknown>): PartnerAviso {
  const dato = row.dato && typeof row.dato === 'object' ? (row.dato as PartnerAvisoDato) : {}
  return {
    id: String(row.id ?? ''),
    tipo: String(row.tipo ?? '') as PartnerAvisoTipo,
    ref: String(row.ref ?? ''),
    cntr: String(row.cntr ?? ''),
    partnerRole: String(row.partner_role ?? '') as PartnerRol,
    partnerFilter: String(row.partner_filter ?? ''),
    partnerEmail: String(row.partner_email ?? ''),
    partnerName: String(row.partner_name ?? ''),
    dato,
    estado: String(row.estado ?? 'pendiente') as PartnerAviso['estado'],
    motivoRechazo: row.motivo_rechazo == null ? null : String(row.motivo_rechazo),
    createdAt: String(row.created_at ?? ''),
    resolvedAt: row.resolved_at == null ? null : String(row.resolved_at),
    resolvedBy: row.resolved_by == null ? null : String(row.resolved_by),
  }
}

/**
 * Confirmar `devolvi`: el MISMO patch que el quick edit de LIBRE del armador /
 * operaciones (buildPerContainerPatch(op, 'libre', 'DEVUELTO')): la columna
 * `libre` + LIBRE en TODOS los contenedores del array. LIBRE es un dato de la
 * CARGA (memoria "Campos carga vs contenedor"), por eso aunque el aviso traiga
 * un contenedor se marca la carga entera — el modelo no admite un LIBRE por
 * contenedor y "DEVUELTO" vive en LIBRE, nunca en otro campo.
 */
export function patchDevolvi(row: { operativas?: unknown }): Record<string, unknown> {
  const patch: Record<string, unknown> = { libre: 'DEVUELTO' }
  if (Array.isArray(row.operativas) && row.operativas.length > 0) {
    patch.operativas = row.operativas.map((o: Record<string, unknown>) => ({ ...o, LIBRE: 'DEVUELTO' }))
  }
  return patch
}

/**
 * Confirmar `desconsolide`: mismo criterio que la bandeja de stock
 * (BandejaStock.guardar): desconsolidar ES entregar el stock, y la fecha que
 * arranca el reloj de almacenaje es la del aviso (o hoy). Si la carga ya
 * tenía `desconsol_date`, se respeta.
 */
export function patchDesconsolide(
  row: { desconsol_date?: string | null },
  dato: PartnerAvisoDato,
  hoy: string,
): Record<string, unknown> {
  return {
    stock: String(dato.stock ?? '').trim(),
    desconsol_date: String(row.desconsol_date || '').slice(0, 10) || dato.fecha || hoy,
  }
}
