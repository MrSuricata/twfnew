// ── Reglas puras de la caja de comentarios de partners ────────────────────
//
// El depósito / transporte escribe "algo no funcionó" desde su portal y el
// equipo lo lee y responde desde HOY (spec docs/superpowers/specs/
// 2026-09-04-caja-comentarios-partners-design.md). Acá vive todo lo que se
// puede probar sin Vercel ni Supabase: cómo se valida el body, cómo se sanea
// el contexto que llega del navegador, qué estado queda después de cada acción
// del equipo y cómo se traduce la fila de `partner_feedback` al contrato
// camelCase. La API (api/data/[entity].ts) solo orquesta.
//
// Sin imports de runtime fuera de zod: lo compilan Vercel (NodeNext) y vitest.
// Los TIPOS salen del contrato compartido (src/lib/partnerFeedback.ts) como
// `import type` (se borra al compilar). Las REGLAS se repiten acá a propósito
// —la API no importa código de src/— y partnerFeedbackRules.test.ts corre las
// dos implementaciones sobre la misma matriz exigiendo respuestas idénticas.

import { z } from 'zod'
import type {
  ContextoFeedback, FeedbackAccion, FeedbackEstado, PartnerComentario, ResultadoTexto,
} from '../../src/lib/partnerFeedback.js'
import type { PartnerRol } from '../../src/lib/partnerAvisos.js'

/** Espejo de los topes del contrato (y de los CHECK de `partner_feedback`). */
export const TOPE_TEXTO_API = 2000
export const TOPE_RESPUESTA_API = 2000
export const TOPE_PANTALLA_API = 160
export const TOPE_REF_API = 40
export const TOPE_CORTO_API = 120

const recortar = (v: unknown): string => String(v ?? '').trim()
const cap = (v: unknown, max: number): string => recortar(v).slice(0, max)

export const ERROR_TEXTO_VACIO_API = 'Escribí qué fue lo que no funcionó.'
export const ERROR_RESPUESTA_VACIA_API = 'Escribí la respuesta: el partner la va a ver.'

/** Espejo de `validarTexto` del contrato (mensajes incluidos). */
export function validarTextoAPI(v: unknown): ResultadoTexto {
  const texto = recortar(v)
  if (!texto) return { ok: false, error: ERROR_TEXTO_VACIO_API }
  if (texto.length > TOPE_TEXTO_API) {
    return { ok: false, error: `El comentario no puede pasar de ${TOPE_TEXTO_API} caracteres (escribiste ${texto.length}).` }
  }
  return { ok: true, texto }
}

/** Espejo de `validarRespuesta` del contrato. */
export function validarRespuestaAPI(v: unknown): ResultadoTexto {
  const texto = recortar(v)
  if (!texto) return { ok: false, error: ERROR_RESPUESTA_VACIA_API }
  if (texto.length > TOPE_RESPUESTA_API) {
    return { ok: false, error: `La respuesta no puede pasar de ${TOPE_RESPUESTA_API} caracteres (escribiste ${texto.length}).` }
  }
  return { ok: true, texto }
}

/**
 * Espejo de `sanearContexto`. Es el candado real sobre el jsonb: el cliente
 * manda lo que quiere y acá se queda SOLO con las seis claves del contrato,
 * recortadas y con tope. Sin esto, `contexto` sería un campo libre de tamaño
 * arbitrario escrito por un usuario externo.
 */
export function sanearContextoAPI(raw: unknown): ContextoFeedback {
  const o = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw as Record<string, unknown> : {}
  return {
    pantalla: cap(o.pantalla, TOPE_PANTALLA_API),
    ruta: cap(o.ruta, TOPE_CORTO_API),
    ref: cap(o.ref, TOPE_REF_API).toUpperCase(),
    navegador: cap(o.navegador, TOPE_CORTO_API),
    viewport: cap(o.viewport, 20),
    movil: o.movil === true,
  }
}

/** Espejo de `estadoTrasAccion`: nuevo → leido → respondido, nunca para atrás. */
export function estadoTrasAccionAPI(actual: FeedbackEstado, accion: FeedbackAccion): FeedbackEstado {
  if (accion === 'responder') return 'respondido'
  return actual === 'respondido' ? 'respondido' : 'leido'
}

/** Espejo de `cambiaEstado`: marcar visto dos veces no escribe la segunda. */
export function cambiaEstadoAPI(actual: FeedbackEstado, accion: FeedbackAccion): boolean {
  return accion === 'responder' || estadoTrasAccionAPI(actual, accion) !== actual
}

// ── Body del POST (partner) ──────────────────────────────────────────────
// El tope duro del schema es 10x el del negocio: un texto de 5000 caracteres
// tiene que caer con el mensaje amigable de `validarTextoAPI` ("no puede pasar
// de 2000…"), no con un error de zod. Arriba de eso ya es basura y se corta.

export const NuevoFeedbackSchema = z.object({
  texto: z.string().max(20000),
  contexto: z.unknown().optional(),
})

export interface NuevoFeedbackValidado {
  texto: string
  contexto: ContextoFeedback
}

export type ResultadoFeedback =
  | { ok: true; data: NuevoFeedbackValidado }
  | { ok: false; status: 400; error: string }

export function validarNuevoFeedback(body: unknown): ResultadoFeedback {
  const parsed = NuevoFeedbackSchema.safeParse(body)
  if (!parsed.success) {
    const error = parsed.error.issues
      .map(i => `${i.path.length ? i.path.join('.') + ': ' : ''}${i.message}`)
      .join('; ')
    return { ok: false, status: 400, error: error || 'Body inválido' }
  }
  const texto = validarTextoAPI(parsed.data.texto)
  if (!texto.ok) return { ok: false, status: 400, error: texto.error }
  return { ok: true, data: { texto: texto.texto, contexto: sanearContextoAPI(parsed.data.contexto) } }
}

// ── Body del PATCH (equipo) ──────────────────────────────────────────────

export const ResponderFeedbackSchema = z.object({
  accion: z.enum(['visto', 'responder']),
  respuesta: z.string().max(20000).optional(),
})

export interface ResponderValidado {
  accion: FeedbackAccion
  /** '' cuando la acción es 'visto'. */
  respuesta: string
}

export type ResultadoResponder =
  | { ok: true; data: ResponderValidado }
  | { ok: false; status: 400; error: string }

export function validarResponderFeedback(body: unknown): ResultadoResponder {
  const parsed = ResponderFeedbackSchema.safeParse(body)
  if (!parsed.success) {
    const error = parsed.error.issues
      .map(i => `${i.path.length ? i.path.join('.') + ': ' : ''}${i.message}`)
      .join('; ')
    return { ok: false, status: 400, error: error || 'Body inválido' }
  }
  if (parsed.data.accion === 'visto') return { ok: true, data: { accion: 'visto', respuesta: '' } }
  const r = validarRespuestaAPI(parsed.data.respuesta)
  if (!r.ok) return { ok: false, status: 400, error: r.error }
  return { ok: true, data: { accion: 'responder', respuesta: r.texto } }
}

/** Fila de `partner_feedback` → contrato camelCase (src/lib/partnerFeedback.ts). */
export function mapFilaToComentario(row: Record<string, unknown>): PartnerComentario {
  return {
    id: String(row.id ?? ''),
    partnerEmail: String(row.partner_email ?? ''),
    partnerName: String(row.partner_name ?? ''),
    partnerRole: String(row.partner_role ?? '') as PartnerRol,
    partnerFilter: String(row.partner_filter ?? ''),
    texto: String(row.texto ?? ''),
    contexto: sanearContextoAPI(row.contexto),
    estado: String(row.estado ?? 'nuevo') as FeedbackEstado,
    respuesta: String(row.respuesta ?? ''),
    respondidoPor: String(row.respondido_por ?? ''),
    respondidoAt: row.respondido_at == null ? null : String(row.respondido_at),
    createdAt: String(row.created_at ?? ''),
  }
}
